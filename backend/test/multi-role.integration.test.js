import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import { createApp } from '../dist/src/app.js';
import { pool } from '../dist/src/database/pool.js';
import { config } from '../dist/src/config/env.js';
import { removeClinicalRecord } from '../dist/src/services/recordDeletionService.js';

const db = new URL(config.databaseUrl);
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname.endsWith('_test'), 'Use a disposable local _test database.');
test('multiple roles, direct entry and protected record removal', async (t) => {
  const schema = await fs.readFile(new URL('../../database/001_schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  await pool.query(await fs.readFile(new URL('../../database/002_seed_profiles.sql', import.meta.url), 'utf8'));
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await pool.end(); });
  const password = 'Synthetic-access-check-123';
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, token, method = 'GET', body) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json().catch(() => null) };
  }
  const admin = (await request('/auth/bootstrap', null, 'POST', { username: 'roles_admin', fullName: 'Roles Admin', password, roles: ['TECHNICIAN'] })).body.data;
  assert.deepEqual(admin.user.roles, ['ADMIN']);
  async function staff(name, roles) {
    const created = await request('/users', admin.token, 'POST', { username: name, fullName: name, password, roles });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return (await request('/auth/login', null, 'POST', { username: name, password })).body.data;
  }
  const tech = await staff('roles_tech', ['TECHNICIAN']);
  const auth = await staff('roles_authorizer', ['AUTHORIZER']);
  const both = await staff('roles_combined', ['AUTHORIZER', 'TECHNICIAN']);
  const doctor = await staff('roles_doctor', ['DOCTOR']);
  const it = await staff('roles_it', ['IT']);
  const catalogueManager = await staff('roles_catalogue_manager', ['CATALOGUE_MANAGER']);
  const secondAdmin = await staff('roles_second_admin', ['DOCTOR', 'ADMIN']);
  const hybrid = await staff('roles_it_doctor', ['IT', 'DOCTOR']);
  const profile = (await request('/profiles', admin.token)).body.data.find((p) => p.code === 'UPT');
  const orderInput = { patientName: 'Synthetic Role Patient', uhid: 'ROLE-ACCESS-001', sampleDate: new Date().toISOString(), profileIds: [profile.id], entryMode: 'RESULTS' };
  let order;
  await t.test('existing single roles survive migration; arrays and union permissions persist', async () => {
    await pool.query(schema); await pool.query(schema);
    for (const user of [admin, tech, auth, both, doctor, it, catalogueManager, secondAdmin, hybrid]) {
      const me = (await request('/auth/me', user.token)).body.data.user;
      assert.deepEqual(me.roles, user.user.roles);
    }
    assert.ok(both.user.permissions.includes('result.enter'));
    assert.ok(both.user.permissions.includes('result.authorize'));
    assert.ok(!both.user.permissions.includes('report.delete'));
    assert.deepEqual(catalogueManager.user.permissions.sort(), ['catalogue.delete', 'catalogue.manage']);
    assert.equal((await request('/clinical/orders', hybrid.token)).status, 200);
    assert.equal((await request('/users', hybrid.token)).status, 200);
    assert.equal((await request('/profiles', hybrid.token)).status, 403);
  });
  await t.test('reject empty, duplicate, invalid and inconsistent role assignments', async () => {
    for (const roles of [[], ['TECHNICIAN', 'TECHNICIAN'], ['SUPERUSER'], null]) {
      assert.equal((await request('/users', admin.token, 'POST', { username: 'bad_roles', fullName: 'Bad Roles', password, roles })).status, 400);
    }
    assert.equal((await request('/users', admin.token, 'POST', { username: 'bad_roles', fullName: 'Bad Roles', password, roles: ['TECHNICIAN'], role: 'ADMIN' })).status, 400);
    assert.equal((await request(`/users/${admin.user.id}`, admin.token, 'PUT', { fullName: 'Admin', roles: ['ADMIN', 'TECHNICIAN'], active: true })).status, 409);
  });
  await t.test('IT cannot smuggle elevated roles or edit an administrator in any array position', async () => {
    for (const roles of [['TECHNICIAN', 'ADMIN'], ['DOCTOR', 'IT'], ['TECHNICIAN', 'CATALOGUE_MANAGER']]) {
      assert.equal((await request('/users', it.token, 'POST', { username: 'forbidden_roles', fullName: 'Forbidden', password, roles })).status, 403);
      assert.equal((await request(`/users/${both.user.id}`, it.token, 'PUT', { fullName: 'Combined', roles, active: true })).status, 403);
    }
    assert.equal((await request(`/users/${secondAdmin.user.id}`, it.token, 'PUT', { fullName: 'Changed', roles: ['DOCTOR'], active: true })).status, 403);
    assert.equal((await request('/users', both.token, 'POST', { username: 'forbidden_staff', fullName: 'Forbidden', password, roles: ['ADMIN'] })).status, 403);
  });
  await t.test('only technician/admin grants permit direct entry and both grants permit same-person authorization', async () => {
    for (const user of [auth, doctor, it]) assert.equal((await request('/orders', user.token, 'POST', orderInput)).status, 403);
    const created = await request('/orders', both.token, 'POST', orderInput);
    assert.equal(created.status, 201); order = created.body.data;
    assert.equal(order.sample_status, 'IN_PROCESS');
    assert.deepEqual(order.audit.map((a) => a.event_type).sort(), ['ORDER_CREATED', 'SAMPLES_ACCEPTED', 'SAMPLE_PROCESSING_STARTED']);
    assert.equal((await request(`/orders/${order.id}/authorize`, both.token, 'POST')).status, 400);
    const values = { results: [{ id: order.tests[0].results[0].id, value: 'Negative' }] };
    assert.equal((await request(`/orders/${order.id}/results`, auth.token, 'PUT', values)).status, 403);
    assert.equal((await request(`/orders/${order.id}/results`, both.token, 'PUT', values)).status, 200);
    assert.equal((await request(`/orders/${order.id}/authorize`, tech.token, 'POST')).status, 403);
    assert.equal((await request(`/orders/${order.id}/authorize`, both.token, 'POST')).status, 200);
    assert.equal((await request(`/orders/${order.id}/results`, both.token, 'PUT', values)).status, 409);
  });
  await t.test('role revocation takes effect on an already issued token; forged token roles add no privilege', async () => {
    const change = await request(`/users/${both.user.id}`, admin.token, 'PUT', { fullName: 'Combined', roles: ['AUTHORIZER'], active: true });
    assert.equal(change.status, 200);
    assert.equal((await request('/orders', both.token, 'POST', orderInput)).status, 403);
    const forged = jwt.sign({ ...tech.user, role: 'ADMIN', roles: ['ADMIN'] }, config.jwtSecret);
    assert.equal((await request('/users', forged)).status, 403);
    await request(`/users/${both.user.id}`, admin.token, 'PUT', { fullName: 'Combined', roles: ['AUTHORIZER', 'TECHNICIAN'], active: true });
    await request(`/users/${hybrid.user.id}`, admin.token, 'PUT', { fullName: 'Disabled', roles: ['IT', 'DOCTOR'], active: false });
    assert.equal((await request('/clinical/orders', hybrid.token)).status, 401);
  });
  const deletion = () => ({ reason: 'Synthetic duplicate record removal', password, confirmationAccession: order.accession_no });
  await t.test('all non-admin roles denied; reason/password/accession required; direct service cannot bypass DB identity', async () => {
    for (const user of [tech, auth, both, doctor, it]) assert.equal((await request(`/orders/${order.id}`, user.token, 'DELETE', deletion())).status, 403);
    assert.equal((await request(`/orders/${order.id}`, null, 'DELETE', deletion())).status, 401);
    assert.equal((await request(`/orders/${order.id}`, admin.token, 'DELETE', { reason: 'Remove record' })).status, 400);
    assert.equal((await request(`/orders/${order.id}`, admin.token, 'DELETE', { ...deletion(), reason: 'x' })).status, 400);
    assert.equal((await request(`/orders/${order.id}`, admin.token, 'DELETE', { ...deletion(), confirmationAccession: 'OTHER-REPORT' })).status, 409);
    await assert.rejects(removeClinicalRecord(deletion(), order.id, { ...tech.user, role: 'ADMIN', roles: ['ADMIN'] }), (e) => e.statusCode === 403);
    assert.equal((await request(`/orders/${order.id}`, admin.token)).status, 200);
  });
  await t.test('password confirmation has persistent throttling and does not log passwords', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await request(`/orders/${order.id}`, admin.token, 'DELETE', { ...deletion(), password: 'Wrong-secret-not-in-audit' })).status, 403);
    assert.equal((await request(`/orders/${order.id}`, admin.token, 'DELETE', deletion())).status, 429);
    const audit = await pool.query("SELECT details FROM system_audit_events WHERE event_type = 'RECORD_REMOVAL_DENIED'");
    assert.equal(audit.rows.length, 5); assert.doesNotMatch(JSON.stringify(audit.rows), /Wrong-secret|Synthetic-access-check/);
    // Simulate the expiry of the throttle window in this disposable database.
    await pool.query("UPDATE users SET sensitive_attempt_window = NOW() - INTERVAL '16 minutes' WHERE id=$1", [admin.user.id]);
  });
  await t.test('admin removal is atomic, hides patient snapshot everywhere, and retains results/history', async () => {
    const attempts = await Promise.all([request(`/orders/${order.id}`, admin.token, 'DELETE', deletion()), request(`/orders/${order.id}`, secondAdmin.token, 'DELETE', deletion())]);
    assert.deepEqual(attempts.map((r) => r.status).sort(), [204, 404]);
    for (const path of [`/orders/${order.id}`, `/clinical/orders/${order.id}`, `/clinical/orders/${order.id}/results`, `/clinical/orders/${order.id}/report.pdf`]) assert.equal((await request(path, admin.token)).status, 404);
    assert.equal((await request('/clinical/orders?query=ROLE-ACCESS-001', doctor.token)).body.data.items.length, 0);
    assert.equal((await request('/patient-history?query=ROLE-ACCESS-001', tech.token)).body.data.length, 0);
    assert.equal((await request(`/worklist?date=${orderInput.sampleDate.slice(0,10)}&query=ROLE-ACCESS-001`, tech.token)).body.data.length, 0);
    assert.equal((await request(`/orders/${order.id}/prepare-entry`, tech.token, 'POST')).status, 404);
    assert.equal((await request(`/clinical/orders/${order.id}/notes`, doctor.token, 'POST', { body: 'Cannot append to removed record' })).status, 404);
    const stored = (await pool.query('SELECT patient_name, deleted_at, deletion_reason FROM lab_orders WHERE id=$1', [order.id])).rows[0];
    assert.ok(stored.deleted_at); assert.equal(stored.patient_name, orderInput.patientName); assert.equal(stored.deletion_reason, deletion().reason);
    const results = (await pool.query('SELECT r.result_value FROM test_results r JOIN order_tests t ON t.id=r.order_test_id WHERE t.order_id=$1', [order.id])).rows;
    assert.equal(results[0].result_value, 'Negative');
    const audit = (await pool.query("SELECT details FROM audit_events WHERE order_id=$1 AND event_type='REPORT_DELETED'", [order.id])).rows;
    assert.equal(audit.length, 1); assert.equal(audit[0].details.action, 'VOID');
  });
});
