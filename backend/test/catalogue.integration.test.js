import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import jwt from 'jsonwebtoken';
import { errorHandler } from '../dist/src/middleware/errorHandler.js';
import { config } from '../dist/src/config/env.js';
import { pool } from '../dist/src/database/pool.js';
import { profileRoutes } from '../dist/src/routes/profileRoutes.js';
import { orderRoutes } from '../dist/src/routes/orderRoutes.js';

const url = new URL(config.databaseUrl);
assert.ok(['127.0.0.1', 'localhost', ...(process.env.LIS_CONTAINER_TEST === '1' ? ['db'] : [])].includes(url.hostname) && url.pathname.endsWith('_test'), 'Requires a local disposable _test database.');

function draft(profile) {
  return { code: profile.code, name: profile.name, department: profile.department, specimenType: profile.specimen_type || '',
    parameters: profile.parameters.map((p) => ({ id: p.id, code: p.code, name: p.name, resultKind: p.result_kind, unit: p.unit || '', method: p.method || '',
      referenceRanges: p.reference_ranges, selectOptions: p.select_options, commonValues: p.common_values, calculationFormula: p.calculation_formula || '',
      sortOrder: p.sort_order, active: p.active, loincCode: p.loinc_code || '', referenceNote: p.reference_note || '' })) };
}

