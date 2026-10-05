import express from 'express';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH || 'D:/pharmacy-on/node_modules/playwright-core/index.mjs').href);
const app = express();
app.use(express.static(fileURLToPath(new URL('../../frontend/dist', import.meta.url))));
app.get('*', (_req, res) => res.sendFile(fileURLToPath(new URL('../../frontend/dist/index.html', import.meta.url))));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let payload;
  let unavailable = false;
  let localFallback = false;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path.endsWith('/config')) data = { hospital: { name: 'Synthetic Lab' } };
    else if (path.endsWith('/setup/status')) data = { initialized: true };
    else if (path.endsWith('/auth/me')) data = { user: { id: 'u1', fullName: 'Synthetic Admin', role: 'ADMIN' } };
    else if (path.endsWith('/profiles')) data = [{ id: 't1', code: 'TEST', name: 'Synthetic Test', department: 'Biochemistry', parameters: [] }];
    else if (path.endsWith('/patient-history')) data = localFallback ? [{ id: 'synthetic-lis-1', uhid: 'LIS-1', name: 'Existing LIS Patient', age_value: 42, age_unit: 'years', gender: 'Female', mobile: '9999999999', referring_doctor: 'Dr Local', patient_type: 'OPD' }] : [];
    else if (path.endsWith('/external-patients')) {
      if (unavailable) return route.fulfill({ status: 502, json: { message: 'Hospital patient lookup is unavailable.' } });
      data = [{ id: 'synthetic-hms-1', uhid: 'TEST-1', name: 'Synthetic Newborn', age: 3, age_unit: 'days', gender: null, mobile: null, referringDoctor: null, patientType: null }];
    } else if (path.endsWith('/orders') && route.request().method() === 'POST') {
      payload = route.request().postDataJSON();
      return route.fulfill({ status: 400, json: { message: 'Synthetic submission captured.' } });
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript(() => localStorage.setItem('lis_token', 'synthetic-token'));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel('Search prior laboratory registrations').fill('TEST-1');
  await page.getByRole('button', { name: 'Search prior registrations', exact: true }).click();
  const match = page.getByRole('button', { name: /Synthetic Newborn/ });
  assert.match(await match.innerText(), /3 days/);
  await match.click();
  assert.equal(await page.getByLabel('Age', { exact: true }).inputValue(), '3');
  assert.equal(await page.getByLabel('Age unit', { exact: true }).inputValue(), 'days');
  assert.equal(await page.getByLabel(/^Gender/).inputValue(), '');
  assert.equal(await page.getByLabel(/^Patient type/).inputValue(), '');
  await page.getByLabel('Quick add investigation').selectOption('t1');
  await page.getByRole('button', { name: 'Submit sample', exact: true }).click();
  await page.getByText('Synthetic submission captured.', { exact: true }).waitFor();
  assert.equal(payload.patientSource, 'HOSPITAL');
  assert.equal(payload.externalPatientId, 'synthetic-hms-1');
  assert.equal(payload.ageUnit, 'days');
  assert.equal(payload.ageValue, 3);
  assert.equal(payload.gender, null);
  assert.equal(payload.patientType, null);
  unavailable = true;
  localFallback = true;
  await page.reload();
  await page.getByLabel('Search prior laboratory registrations').fill('LIS-1');
  await page.getByRole('button', { name: 'Search prior registrations', exact: true }).click();
  await page.getByText(/Hospital patient lookup is unavailable\./).waitFor();
  await page.getByRole('button', { name: /Existing LIS Patient/ }).click();
  assert.equal(await page.getByLabel('Patient name *', { exact: true }).inputValue(), 'Existing LIS Patient');
  assert.equal(await page.getByLabel('Age', { exact: true }).inputValue(), '42');
  await page.getByLabel('Quick add investigation').selectOption('t1');
  await page.getByRole('button', { name: 'Submit sample', exact: true }).click();
  await page.getByText('Synthetic submission captured.', { exact: true }).waitFor();
  assert.equal(payload.patientSource, 'MANUAL');
  assert.equal(payload.externalPatientId, null);
  assert.deepEqual(errors, []);
  console.log('PASS: one search icon queries HMS and LIS records, loads demographics, and keeps LIS results available when HMS is down. Browser API responses are synthetic.');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
