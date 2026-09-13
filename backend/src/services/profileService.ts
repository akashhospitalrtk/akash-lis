import { pool, withTransaction, type DbClient } from '../database/pool.js';
import { AppError } from '../core/AppError.js';
import { getDescriptionLibrary } from './descriptionService.js';
import { planParameters, writeParameters } from './catalogueService.js';
import { catalogueAudit } from './auditService.js';
import { profileSchema, type ProfileInput } from '../schemas/profileSchemas.js';
import type { ProfileRow, ParameterRow } from '../types/database.js';
function normalizedProfile(row: ProfileRow, parameters: ParameterRow[]) {
  return { ...row, parameters: parameters.filter((parameter) => parameter.profile_id === row.id) };
}

async function readProfiles({ includeInactive = false, client = pool }: { includeInactive?: boolean; client?: DbClient } = {}) {
  const profiles = (await client.query(`SELECT * FROM test_profiles ${includeInactive ? '' : 'WHERE active = TRUE'} ORDER BY department, name`)).rows;
  const parameters = (await client.query(`SELECT * FROM profile_parameters ${includeInactive ? '' : 'WHERE active = TRUE'} ORDER BY sort_order, name`)).rows;
  return profiles.map((profile) => normalizedProfile(profile, parameters));
}



export async function descriptions() {
  return await getDescriptionLibrary();
}

export async function activeProfiles() {
  return await readProfiles();
}

export async function catalogueProfiles() {
  return await readProfiles({ includeInactive: true });
}

export async function profileAudit(profileId: string) {
  const { rows } = await pool.query(`SELECT a.*, u.full_name AS user_name FROM catalogue_audit_events a LEFT JOIN users u ON u.id = a.user_id WHERE a.profile_id = $1 ORDER BY a.created_at DESC LIMIT 30`, [profileId]);
  return rows;
}

export async function createProfile(input: ProfileInput, userId: string) {
  const payload = input;
  const profile = await withTransaction(async (client) => {
    const { rows } = await client.query(`INSERT INTO test_profiles (code, name, department, specimen_type, turnaround_time, instructions, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [payload.code, payload.name, payload.department, payload.specimenType || null, payload.turnaroundTime || null, payload.instructions || null, payload.description ?? null]);
    const plan = planParameters([], payload.parameters);
    await writeParameters(client, rows[0].id, plan);
    await catalogueAudit(client, rows[0].id, userId, 'INVESTIGATION_CREATED', { code: payload.code, parameters: payload.parameters.length });
    return rows[0];
  });
  return (await readProfiles({ includeInactive: true })).find((item) => item.id === profile.id);
}

export async function updateProfile(input: ProfileInput, profileId: string, userId: string) {
  
  const profile = await withTransaction(async (client) => {
    const current = (await client.query('SELECT * FROM test_profiles WHERE id = $1 FOR UPDATE', [profileId])).rows[0];
    if (!current) throw new AppError('Investigation not found.', 404);
    const existing = (await client.query('SELECT * FROM profile_parameters WHERE profile_id = $1 FOR UPDATE', [current.id])).rows;
    const plan = planParameters(existing, input.parameters);
    const payload = profileSchema.parse({ ...input, parameters: plan.parameters });
    plan.parameters = payload.parameters.map((parameter, index) => ({ ...parameter, id: plan.parameters[index].id, calculationFormula: parameter.calculationFormula, existing: plan.parameters[index].existing }));
    const { rows } = await client.query(`UPDATE test_profiles SET name = $1, department = $2, specimen_type = $3, turnaround_time = $4, instructions = $5, code = $7, description = COALESCE($8, description) WHERE id = $6 RETURNING *`, [payload.name, payload.department, payload.specimenType || null, payload.turnaroundTime || null, payload.instructions || null, current.id, payload.code, payload.description ?? null]);
    await writeParameters(client, current.id, plan);
    await catalogueAudit(client, current.id, userId, 'INVESTIGATION_UPDATED', { previousCode: current.code, code: payload.code, parameterCodeChanges: plan.codeChanges, before: { ...current, parameters: existing }, after: payload });
    return rows[0];
  });
  return (await readProfiles({ includeInactive: true })).find((item) => item.id === profile.id);
}

export async function archiveProfile(profileId: string, userId: string) {
  await withTransaction(async (client) => {
    const { rows } = await client.query('UPDATE test_profiles SET active = FALSE WHERE id = $1 AND active = TRUE RETURNING id, code', [profileId]);
    if (!rows[0]) throw new AppError('Active investigation not found.', 404);
    await catalogueAudit(client, rows[0].id, userId, 'INVESTIGATION_ARCHIVED', { code: rows[0].code });
  });
  return;
}

export async function restoreProfile(profileId: string, userId: string) {
  const profile = await withTransaction(async (client) => {
    const { rows } = await client.query('UPDATE test_profiles SET active = TRUE WHERE id = $1 RETURNING *', [profileId]);
    if (!rows[0]) throw new AppError('Investigation not found.', 404);
    await catalogueAudit(client, rows[0].id, userId, 'INVESTIGATION_RESTORED', { code: rows[0].code });
    return rows[0];
  });
  return (await readProfiles({ includeInactive: true })).find((item) => item.id === profile.id);
}
