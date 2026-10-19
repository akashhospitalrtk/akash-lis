import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createApp } from '../dist/src/app.js';
import { pool } from '../dist/src/database/pool.js';
import { config } from '../dist/src/config/env.js';

const url = new URL(config.databaseUrl);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.endsWith('_test'), 'Disposable local test database required.');

test('doctor publication, clinical notes, downloads and staff access control', async (t) => {
  const schema = await fs.readFile(new URL('../../database/001_schema.sql', import.meta.url), 'utf8');
  await pool.query(schema); await pool.query(schema);
  await pool.query(await fs.readFile(new URL('../../database/002_seed_profiles.sql', import.meta.url), 'utf8'));
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await pool.end(); });
  const password = 'Synthetic-only-test-123';
  let admin, it, doctor, tech, authorizer, department, order, noteId;
  async function request(path, token, method = 'GET', body) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const pdf = response.headers.get('content-type')?.includes('application/pdf');
    return { status: response.status, headers: response.headers, body: pdf ? Buffer.from(await response.arrayBuffer()) : await response.json().catch(() => null) };
  }
  async function account(role, token = admin.token) {
    const created = await request('/users', token, 'POST', { fullName: `Synthetic ${role}`, username: `doctor_test_${role.toLowerCase()}`, password, role, departmentIds: department ? [department.id] : [] });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.password_hash, undefined);
    const signed = await request('/auth/login', null, 'POST', { username: created.body.data.username, password });
    assert.equal(signed.status, 200);
    return { ...signed.body.data, account: created.body.data };
  }
  await t.test('admin creates departments and delegates clinical staff management to IT', async () => {
    admin = (await request('/auth/bootstrap', null, 'POST', { username: 'doctor_test_admin', fullName: 'Synthetic Admin', password })).body.data;
    const created = await request('/departments', admin.token, 'POST', { name: 'Medicine' });
    assert.equal(created.status, 201); department = created.body.data;
    assert.equal((await request('/departments', admin.token, 'POST', { name: 'medicine' })).status, 409);
    it = await account('IT'); doctor = await account('DOCTOR', it.token); tech = await account('TECHNICIAN', it.token); authorizer = await account('AUTHORIZER', it.token);
    assert.deepEqual(doctor.user.departments, [department]);
    assert.deepEqual(doctor.user.permissions, ['patient.view', 'result.view', 'report.print', 'report.download', 'status.view', 'clinical_notes.write']);
    assert.equal((await request('/users', doctor.token)).status, 403);
    assert.equal((await request('/departments', doctor.token, 'POST', { name: 'No' })).status, 403);
  });
  await t.test('IT cannot grant administrator/IT or access patient data', async () => {
    for (const role of ['ADMIN', 'IT']) {
      assert.equal((await request('/users', it.token, 'POST', { username: `forbidden_${role}`, fullName: 'Forbidden Role', password, role })).status, 403);
      assert.equal((await request(`/users/${doctor.user.id}`, it.token, 'PUT', { fullName: doctor.user.fullName, role, active: true })).status, 403);
    }
    assert.equal((await request(`/users/${admin.user.id}`, it.token, 'PUT', { fullName: 'No change', role: 'DOCTOR', active: false })).status, 403);
    for (const path of ['/clinical/orders', '/worklist', '/profiles', '/external-patients?query=test', '/records/export?from=2026-09-01&to=2026-09-02']) assert.equal((await request(path, it.token)).status, 403, path);
    assert.equal((await request(`/users/${admin.user.id}`, admin.token, 'PUT', { fullName: 'Admin', role: 'ADMIN', active: false })).status, 409);
    assert.equal((await request('/users', admin.token, 'POST', { username: 'invalid_department', fullName: 'Bad department', password, role: 'DOCTOR', departmentIds: ['00000000-0000-4000-8000-000000000099'] })).status, 400);
  });
  await t.test('doctors see all-hospital patient status but no draft result payload', async () => {
    const profiles = (await request('/profiles', tech.token)).body.data;
    const created = await request('/orders', tech.token, 'POST', { patientName: 'Synthetic Doctor Patient', uhid: 'DOCTOR-TEST-001', sampleDate: new Date().toISOString(), profileIds: [profiles.find((p) => p.code === 'UPT').id], entryMode: 'RESULTS' });
    assert.equal(created.status, 201); order = created.body.data;
    const saved = await request(`/orders/${order.id}/results`, tech.token, 'PUT', { results: [{ id: order.tests[0].results[0].id, value: 'Negative', comments: 'DRAFT-PRIVATE-COMMENT' }] });
    assert.equal(saved.status, 200);
    const list = await request('/clinical/orders?query=DOCTOR-TEST-001', doctor.token);
    assert.equal(list.status, 200); assert.equal(list.body.data.items.length, 1); assert.equal(list.body.data.items[0].status, 'COMPLETED');
    const detail = await request(`/clinical/orders/${order.id}`, doctor.token);
    assert.equal(detail.status, 200); assert.equal(typeof detail.body.data.tests, 'string');
    assert.doesNotMatch(JSON.stringify(detail.body), /Negative|DRAFT-PRIVATE-COMMENT|result_value|report_snapshot/);
    for (const path of [`/orders/${order.id}`, '/worklist', '/patient-history?query=Synthetic', '/external-patients?query=Synthetic', '/profiles']) assert.equal((await request(path, doctor.token)).status, 403, path);
    assert.equal((await request('/clinical/orders?query=%25', doctor.token)).body.data.items.length, 0);
    assert.equal((await request('/clinical/orders?page=0', doctor.token)).status, 400);
    assert.equal((await request('/clinical/orders', null)).status, 401);
    for (const [suffix, method] of [['results', 'GET'], ['report.pdf', 'GET'], ['print', 'POST']]) assert.equal((await request(`/clinical/orders/${order.id}/${suffix}`, doctor.token, method)).status, 409);
  });
  await t.test('doctor cannot mutate laboratory results, authorization or catalogue', async () => {
    for (const [path, method, body] of [
      [`/orders/${order.id}/results`, 'PUT', { results: [{ id: order.tests[0].results[0].id, value: 'Positive' }] }],
      [`/orders/${order.id}/authorize`, 'POST'], [`/orders/${order.id}/amend`, 'POST', { reason: 'Not permitted' }],
      [`/orders/${order.id}`, 'DELETE', { reason: 'Not permitted' }], ['/catalogue/profiles', 'POST', {}]
    ]) assert.equal((await request(path, doctor.token, method, body)).status, 403, path);
  });
  await t.test('clinical notes are attributed server-side and append-only', async () => {
    const body = 'Synthetic clinical note: follow-up arranged. μmol/L. पुनः जाँच। <script>not executable</script>';
    const added = await request(`/clinical/orders/${order.id}/notes`, doctor.token, 'POST', { body, author_name: 'Forged Name', author_id: admin.user.id });
    assert.equal(added.status, 201); noteId = added.body.data.id;
    assert.equal(added.body.data.author_name, doctor.user.fullName); assert.equal(added.body.data.author_id, doctor.user.id);
    assert.equal((await request(`/clinical/orders/${order.id}/notes`, doctor.token, 'POST', { body: '  ' })).status, 400);
    assert.equal((await request(`/clinical/orders/${order.id}/notes`, tech.token, 'POST', { body: 'Denied' })).status, 403);
    assert.equal((await request(`/clinical/orders/${order.id}/notes/${noteId}`, doctor.token, 'DELETE')).status, 404);
    const labOrder = (await request(`/orders/${order.id}`, tech.token)).body.data;
    assert.equal(labOrder.clinical_notes[0].body, body); assert.equal(labOrder.tests[0].results[0].result_value, 'Negative');
  });
  await t.test('publication releases results, notes, print and real PDF download', async () => {
    assert.equal((await request(`/orders/${order.id}/authorize`, authorizer.token, 'POST')).status, 200);
    const report = await request(`/clinical/orders/${order.id}/results`, doctor.token);
    assert.equal(report.status, 200); assert.equal(report.body.data.tests[0].results[0].result_value, 'Negative');
    assert.equal(report.body.data.clinical_notes[0].id, noteId); assert.equal(report.body.data.audit, undefined); assert.equal(report.body.data.amendments, undefined);
    const printed = await request(`/clinical/orders/${order.id}/print`, doctor.token, 'POST');
    assert.equal(printed.status, 200); assert.ok(printed.body.data.printed_at);
    const pdf = await request(`/clinical/orders/${order.id}/report.pdf`, doctor.token);
    assert.equal(pdf.status, 200, Buffer.isBuffer(pdf.body) ? '' : JSON.stringify(pdf.body));
    assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.body.length > 3000);
    assert.match(pdf.headers.get('content-disposition'), /attachment; filename="LAB-.*\.pdf"/); assert.match(pdf.headers.get('cache-control'), /no-store/);
    await fs.mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
    await fs.writeFile(new URL('../test-results/doctor-report.pdf', import.meta.url), pdf.body);
    assert.equal((await request(`/clinical/orders/${order.id}/report.pdf`, tech.token)).status, 403);
    assert.equal((await request(`/clinical/orders/${order.id}/report.pdf`, it.token)).status, 403);
    const events = (await pool.query('SELECT event_type, details FROM audit_events WHERE order_id = $1', [order.id])).rows;
    for (const type of ['PATIENT_VIEWED', 'CLINICAL_NOTE_ADDED', 'RESULTS_VIEWED', 'REPORT_PRINT_REQUESTED', 'REPORT_DOWNLOADED']) assert.ok(events.some((e) => e.event_type === type), type);
    assert.deepEqual(events.find((e) => e.event_type === 'REPORT_DOWNLOADED').details.clinicalNoteIds, [noteId]);
  });
  await t.test('new notes appear as addenda, amendments hide results until reauthorization', async () => {
    assert.equal((await request(`/clinical/orders/${order.id}/notes`, doctor.token, 'POST', { body: 'Additional clinical observation after lab release.' })).status, 201);
    assert.equal((await request(`/clinical/orders/${order.id}/results`, doctor.token)).body.data.clinical_notes.length, 2);
    assert.equal((await request(`/orders/${order.id}/amend`, authorizer.token, 'POST', { reason: 'Synthetic correction for access test' })).status, 200);
    assert.equal((await request(`/clinical/orders/${order.id}`, doctor.token)).body.data.status, 'PENDING');
    for (const [suffix, method] of [['results', 'GET'], ['report.pdf', 'GET'], ['print', 'POST']]) assert.equal((await request(`/clinical/orders/${order.id}/${suffix}`, doctor.token, method)).status, 409);
  });
  await t.test('role, departments and disablement apply to existing tokens', async () => {
    const update = { fullName: doctor.user.fullName, role: 'DOCTOR', departmentIds: [], active: true };
    assert.equal((await request(`/users/${doctor.user.id}`, it.token, 'PUT', update)).status, 200);
    assert.deepEqual((await request('/auth/me', doctor.token)).body.data.user.departments, []);
    assert.equal((await request('/clinical/orders', doctor.token)).status, 200, 'No department restriction for hospital-wide doctors');
    assert.equal((await request(`/users/${doctor.user.id}`, admin.token, 'PUT', { ...update, role: 'IT' })).status, 200);
    assert.equal((await request('/clinical/orders', doctor.token)).status, 403, 'Token role must not override current DB role');
    assert.equal((await request(`/users/${doctor.user.id}`, admin.token, 'PUT', { ...update, active: false })).status, 200);
    assert.equal((await request('/auth/me', doctor.token)).status, 401);
    assert.equal((await request('/auth/login', null, 'POST', { username: doctor.user.username, password })).status, 401);
    const events = (await pool.query("SELECT details FROM system_audit_events WHERE event_type = 'STAFF_ACCESS_UPDATED'")).rows;
    assert.ok(events.length >= 3); assert.doesNotMatch(JSON.stringify(events), /password|hash|Synthetic-only/);
  });
  await t.test('deleted orders are excluded from clinical search, notes and downloads', async () => {
    assert.equal((await request(`/orders/${order.id}`, admin.token, 'DELETE', { reason: 'Remove synthetic order only', confirmationAccession: order.accession_no, password })).status, 204);
    assert.equal((await request('/clinical/orders?query=DOCTOR-TEST-001', admin.token)).body.data.items.length, 0);
    for (const [suffix, method, body] of [['', 'GET'], ['/report.pdf', 'GET'], ['/notes', 'POST', { body: 'Not permitted' }]]) assert.equal((await request(`/clinical/orders/${order.id}${suffix}`, admin.token, method, body)).status, 404);
  });
});
