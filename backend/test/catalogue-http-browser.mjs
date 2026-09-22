// Browser regression on a real non-secure HTTP origin; all API data is synthetic.
import assert from 'node:assert/strict';
import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { profileSchema } from '../dist/src/schemas/profileSchemas.js';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH || 'D:/pharmacy-on/node_modules/playwright-core/index.mjs').href);
const app = express();
const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(`${dist}/index.html`));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP lis-http.test 127.0.0.1', '--no-proxy-server'] });
const page = await browser.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => dialog.accept());
let saved;
let submitted;
const catalogue = Array.from({ length: 25 }, (_, i) => ({
  id: `fixture-profile-${i}`, code: `FIXTURE_${i + 1}`, name: `Synthetic test ${String(i + 1).padStart(2, '0')}`,
  department: i === 24 ? 'Special department' : 'Laboratory', active: true,
  parameters: [{ id: `fixture-field-${i}`, code: 'VALUE', name: 'Value', result_kind: 'NUMERIC', sort_order: 10, active: true }]
}));
catalogue.push({ ...catalogue[0], id: 'fixture-archived', code: 'ARCHIVED', name: 'Archived synthetic test', active: false });
await page.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  let data = [];
  if (path.endsWith('/config')) data = { hospital: { name: 'Synthetic HTTP regression laboratory' } };
  else if (path.endsWith('/setup/status')) data = { initialized: true };
  else if (path.endsWith('/auth/me')) data = { user: { id: 'fixture-admin', fullName: 'Fixture Administrator', role: 'ADMIN' } };
  else if (path.endsWith('/descriptions')) data = { profiles: {}, parameters: {} };
  else if (path.endsWith('/catalogue/profiles') && route.request().method() === 'POST') {
    submitted = profileSchema.parse(route.request().postDataJSON());
    saved = { id: 'fixture-profile', code: submitted.code, name: submitted.name, department: submitted.department, active: true,
      parameters: submitted.parameters.map((p, i) => ({ id: `fixture-parameter-${i}`, code: p.code, name: p.name, result_kind: p.resultKind, reference_ranges: p.referenceRanges, select_options: p.selectOptions, common_values: p.commonValues, sort_order: p.sortOrder, active: true })) };
    return route.fulfill({ status: 201, json: { success: true, data: saved } });
  } else if (path.endsWith('/profiles')) data = saved ? [...catalogue, saved] : catalogue;
  else if (path.includes('/clinical/')) data = { items: [], hasMore: false };
  return route.fulfill({ json: { success: true, data } });
});

try {
  await page.addInitScript(() => localStorage.setItem('lis_token', 'synthetic-browser-token'));
  const base = process.env.LIS_BROWSER_BASE_URL || `http://lis-http.test:${server.address().port}`;
  await page.goto(`${base}/tests`);
  assert.equal(await page.evaluate(() => window.isSecureContext), false);
  assert.equal(await page.evaluate(() => typeof crypto.randomUUID), 'undefined');
  await page.getByRole('heading', { name: 'Investigation catalogue', exact: true }).waitFor();
  await page.getByText('1–6 of 25 tests', { exact: true }).waitFor();
  assert.equal(await page.locator('.catalogue-item').count(), 6);
  await page.getByRole('button', { name: 'Next tests', exact: true }).click();
  await page.getByText('7–12 of 25 tests', { exact: true }).waitFor();
  await page.getByLabel('Search investigations', { exact: true }).fill('FIXTURE_25');
  await page.getByText('1–1 of 1 matches', { exact: true }).waitFor();
  assert.equal(await page.locator('.catalogue-item').count(), 1);
  await page.locator('.catalogue-item').click();
  assert.equal(await page.getByLabel('Test / panel name *', { exact: true }).inputValue(), 'Synthetic test 25');
  await page.getByLabel('Search investigations', { exact: true }).fill('no matching fixture');
  await page.getByText('No matching tests', { exact: true }).waitFor();
  assert.equal(await page.locator('.catalogue-item').count(), 0);
  await page.getByLabel('Search investigations', { exact: true }).fill('');
  await page.getByLabel('Show archived', { exact: true }).check();
  await page.getByText('1–6 of 26 tests', { exact: true }).waitFor();
  await page.getByLabel('Show archived', { exact: true }).uncheck();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next tests', exact: true }).click();
  await page.getByText('25–25 of 25 tests', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Next tests', exact: true }).isDisabled(), true);
  await page.getByLabel('Search investigations', { exact: true }).fill('Special department');
  await page.getByText('1–1 of 1 matches', { exact: true }).waitFor();
  await page.getByLabel('Search investigations', { exact: true }).fill('');
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Catalogue overflow at ${width}px`);
    assert.ok(await page.getByRole('navigation', { name: 'Investigation pages' }).isVisible());
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Add investigation', exact: true }).click();
  await page.getByLabel('Test / panel name *', { exact: true }).fill('Synthetic HTTP Test');
  await page.getByLabel('Parameter name *', { exact: true }).fill('Synthetic value');
  await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
  await page.getByLabel('Parameter name *', { exact: true }).fill('Second value');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  const keys = await page.locator('[data-parameter-key]').evaluateAll((items) => items.map((item) => item.dataset.parameterKey));
  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, 3);
  await page.getByRole('button', { name: 'Create investigation', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Investigation created and ready for ordering.' }).waitFor();
  assert.equal(submitted.parameters.length, 3);
  await page.getByText('Investigation actions and history', { exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate investigation', exact: true }).click();
  assert.equal(await page.getByLabel('Test / panel name *', { exact: true }).inputValue(), 'Synthetic HTTP Test (copy)');
  assert.equal(new Set(await page.locator('[data-parameter-key]').evaluateAll((items) => items.map((item) => item.dataset.parameterKey))).size, 3);
  for (const path of ['/samples', '/patients', '/register', '/results', '/reports', '/team', '/records', '/tests']) {
    await page.goto(`${base}${path}`);
    await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();
    await page.reload();
    await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: HTTP catalogue, 25-test pagination, full-catalogue search/selection, archive/empty states, three widths, new/add/duplicate/save and eight route reloads. Payload validated by backend schema; API responses mocked, no database writes.');
} catch (error) {
  console.error('Browser page errors:', errors);
  throw error;
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
