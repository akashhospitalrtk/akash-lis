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
  let mode = 'normal';
  const lookupRequests = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const query = url.searchParams.get('query');
    if (path.endsWith('/patient-history') || path.endsWith('/external-patients')) {
      lookupRequests.push({ path, query, limit: url.searchParams.get('limit'), match: url.searchParams.get('match') });
    }
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
    if (mode !== 'normal' && (path.endsWith('/patient-history') || path.endsWith('/external-patients'))) {
      if (mode === 'slow' && path.endsWith('/external-patients')) await new Promise(resolve => setTimeout(resolve, 1500));
      if (mode === 'numeric' && query === '1' && path.endsWith('/external-patients')) await new Promise(resolve => setTimeout(resolve, 1000));
      data = ['1', '12', '120', '121', '122', '123', '124', '125', '13', '14'].filter(uhid => uhid.startsWith(query))
        .map(uhid => ({ id: `${path.endsWith('/patient-history') ? 'lis' : 'hms'}-${uhid}`, uhid, name: `Synthetic Patient ${uhid}`, age: 42, age_unit: 'years', gender: 'Female' }));
    }
    await route.fulfill({ json: { success: true, data } }).catch(() => undefined);
  });
  await page.addInitScript(() => localStorage.setItem('lis_token', 'synthetic-token'));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByLabel('Search prior laboratory registrations').fill('TEST-1');
  const match = page.getByRole('option', { name: /Synthetic Newborn/ });
  await match.waitFor();
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
  await page.getByText(/Hospital patient lookup is unavailable\./).waitFor();
  await page.getByRole('option', { name: /Existing LIS Patient/ }).click();
  assert.equal(await page.getByLabel('Patient name *', { exact: true }).inputValue(), 'Existing LIS Patient');
  assert.equal(await page.getByLabel('Age', { exact: true }).inputValue(), '42');
  await page.getByLabel('Quick add investigation').selectOption('t1');
  await page.getByRole('button', { name: 'Submit sample', exact: true }).click();
  await page.getByText('Synthetic submission captured.', { exact: true }).waitFor();
  assert.equal(payload.patientSource, 'MANUAL');
  assert.equal(payload.externalPatientId, null);

  unavailable = false;
  localFallback = false;
  mode = 'numeric';
  await page.reload();
  // Simulate a transport that ignores cancellation to exercise stale-response protection.
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (input, options) => original(input, String(input).includes('/external-patients') ? { ...options, signal: undefined } : options);
  });
  const input = page.getByRole('combobox', { name: 'Search prior laboratory registrations' });
  await input.fill('1');
  await page.waitForFunction(() => document.querySelectorAll('.patient-autocomplete [role="option"]').length === 5);
  await input.fill('12');
  await page.getByRole('option', { name: /Synthetic Patient 12 .*HMS/ }).first().waitFor();
  await page.waitForTimeout(1200);
  const options = page.getByRole('listbox', { name: 'Existing patients' }).getByRole('option');
  assert.equal(await options.count(), 5);
  assert.ok((await options.allTextContents()).every(value => /Synthetic Patient 12/.test(value)));
  assert.match(await options.first().innerText(), /Synthetic Patient 12\s/);
  const duplicate = await options.allTextContents();
  assert.equal(new Set(duplicate.map(value => value.match(/Patient (\d+)/)[1])).size, 5);
  await input.press('ArrowDown');
  await input.press('Enter');
  assert.equal(await page.getByLabel('UHID / Registration no.').inputValue(), '12');
  assert.equal(await options.count(), 0);
  const before = lookupRequests.length;
  await input.fill('1');
  await page.waitForTimeout(60);
  await input.fill('12');
  await page.waitForTimeout(60);
  await input.fill('123');
  await page.getByRole('option', { name: /Synthetic Patient 123/ }).waitFor();
  assert.equal(lookupRequests.length - before, 2);
  assert.ok(lookupRequests.slice(before).every(request => request.query === '123'));
  await input.press('Escape');
  assert.equal(await options.count(), 0);
  await input.fill('');
  await page.waitForTimeout(400);
  assert.equal(lookupRequests.length - before, 2);

  mode = 'slow';
  await input.fill('14');
  await page.getByRole('option', { name: /Synthetic Patient 14 .*LIS/ }).waitFor({ timeout: 1000 });
  await page.getByRole('option', { name: /Synthetic Patient 14/ }).click();
  await page.waitForTimeout(1700);
  assert.equal(await options.count(), 0);
  assert.equal(await page.getByLabel('UHID / Registration no.').inputValue(), '14');
  assert.ok(lookupRequests.every(request => request.limit === '5' && request.match === 'prefix'));
  assert.deepEqual(errors, []);
  console.log('PASS: automatic one-character prefix lookup, five matches, deduplication, narrowing, debounce, keyboard selection, stale-response protection, and immediate LIS fallback. Browser data is synthetic.');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
