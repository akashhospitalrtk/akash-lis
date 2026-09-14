import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AppError } from '../core/AppError.js';
import { pool, withTransaction, type DbClient } from '../database/pool.js';
import type { AccountPayload, LoginInput, SessionUser, UpdateAccountInput, DepartmentInput } from '../schemas/authSchemas.js';
import { permissionsFor } from './permissionService.js';
import { addSystemAudit } from './auditService.js';

type AccountRow = { id: string; username: string; full_name: string; role: SessionUser['role']; designation: string | null; signature_label: string | null; active: boolean; created_at: Date; departments: { id: string; name: string }[] };
const accountSelect = `SELECT u.id, u.username, u.full_name, u.role, u.designation, u.signature_label, u.active, u.created_at,
  COALESCE((SELECT json_agg(json_build_object('id', d.id, 'name', d.name) ORDER BY d.name)
  FROM user_departments ud JOIN departments d ON d.id = ud.department_id WHERE ud.user_id = u.id), '[]') AS departments FROM users u`;

export async function loadSession(id: string): Promise<SessionUser> {
  const user = (await pool.query<AccountRow>(`${accountSelect} WHERE u.id = $1 AND u.active = TRUE`, [id])).rows[0];
  if (!user) throw AppError.unauthorized('Your account is unavailable. Please contact hospital IT.');
  return { id: user.id, username: user.username, fullName: user.full_name, role: user.role, designation: user.designation, departments: user.departments, permissions: permissionsFor(user.role) };
}
async function sessionFor(id: string) {
  const user = await loadSession(id);
  return { token: jwt.sign(user, config.jwtSecret, { expiresIn: '12h' }), user };
}
export async function setupStatus() { return { initialized: Boolean((await pool.query('SELECT id FROM users LIMIT 1')).rows[0]) }; }
export async function bootstrap(input: AccountPayload) {
  const hash = await bcrypt.hash(input.password, 12);
  const id = await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(610011)');
    if ((await client.query('SELECT id FROM users LIMIT 1')).rows[0]) throw AppError.conflict('The first account has already been created.');
    const user = (await client.query(`INSERT INTO users (username, password_hash, full_name, role, designation, signature_label)
      VALUES ($1, $2, $3, 'ADMIN', $4, $5) RETURNING id`, [input.username.toLowerCase(), hash, input.fullName, input.designation || null, input.signatureLabel || null])).rows[0];
    await addSystemAudit(client, user.id, 'ADMIN_BOOTSTRAPPED');
    return user.id as string;
  });
  return sessionFor(id);
}
export async function login(input: LoginInput) {
  const user = (await pool.query<{ id: string; password_hash: string }>('SELECT id, password_hash FROM users WHERE username = $1 AND active = TRUE', [input.username.toLowerCase()])).rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) throw AppError.unauthorized('Username or password is incorrect.');
  return sessionFor(user.id);
}
export async function listUsers() { return (await pool.query<AccountRow>(`${accountSelect} ORDER BY u.full_name`)).rows; }
function checkAssignment(actor: SessionUser, role: SessionUser['role'], existing?: AccountRow) {
  if (!['ADMIN', 'IT'].includes(actor.role)) throw AppError.forbidden();
  if (actor.role === 'IT' && ([role, existing?.role].some((value) => value === 'ADMIN' || value === 'IT'))) {
    throw AppError.forbidden('Only an administrator can create or change administrator and IT accounts.');
  }
}
async function assignDepartments(client: DbClient, userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if ((await client.query('SELECT id FROM departments WHERE id = ANY($1::uuid[])', [unique])).rows.length !== unique.length) throw new AppError('Choose existing departments.');
  await client.query('DELETE FROM user_departments WHERE user_id = $1', [userId]);
  for (const id of unique) await client.query('INSERT INTO user_departments (user_id, department_id) VALUES ($1, $2)', [userId, id]);
}
export async function createUser(input: AccountPayload, actor: SessionUser) {
  checkAssignment(actor, input.role);
  const hash = await bcrypt.hash(input.password, 12);
  return withTransaction(async (client) => {
    const { id } = (await client.query(`INSERT INTO users (username, password_hash, full_name, role, designation, signature_label)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [input.username.toLowerCase(), hash, input.fullName, input.role, input.designation || null, input.signatureLabel || null])).rows[0];
    await assignDepartments(client, id, input.departmentIds);
    await addSystemAudit(client, actor.id, 'STAFF_CREATED', { userId: id, role: input.role, departmentIds: input.departmentIds });
    return (await client.query<AccountRow>(`${accountSelect} WHERE u.id = $1`, [id])).rows[0];
  });
}
export async function updateUser(id: string, input: UpdateAccountInput, actor: SessionUser) {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(610012)');
    const before = (await client.query<AccountRow>(`${accountSelect} WHERE u.id = $1 FOR UPDATE OF u`, [id])).rows[0];
    if (!before) throw AppError.notFound('Staff account not found.');
    checkAssignment(actor, input.role, before);
    if (id === actor.id && (!input.active || input.role !== before.role)) throw AppError.conflict('You cannot disable or change the role of your own account.');
    if (before.role === 'ADMIN' && before.active && (!input.active || input.role !== 'ADMIN')) {
      const count = (await client.query("SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND active = TRUE")).rows[0].n;
      if (count <= 1) throw AppError.conflict('Keep at least one active administrator.');
    }
    await client.query('UPDATE users SET full_name = $1, role = $2, designation = $3, signature_label = $4, active = $5 WHERE id = $6', [input.fullName, input.role, input.designation || null, input.signatureLabel || null, input.active, id]);
    await assignDepartments(client, id, input.departmentIds);
    await addSystemAudit(client, actor.id, 'STAFF_ACCESS_UPDATED', { userId: id, before: { role: before.role, active: before.active, departmentIds: before.departments.map((d) => d.id) }, after: { role: input.role, active: input.active, departmentIds: input.departmentIds } });
    return (await client.query<AccountRow>(`${accountSelect} WHERE u.id = $1`, [id])).rows[0];
  });
}
export async function listDepartments() { return (await pool.query('SELECT id, name FROM departments ORDER BY name')).rows; }
export async function createDepartment(input: DepartmentInput, actor: SessionUser) {
  return withTransaction(async (client) => {
    const department = (await client.query('INSERT INTO departments (name) VALUES ($1) RETURNING id, name', [input.name])).rows[0];
    await addSystemAudit(client, actor.id, 'DEPARTMENT_CREATED', department);
    return department;
  });
}
