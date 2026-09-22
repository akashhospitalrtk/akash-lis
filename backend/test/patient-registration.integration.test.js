import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createApp } from '../dist/src/app.js';
import { config } from '../dist/src/config/env.js';
import { pool } from '../dist/src/database/pool.js';
import { prisma } from '../dist/src/database/prisma.js';

const db = new URL(config.databaseUrl);
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname.endsWith('_test'), 'Disposable local _test database only.');

test('admin patient corrections, publication protection, and registration removal', async (t) => {
  await pool.query(await fs.readFile(new URL('../../database/001_schema.sql', import.meta.url), 'utf8'));
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect(); await pool.end();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const password = 'Synthetic-registration-only-123';
  async function request(path, token, method = 'GET', body) {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  const adminResponse = await request('/auth/bootstrap', null, 'POST', { username: 'patient_admin', fullName: 'Synthetic Admin', password });
  assert.equal(adminResponse.status, 201);
  const admin = adminResponse.body.data;
  const otherTokens = [];
  for (const role of ['TECHNICIAN', 'AUTHORIZER', 'DOCTOR', 'IT', 'CATALOGUE_MANAGER']) {
    const username = `patient_${role.toLowerCase()}`;
    assert.equal((await request('/users', admin.token, 'POST', { username, fullName: username, password, roles: [role] })).status, 201);
    otherTokens.push((await request('/auth/login', null, 'POST', { username, password })).body.data.token);
  }
  const profile = (await pool.query("INSERT INTO test_profiles (code, name) VALUES ('PATIENT_TEST', 'Synthetic age/sex test') RETURNING id")).rows[0];
  await pool.query(`INSERT INTO profile_parameters (profile_id, code, name, result_kind, reference_ranges)
    VALUES ($1, 'VALUE', 'Synthetic measurement', 'NUMERIC', $2)`, [profile.id, JSON.stringify([
    { gender: 'Male', ageMin: 0, ageMax: 130, low: 10, high: 20 },
    { gender: 'Female', ageMin: 0, ageMax: 1, low: 1, high: 8 },
    { gender: 'Female', ageMin: 2, ageMax: 130, low: 10, high: 20 }
  ])]);
  async function create() {
    const res = await request('/orders', admin.token, 'POST', {
      patientName: 'Synthetic Original', patientSource: 'HOSPITAL', externalPatientId: 'synthetic-external-id',
      uhid: 'DEMO-PATIENT', ageValue: 20, ageUnit: 'years', gender: 'Male',
      sampleDate: new Date().toISOString(), profileIds: [profile.id], entryMode: 'RESULTS'
    });
    assert.equal(res.status, 201); return res.body.data;
  }
  let order = await create();
  const sibling = await create();
  const payload = (current, overrides = {}) => ({
    patientName: 'Synthetic Corrected', uhid: 'DEMO-CORRECTED', ageValue: 3, ageUnit: 'months',
    gender: 'Female', mobile: '0000000000', referringDoctor: 'Demo Doctor', patientType: 'OPD',
    reason: 'Correct synthetic registration mistake', expectedUpdatedAt: current.updated_at, ...overrides
  });
  const endpoint = `/orders/${order.id}/patient`;
  await t.test('authentication, admin-only edit, and validation enforce the boundary', async () => {
    assert.equal((await request(endpoint, null, 'PUT', payload(order))).status, 401);
    for (const token of otherTokens) assert.equal((await request(endpoint, token, 'PUT', payload(order))).status, 403);
    for (const change of [{ patientName: 'x' }, { ageValue: -1 }, { ageValue: 131, ageUnit: 'years' }, { reason: 'x' }, { expectedUpdatedAt: undefined }, { externalPatientId: 'other' }, { patientSource: 'MANUAL' }, { sampleDate: new Date().toISOString() }]) {
      assert.equal((await request(endpoint, admin.token, 'PUT', payload(order, change))).status, 400);
    }
    assert.equal((await request(`/orders/${order.id}`, admin.token)).body.data.patient_name, 'Synthetic Original');
  });
  await t.test('edit persists audited demographics, recalculates flags, and preserves measurements/HMS link', async () => {
    order = (await request(`/orders/${order.id}/results`, admin.token, 'PUT', { results: [{ id: order.tests[0].results[0].id, value: '15' }] })).body.data;
    assert.equal(order.tests[0].results[0].abnormal_flag, null);
    const stale = payload(order);
    const res = await request(endpoint, admin.token, 'PUT', stale);
    assert.equal(res.status, 200, JSON.stringify(res.body)); order = res.body.data;
    assert.equal(order.patient_name, 'Synthetic Corrected');
    assert.equal(Number(order.age_value), 3); assert.equal(order.age_unit, 'months'); assert.equal(order.age_years, 0);
    assert.equal(order.tests[0].results[0].result_value, '15'); assert.equal(order.tests[0].results[0].abnormal_flag, 'H');
    assert.equal(order.patient_source, 'HOSPITAL'); assert.equal(order.external_patient_id, 'synthetic-external-id');
    assert.equal(order.mobile, '0000000000'); assert.equal(order.referring_doctor, 'Demo Doctor');
    const audit = order.audit.find((event) => event.event_type === 'PATIENT_DETAILS_UPDATED');
    assert.equal(audit.details.before.patientName, 'Synthetic Original'); assert.equal(audit.details.after.patientName, 'Synthetic Corrected');
    assert.equal(audit.details.flagChanges.length, 1); assert.equal(audit.details.reason, stale.reason);
    assert.equal((await request(endpoint, admin.token, 'PUT', stale)).status, 409);
    assert.equal((await request(`/orders/${sibling.id}`, admin.token)).body.data.patient_name, 'Synthetic Original');
  });
  await t.test('concurrent corrections cannot silently overwrite each other', async () => {
    const concurrent = await Promise.all(['First Name', 'Second Name'].map((patientName) => request(endpoint, admin.token, 'PUT', payload(order, { patientName }))));
    assert.deepEqual(concurrent.map((res) => res.status).sort(), [200, 409]);
    order = concurrent.find((res) => res.status === 200).body.data;
  });
  await t.test('published snapshot requires amendment; amended demographic corrections remain blocked from doctors until release', async () => {
    order = (await request(`/orders/${order.id}/authorize`, admin.token, 'POST')).body.data;
    const publishedName = order.patient_name;
    assert.equal((await request(endpoint, admin.token, 'PUT', payload(order))).status, 409);
    order = (await request(`/orders/${order.id}/amend`, admin.token, 'POST', { reason: 'Correct patient identity on synthetic report' })).body.data;
    const res = await request(endpoint, admin.token, 'PUT', payload(order, { ageValue: null, gender: null }));
    assert.equal(res.status, 200); order = res.body.data;
    assert.equal(order.age_value, null); assert.equal(order.age_years, null); assert.equal(order.gender, null);
    assert.equal(order.tests[0].results[0].abnormal_flag, null);
    const saved = (await pool.query('SELECT report_snapshot FROM report_amendments WHERE order_id = $1', [order.id])).rows[0];
    assert.equal(saved.report_snapshot.patient_name, publishedName);
    assert.equal((await request(`/clinical/orders/${order.id}/results`, otherTokens[2])).status, 409);
    assert.equal((await request(`/orders/${order.id}/results`, admin.token, 'PUT', { results: [{ id: order.tests[0].results[0].id, value: '15' }] })).status, 200);
    assert.equal((await request(`/orders/${order.id}/authorize`, admin.token, 'POST')).status, 200);
  });
  await t.test('deletion removes draft/published registrations from active searches, retaining audit and sibling orders', async () => {
    for (const target of [order, await create()]) {
      const removal = { reason: 'Remove synthetic demo registration', password, confirmationAccession: target.accession_no };
      assert.equal((await request(`/orders/${target.id}`, otherTokens[0], 'DELETE', removal)).status, 403);
      assert.equal((await request(`/orders/${target.id}`, admin.token, 'DELETE', { ...removal, password: 'wrong' })).status, 403);
      assert.equal((await request(`/orders/${target.id}`, admin.token, 'DELETE', removal)).status, 204);
      assert.equal((await request(`/orders/${target.id}`, admin.token)).status, 404);
      assert.equal((await request(`/orders/${target.id}/patient`, admin.token, 'PUT', payload(target))).status, 404);
      const listed = (await request(`/clinical/orders?query=${target.accession_no}`, admin.token)).body.data.items;
      assert.equal(listed.length, 0);
      assert.equal((await request(`/patient-history?query=${target.accession_no}`, admin.token)).body.data.length, 0);
      assert.ok((await pool.query('SELECT deleted_at FROM lab_orders WHERE id = $1', [target.id])).rows[0].deleted_at);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE order_id = $1 AND event_type = 'REPORT_DELETED'", [target.id])).rows[0].n, 1);
    }
    assert.equal((await request(`/orders/${sibling.id}`, admin.token)).status, 200);
  });
});
