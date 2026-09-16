import './doctor-docker-smoke.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Fixed isolated frontend port; never runs against the real hospital installation.
const base = 'http://127.0.0.1:55446';
const password = 'Synthetic-docker-only-123';
async function request(path, method = 'GET', body, token, status = 200) {
  const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json().catch(() => null);
  assert.equal(response.status, status, JSON.stringify(value)); return value?.data;
}
const admin = await request('/auth/login', 'POST', { username: 'docker_admin', password });
await request('/users', 'POST', { username: 'docker_combined', fullName: 'Synthetic Combined Staff', password, roles: ['TECHNICIAN', 'AUTHORIZER'] }, admin.token, 201);
const combined = await request('/auth/login', 'POST', { username: 'docker_combined', password });
assert.deepEqual(combined.user.roles, ['TECHNICIAN', 'AUTHORIZER']);
const profiles = await request('/profiles', 'GET', undefined, combined.token);
const order = await request('/orders', 'POST', { patientName: 'Synthetic Container Multi Role', sampleDate: new Date().toISOString(), profileIds: [profiles.find((p) => p.code === 'UPT').id], entryMode: 'RESULTS' }, combined.token, 201);
assert.equal(order.sample_status, 'IN_PROCESS');
await request(`/orders/${order.id}/results`, 'PUT', { results: [{ id: order.tests[0].results[0].id, value: 'Negative' }] }, combined.token);
await request(`/orders/${order.id}/authorize`, 'POST', undefined, combined.token);
await request(`/orders/${order.id}`, 'DELETE', { reason: 'Synthetic Docker removal check', confirmationAccession: order.accession_no, password }, combined.token, 403);
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH || 'D:/pharmacy-on/node_modules/playwright-core/index.mjs').href);
const browser = await chromium.launch({ headless: true });
await fs.mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByLabel('Username', { exact: true }).fill('docker_combined');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Find or register a patient' }).waitFor();
  await page.goto(`${base}/orders/${order.id}/results`);
  await page.getByRole('button', { name: 'Amend report', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Delete report', exact: true }).count(), 0);
  await page.reload(); await page.getByRole('button', { name: 'Amend report', exact: true }).waitFor();
  await page.screenshot({ path: fileURLToPath(new URL('../test-results/multi-role-docker.png', import.meta.url)), fullPage: true });
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
await request(`/orders/${order.id}`, 'DELETE', { reason: 'Synthetic Docker removal check', confirmationAccession: order.accession_no, password }, admin.token, 204);
await request(`/orders/${order.id}`, 'GET', undefined, admin.token, 404);
console.log('PASS: production containers support persisted multi-role accounts, direct entry, same-user authorization, deletion boundaries and browser deep-link/reload.');
