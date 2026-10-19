import express from 'express';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../dist/src/app.js';
import { config } from '../dist/src/config/env.js';
import { pool } from '../dist/src/database/pool.js';
import { prisma } from '../dist/src/database/prisma.js';

const db = new URL(config.databaseUrl);
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname.endsWith('_test'), 'Disposable local _test database only.');
const modulePath = process.env.PLAYWRIGHT_MODULE_PATH;
assert.ok(modulePath, 'Set PLAYWRIGHT_MODULE_PATH to playwright-core/index.mjs.');
const { chromium } = await import(pathToFileURL(modulePath).href);
await pool.query(await fs.readFile(new URL('../../database/001_schema.sql', import.meta.url), 'utf8'));
await pool.query(await fs.readFile(new URL('../../database/002_seed_profiles.sql', import.meta.url), 'utf8'));
const app = express();
app.use(createAppForApi());
function createAppForApi() {
  const api = createApp();
  return (req, res, next) => req.path.startsWith('/api/') ? api(req, res, next) : next();
}
app.use(express.static(fileURLToPath(new URL('../../frontend/dist', import.meta.url))));
app.get('*', (_req, res) => res.sendFile(fileURLToPath(new URL('../../frontend/dist/index.html', import.meta.url))));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const password = 'Synthetic-browser-patient-123';
async function api(path, token, method = 'GET', body) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await response.json(); assert.ok(response.ok, JSON.stringify(json)); return json.data;
}
try {
  const session = await api('/auth/bootstrap', null, 'POST', { username: 'patient_browser_admin', fullName: 'Synthetic Admin', password });
  await api('/users', session.token, 'POST', { username: 'patient_browser_doctor', fullName: 'Synthetic Doctor', password, roles: ['DOCTOR'] });
  const doctor = await api('/auth/login', null, 'POST', { username: 'patient_browser_doctor', password });
  const profiles = await api('/profiles', session.token);
  const order = await api('/orders', session.token, 'POST', { patientName: 'Synthetic Demo Registration', ageValue: 20, ageUnit: 'years', gender: 'Male', mobile: '0000000000', sampleDate: new Date().toISOString(), profileIds: [profiles.find((p) => p.code === 'UPT').id], entryMode: 'RESULTS' });
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message)); page.setDefaultTimeout(15000);
  await page.addInitScript((token) => localStorage.setItem('lis_token', token), session.token);
  await page.goto(base + '/patients');
  await page.getByRole('button', { name: 'Manage patient', exact: true }).click();
  await page.getByRole('button', { name: 'Edit patient details', exact: true }).click();
  assert.equal(await page.getByLabel('Mobile no.', { exact: true }).inputValue(), '0000000000');
  await page.getByLabel('Patient name *', { exact: true }).fill('Synthetic Corrected Demo');
  await page.getByLabel('Age', { exact: true }).fill('3');
  await page.getByLabel('Age unit', { exact: true }).selectOption('months');
  await page.getByLabel('Sex', { exact: true }).selectOption('Female');
  await page.getByLabel('Reason for correction *', { exact: true }).fill('Correct demo registration');
  await fs.mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../test-results/admin-patient-edit.png', import.meta.url)), fullPage: true });
  await page.getByRole('button', { name: 'Save patient details', exact: true }).click();
  await page.getByText('Patient details updated for this registration.', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Synthetic Corrected Demo', exact: true }).waitFor();
  const updated = await api(`/orders/${order.id}`, session.token);
  assert.equal(updated.patient_name, 'Synthetic Corrected Demo'); assert.equal(updated.age_unit, 'months');

  const doctorPage = await browser.newPage();
  await doctorPage.addInitScript((token) => localStorage.setItem('lis_token', token), doctor.token);
  await doctorPage.goto(base + `/patients/orders/${order.id}`);
  await doctorPage.getByRole('heading', { name: 'Synthetic Corrected Demo', exact: true }).waitFor();
  assert.equal(await doctorPage.getByRole('button', { name: 'Edit patient details', exact: true }).count(), 0);
  assert.equal(await doctorPage.getByRole('button', { name: 'Delete registration', exact: true }).count(), 0);

  await api(`/orders/${order.id}/results`, session.token, 'PUT', { results: [{ id: order.tests[0].results[0].id, value: 'Negative' }] });
  await api(`/orders/${order.id}/authorize`, session.token, 'POST');
  await page.reload();
  await page.getByRole('heading', { name: 'Synthetic Corrected Demo', exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Edit patient details', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'View results & report', exact: true }).click();
  await page.getByRole('button', { name: 'Amend & edit values', exact: true }).click();
  await page.getByLabel('Amendment reason *', { exact: true }).fill('Correct synthetic patient details');
  await page.getByRole('button', { name: 'Begin amendment & edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit patient details', exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Edit patient details', exact: true }).isEnabled());

  await page.goto(base + `/patients/orders/${order.id}`);
  await page.getByRole('button', { name: 'Delete registration', exact: true }).click();
  await page.getByLabel('Confirm accession number', { exact: true }).fill(order.accession_no);
  await page.getByLabel('Your administrator password', { exact: true }).fill('wrong');
  await page.getByLabel('Reason *', { exact: true }).fill('Remove synthetic demo registration');
  await page.getByRole('button', { name: 'Confirm delete registration', exact: true }).click();
  await page.getByText('Administrator password confirmation failed.', { exact: true }).waitFor();
  await page.getByLabel('Your administrator password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Confirm delete registration', exact: true }).click();
  await page.getByText('No matching patient orders.', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/patients');
  assert.deepEqual(errors, []);
  console.log('Patient UI passed: admin edit/persistence, doctor restriction, amendment entry, password confirmation, deletion and list refresh.');
} finally {
  await browser?.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect(); await pool.end();
}