test('catalogue edits, seed persistence, clinical snapshots and browser form', async (t) => {
  const schema = await fs.readFile(new URL('../../database/001_schema.sql', import.meta.url), 'utf8');
  const seed = await fs.readFile(new URL('../../database/002_seed_profiles.sql', import.meta.url), 'utf8');
  await pool.query(schema);
  await pool.query(seed);
  const user = (await pool.query("INSERT INTO users (username, password_hash, full_name, role) VALUES ('catalogue_test_fixture', 'not-a-login-hash', 'Catalogue Test Fixture', 'ADMIN') RETURNING id")).rows[0];
  const token = jwt.sign({ id: user.id, role: 'ADMIN' }, config.jwtSecret);
  const technician = (await pool.query("INSERT INTO users (username, password_hash, full_name, role) VALUES ('catalogue_technician_fixture', 'not-a-login-hash', 'Catalogue Technician Fixture', 'TECHNICIAN') RETURNING id")).rows[0];
  const technicianToken = jwt.sign({ id: technician.id, role: 'TECHNICIAN' }, config.jwtSecret);
  const app = express(); app.use(express.json());
  app.get('/api/config', (_req, res) => res.json({ hospital: { name: 'Test Lab', address: '', phone: '' } }));
  app.get('/api/setup/status', (_req, res) => res.json({ initialized: true }));
  app.get('/api/auth/me', (_req, res) => res.json({ user: { id: user.id, username: 'fixture', fullName: 'Test Fixture', role: 'ADMIN' } }));
  app.use('/api', profileRoutes); app.use('/api', orderRoutes);
  app.use(express.static(new URL('../../frontend/dist', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')));
  app.get('*', (_req, res) => res.sendFile(new URL('../../frontend/dist/index.html', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await pool.end(); });
  async function request(path, method = 'GET', body, auth = token) {
    const response = await fetch(`${base}/api${path}`, { method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const responseBody = await response.json().catch(() => null);
    return { status: response.status, body: responseBody?.success === true ? responseBody.data : responseBody };
  }
  let profiles = (await request('/catalogue/profiles')).body;
  let lft = profiles.find((p) => p.code === 'LFT');
  const originalId = lft.id;
  const albuminId = lft.parameters.find((p) => p.code === 'ALB').id;
  let oldOrder;
  await t.test('new order snapshots metadata and leaves measured results empty', async () => {
    const input = draft(lft); input.parameters.find((p) => p.id === albuminId).referenceNote = 'Locally reviewed note';
    const saved = await request(`/catalogue/profiles/${lft.id}`, 'PUT', input); assert.equal(saved.status, 200); lft = saved.body;
    const order = await request('/orders', 'POST', { patientName: 'Synthetic Catalogue Test', sampleDate: new Date().toISOString(), profileIds: [lft.id] });
    assert.equal(order.status, 201); oldOrder = order.body;
    const result = oldOrder.tests[0].results.find((r) => r.parameter_id === albuminId);
    assert.equal(result.reference_note, 'Locally reviewed note'); assert.equal(result.result_value, null);
  });
  await t.test('rename profile and field in place, rewrite formulas and audit', async () => {
    const input = draft(lft); input.code = 'LIVER';
    const albumin = input.parameters.find((p) => p.id === albuminId); albumin.code = 'ALBUMIN'; albumin.method = ''; albumin.referenceNote = 'Revised note';
    const saved = await request(`/catalogue/profiles/${lft.id}`, 'PUT', input); assert.equal(saved.status, 200, JSON.stringify(saved.body)); lft = saved.body;
    assert.equal(lft.id, originalId); assert.equal(lft.parameters.find((p) => p.code === 'ALBUMIN').id, albuminId);
    assert.equal(lft.parameters.find((p) => p.code === 'AGR').calculation_formula, 'ALBUMIN / GLOB');
    const audit = (await request(`/catalogue/profiles/${lft.id}/audit`)).body;
    assert.equal(audit[0].details.previousCode, 'LFT'); assert.deepEqual(audit[0].details.parameterCodeChanges, [{ from: 'ALB', to: 'ALBUMIN' }]);
    const snapshot = (await request(`/orders/${oldOrder.id}`)).body;
    assert.deepEqual(snapshot.tests, oldOrder.tests);
  });
  await t.test('seed rerun preserves renamed codes, deliberately blank methods and snapshots', async () => {
    const before = (await pool.query('SELECT * FROM profile_parameters ORDER BY id')).rows;
    await pool.query(seed);
    assert.deepEqual((await pool.query('SELECT * FROM profile_parameters ORDER BY id')).rows, before);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM test_profiles WHERE code='LFT'")).rows[0].count, 0);
    assert.deepEqual((await request(`/orders/${oldOrder.id}`)).body.tests, oldOrder.tests);
  });
  await t.test('single-letter seeded code and LOINC mapping save correctly', async () => {
    const kft = profiles.find((p) => p.code === 'KFT'); const input = draft(kft);
    input.parameters.find((p) => p.code === 'CREAT').loincCode = '2160-0';
    const saved = await request(`/catalogue/profiles/${kft.id}`, 'PUT', input); assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const order = await request('/orders', 'POST', { patientName: 'Synthetic Kidney Test', sampleDate: new Date().toISOString(), profileIds: [kft.id] });
    assert.equal(order.status, 201); assert.equal(order.body.tests[0].results.find((r) => r.parameter_code === 'CREAT').loinc_code, '2160-0');
  });
  await t.test('reject duplicate codes, foreign IDs, invalid formulas and technician writes', async () => {
    const input = draft(lft); input.parameters[1].code = input.parameters[0].code;
    assert.equal((await request(`/catalogue/profiles/${lft.id}`, 'PUT', input)).status, 400);
    const foreign = draft(lft); foreign.parameters[0].id = profiles.find((p) => p.code === 'KFT').parameters[0].id;
    assert.equal((await request(`/catalogue/profiles/${lft.id}`, 'PUT', foreign)).status, 400);
    const inactive = draft(lft); inactive.parameters.find((p) => p.id === albuminId).active = false;
    assert.equal((await request(`/catalogue/profiles/${lft.id}`, 'PUT', inactive)).status, 400);
    assert.equal((await request(`/catalogue/profiles/${lft.id}`, 'PUT', draft(lft), technicianToken)).status, 403);
    const conflict = draft(lft); conflict.code = 'CBC'; assert.equal((await request(`/catalogue/profiles/${lft.id}`, 'PUT', conflict)).status, 409);
    assert.deepEqual((await request('/catalogue/profiles')).body.find((p) => p.id === lft.id), lft);
  });
  await t.test('atomic field-code swap preserves identities', async () => {
    const input = draft(lft); const first = input.parameters[0]; const second = input.parameters[1];
    const a = first.code; const b = second.code; first.code = b; second.code = a;
    const saved = await request(`/catalogue/profiles/${lft.id}`, 'PUT', input); assert.equal(saved.status, 200);
    assert.equal(saved.body.parameters.find((p) => p.id === first.id).code, b); lft = saved.body;
  });
  await t.test('age units, reference refresh, test replacement and audited deletion', async () => {
    const input = { code: 'AGE_TEST', name: 'Age Test', department: 'Immunoassay', specimenType: 'Serum', parameters: [{ code: 'TSH', name: 'TSH', resultKind: 'NUMERIC', unit: 'mIU/mL', method: 'CLIA', referenceNote: 'Interpretation note', referenceRanges: [{ label: 'Infant', ageMin: 0, ageMax: 12, ageUnit: 'months', low: 1, high: 8 }, { label: 'Adult', ageMin: 18, ageUnit: 'years', low: .5, high: 5 }], selectOptions: [], commonValues: [], sortOrder: 1, active: true }] };
    const created = await request('/catalogue/profiles', 'POST', input); assert.equal(created.status, 201, JSON.stringify(created.body));
    const profile = created.body;
    const response = await request('/orders', 'POST', { patientName: 'Synthetic Infant', ageValue: 6, ageUnit: 'months', sampleDate: new Date().toISOString(), profileIds: [profile.id] });
    assert.equal(response.status, 201, JSON.stringify(response.body)); const order = response.body;
    assert.equal(Number(order.age_value), 6); assert.equal(order.age_unit, 'months'); assert.equal(order.age_years, 0);
    await request('/orders/samples/accept', 'POST', { orderIds: [order.id] }); await request(`/orders/${order.id}/start-processing`, 'POST');
    const resultId = order.tests[0].results[0].id;
    let saved = await request(`/orders/${order.id}/results`, 'PUT', { results: [{ id: resultId, value: '9' }] });
    assert.equal(saved.status, 200); assert.equal(saved.body.tests[0].results[0].abnormal_flag, 'H');
    const revised = draft(profile); revised.parameters[0].referenceRanges[0].high = 10;
    assert.equal((await request(`/catalogue/profiles/${profile.id}`, 'PUT', revised)).status, 200);
    assert.equal((await request(`/orders/${order.id}`)).body.tests[0].results[0].reference_ranges[0].high, 8);
    saved = await request(`/orders/${order.id}/refresh-references`, 'POST', { reason: 'Apply corrected infant range' });
    assert.equal(saved.status, 200); assert.equal(saved.body.tests[0].results[0].result_value, '9'); assert.equal(saved.body.tests[0].results[0].abnormal_flag, null);
    assert.equal(saved.body.tests[0].results[0].reference_ranges[0].high, 10);
    const kidney = profiles.find((p) => p.code === 'KFT');
    saved = await request(`/orders/${order.id}/tests`, 'PUT', { profileIds: [profile.id, kidney.id], reason: 'Add requested kidney tests' });
    assert.equal(saved.status, 200); assert.equal(saved.body.tests[0].results[0].id, resultId); assert.equal(saved.body.tests[1].results[0].result_value, null); assert.equal(saved.body.status, 'PENDING');
    saved = await request(`/orders/${order.id}/tests`, 'PUT', { profileIds: [profile.id], reason: 'Remove incorrect kidney panel' }); assert.equal(saved.status, 200);
    assert.equal((await request(`/orders/${order.id}/authorize`, 'POST')).status, 200);
    assert.equal((await request(`/orders/${order.id}/refresh-references`, 'POST', { reason: 'Must be blocked after authorization' })).status, 409);
    assert.equal((await request(`/orders/${order.id}/tests`, 'PUT', { profileIds: [kidney.id], reason: 'Must be blocked after authorization' })).status, 409);
    assert.equal((await request(`/orders/${order.id}`, 'DELETE', { reason: 'Duplicate registration removed' }, technicianToken)).status, 403);
    assert.equal((await request(`/orders/${order.id}`, 'DELETE', { reason: 'Duplicate registration removed' })).status, 204);
    assert.equal((await request(`/orders/${order.id}`)).status, 404);
    assert.equal((await request(`/orders/${order.id}/results`, 'PUT', { results: [{ id: resultId, value: '7' }] })).status, 404);
    assert.equal((await request('/worklist')).body.some((o) => o.id === order.id), false);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE order_id=$1 AND event_type='REPORT_DELETED'", [order.id])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM test_results WHERE id=$1', [resultId])).rows[0].n, 1);
  });
  await t.test('browser: code focus, multiline options, template review and mobile layout', { skip: !process.env.PLAYWRIGHT_MODULE_PATH }, async () => {
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(); await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.addInitScript((value) => localStorage.setItem('lis_token', value), token);
      await page.goto(base); await page.getByRole('button', { name: 'Investigation catalogue' }).click();
      await page.getByRole('button', { name: /Vitamin B12.*VITB12/ }).click();
      await page.locator('.parameter-summary[aria-expanded="false"]').first().click();
      const code = page.getByLabel('Parameter code *', { exact: true }); await code.fill(''); await code.pressSequentially('B12_NEW'); assert.equal(await code.inputValue(), 'B12_NEW');
      await page.getByLabel('Test code *', { exact: true }).fill('B12_PANEL');
      await page.getByText('Optional codes, calculations and entry shortcuts', { exact: true }).click();
      await page.getByLabel('Common quick values').fill('100\n200\n300');
      await page.getByRole('button', { name: 'Save investigation', exact: true }).click(); await page.getByText('Investigation updated.', { exact: false }).waitFor();
      await page.reload(); await page.getByRole('button', { name: 'Investigation catalogue' }).click(); await page.getByRole('button', { name: /Vitamin B12.*B12_PANEL/ }).click();
      await page.locator('.parameter-summary[aria-expanded="false"]').first().click();
      assert.equal(await page.getByLabel('Parameter code *', { exact: true }).inputValue(), 'B12_NEW');
      await page.getByText('Analyzer / report templates and setup guide', { exact: true }).click();
      await page.getByRole('button', { name: 'Replace draft with template' }).click();
      assert.equal(await page.locator('.parameter-editor').count(), 22);
      await page.locator('.parameter-summary[aria-expanded="false"]').first().click();
      assert.equal(await page.getByLabel(/^Method/).first().inputValue(), 'Cyanide-free colorimetry');
      await page.getByRole('button', { name: 'Save investigation', exact: true }).click(); await page.getByText('Investigation updated.', { exact: false }).waitFor();
      const h360 = (await request('/profiles')).body.find((p) => p.code === 'CBC'); assert.equal(h360.parameters.length, 22); assert.ok(!h360.parameters.some((p) => ['NEUT', 'EOS', 'MONO', 'BASO'].includes(p.code)));
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await page.screenshot({ path: new URL('../test-results/catalogue-mobile.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), fullPage: false });
      assert.deepEqual(errors, []);
    } finally {
      await fs.mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
      await context.tracing.stop({ path: new URL('../test-results/catalogue-trace.zip', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
      await browser.close();
    }
  });
});
