import express from 'express';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../dist/src/app.js';
import { pool } from '../dist/src/database/pool.js';
import { config } from '../dist/src/config/env.js';

const db = new URL(config.databaseUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(db.hostname) && db.pathname.endsWith('_test'), 'Disposable local test database only.');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH || 'D:/pharmacy-on/node_modules/playwright-core/index.mjs').href);
await pool.query(await fs.readFile(new URL('../../database/001_schema.sql', import.meta.url), 'utf8'));
await pool.query(await fs.readFile(new URL('../../database/002_seed_profiles.sql', import.meta.url), 'utf8'));
const app = express();
const apiApp = createApp();
app.use((req, res, next) => req.path.startsWith('/api/') ? apiApp(req, res, next) : next());
app.use(express.static(fileURLToPath(new URL('../../frontend/dist', import.meta.url))));
app.get('*', (_req, res) => res.sendFile(fileURLToPath(new URL('../../frontend/dist/index.html', import.meta.url))));
const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const adminPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const labPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = []; for (const page of [adminPage, labPage]) { page.setDefaultTimeout(15000); page.on('pageerror', (e) => errors.push(e.message)); }
const password = 'Synthetic-multirole-browser-123';
await fs.mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
async function api(path, method, body, token) {
  const r = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await r.json().catch(() => null); assert.ok(r.ok, JSON.stringify(result)); return result?.data;
}
async function login(page, username) {
  await page.goto(base); await page.getByLabel('Username', { exact: true }).fill(username); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
try {
  const admin = await api('/auth/bootstrap', 'POST', { username: 'browser_roles_admin', fullName: 'Browser Roles Admin', password });
  await login(adminPage, 'browser_roles_admin');
  await adminPage.getByRole('button', { name: 'Staff and departments', exact: true }).click();
  await adminPage.getByLabel('Full name', { exact: true }).fill('Combined Lab Staff');
  await adminPage.getByLabel('Username', { exact: true }).fill('browser_combined');
  await adminPage.getByLabel('Initial password', { exact: true }).fill(password);
  await adminPage.getByLabel('Role: Report authorizer', { exact: true }).check();
  await adminPage.getByText('This person can submit and enter values, then authorize the same report.', { exact: false }).waitFor();
  await adminPage.getByRole('button', { name: 'Create user', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Edit Combined Lab Staff', exact: true }).waitFor();
  await adminPage.getByRole('button', { name: 'Edit Combined Lab Staff', exact: true }).click();
  assert.ok(await adminPage.getByLabel('Role: Lab technician', { exact: true }).isChecked());
  assert.ok(await adminPage.getByLabel('Role: Report authorizer', { exact: true }).isChecked());
  await adminPage.screenshot({ path: fileURLToPath(new URL('../test-results/multi-role-team.png', import.meta.url)), fullPage: true });
  await login(labPage, 'browser_combined');
  await labPage.getByRole('heading', { name: 'Find or register a patient' }).waitFor();
  assert.equal(await labPage.getByRole('button', { name: 'Staff and departments', exact: true }).count(), 0);
  await labPage.getByLabel('Patient name *', { exact: true }).fill('Synthetic Multi Role Patient');
  const profiles = await api('/profiles', 'GET', undefined, admin.token);
  await labPage.getByLabel('Quick add investigation').selectOption(profiles.find((p) => p.code === 'UPT').id);
  await labPage.getByRole('button', { name: 'Submit & enter values', exact: true }).click();
  await labPage.locator('[data-result-input]').first().waitFor();
  const orderId = new URL(labPage.url()).pathname.split('/')[2];
  const order = await api(`/orders/${orderId}`, 'GET', undefined, admin.token);
  assert.equal(order.sample_status, 'IN_PROCESS');
  assert.equal(await labPage.getByRole('button', { name: 'Delete registration', exact: true }).count(), 0);
  await labPage.locator('select[data-result-input]').first().selectOption('Negative');
  await labPage.getByRole('button', { name: 'Save results', exact: true }).click();
  await labPage.getByRole('button', { name: 'Authorize report', exact: true }).waitFor();
  await labPage.getByRole('button', { name: 'Authorize report', exact: true }).click();
  await labPage.getByRole('button', { name: 'Amend report', exact: true }).waitFor();
  await labPage.reload(); await labPage.getByRole('button', { name: 'Amend report', exact: true }).waitFor();
  await labPage.screenshot({ path: fileURLToPath(new URL('../test-results/multi-role-authorized.png', import.meta.url)), fullPage: true });
  // Removing one role updates an existing session, including its navigation.
  await adminPage.getByLabel('Role: Lab technician', { exact: true }).uncheck();
  await adminPage.getByRole('button', { name: 'Save access', exact: true }).click();
  await adminPage.getByRole('status').filter({ hasText: 'Staff access updated' }).waitFor();
  await labPage.reload(); await labPage.getByRole('button', { name: 'Amend report', exact: true }).waitFor();
  assert.equal(await labPage.getByRole('button', { name: 'Patient and order registration', exact: true }).count(), 0);
  await labPage.goto(`${base}/register`); await labPage.getByRole('button', { name: 'Sample reception', exact: true }).waitFor();
  assert.equal(await labPage.getByRole('button', { name: 'Submit & enter values', exact: true }).count(), 0);
  await adminPage.goto(`${base}/orders/${orderId}/results`);
  await adminPage.getByRole('button', { name: 'Delete registration', exact: true }).click();
  await adminPage.getByLabel('Confirm accession number', { exact: true }).fill(order.accession_no);
  await adminPage.getByLabel('Reason *', { exact: true }).fill('Synthetic report removal after test');
  await adminPage.getByLabel('Your administrator password', { exact: true }).fill('Wrong-password');
  await adminPage.getByRole('button', { name: 'Confirm delete registration', exact: false }).click();
  await adminPage.getByRole('alert').filter({ hasText: 'password confirmation failed' }).waitFor();
  assert.equal(await adminPage.getByLabel('Your administrator password', { exact: true }).inputValue(), '');
  await adminPage.screenshot({ path: fileURLToPath(new URL('../test-results/multi-role-delete-confirmation.png', import.meta.url)), fullPage: true });
  await adminPage.getByLabel('Your administrator password', { exact: true }).fill(password);
  await adminPage.getByRole('button', { name: 'Confirm delete registration', exact: false }).click();
  await adminPage.locator('.order-action-panel').waitFor({ state: 'hidden' });
  assert.ok((await pool.query('SELECT deleted_at FROM lab_orders WHERE id=$1', [orderId])).rows[0].deleted_at);
  assert.deepEqual(errors, []);
  console.log('PASS: multi-role checkboxes, direct patient-to-results entry, same-user authorization, reload, role revocation, and administrator password-confirmed removal.');
} catch (error) {
  for (const [name, page] of [['admin', adminPage], ['lab', labPage]]) await page.screenshot({ path: fileURLToPath(new URL(`../test-results/multi-role-${name}-failure.png`, import.meta.url)), fullPage: true });
  throw error;
} finally { await browser.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await pool.end(); }
