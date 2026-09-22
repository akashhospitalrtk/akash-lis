// UI-only regression: all API fixtures are intercepted in the browser.
// This script never connects to or writes to a laboratory database.
import express from 'express';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH || 'D:/pharmacy-on/node_modules/playwright-core/index.mjs').href);
const app = express();
const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
app.use(express.static(dist));
app.get('*', (_req, res) => res.sendFile(`${dist}/index.html`));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = `http://127.0.0.1:${server.address().port}`;
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let role = 'ADMIN';
let worklistMode = 'empty';
let releaseWorklist;
const order = {
  id: 'theme-order', accession_no: 'UI-CHECK-001', patient_name: 'UI verification patient',
  age_value: 30, age_unit: 'years', gender: 'Female', sample_date: new Date().toISOString(),
  status: 'AUTHORIZED', sample_status: 'APPROVED', tests: [], audit: [], clinical_notes: [],
};
await page.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname;
  let data = [];
  if (path.endsWith('/config')) data = { hospital: { name: 'UI verification laboratory', address: '', phone: '' } };
  else if (path.endsWith('/setup/status')) data = { initialized: true };
  else if (path.endsWith('/auth/me')) data = { user: { id: 'ui-user', fullName: 'UI verification user', role } };
  else if (path.endsWith('/descriptions')) data = { profiles: {}, parameters: {} };
  else if (path.endsWith('/worklist')) {
    if (worklistMode === 'loading') await new Promise((resolve) => { releaseWorklist = resolve; });
    if (worklistMode === 'error') return route.fulfill({ status: 503, json: { message: 'Test API unavailable' } });
    data = worklistMode === 'populated' ? [{ ...order, tests: 'API investigation' }] : [];
  } else if (path.includes('/orders/theme-order')) data = order;
  else if (path.includes('/clinical/')) data = { items: [], hasMore: false };
  return route.fulfill({ json: { success: true, data } });
});

async function fitsViewport(label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: page overflows viewport`);
  assert.ok(await page.getByRole('navigation', { name: 'Main navigation' }).isVisible(), `${label}: navigation missing`);
  assert.ok(await page.locator('.user-identity').getByText('UI verification user').isVisible(), `${label}: current user hidden`);
  for (const span of await page.locator('.app-sidebar nav button span').all()) assert.ok(await span.isVisible(), `${label}: navigation label hidden`);
}

try {
  await fs.mkdir('test-results', { recursive: true });
  await page.addInitScript(() => localStorage.setItem('lis_token', 'ui-browser-fixture-only'));
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['/register', '/samples', '/patients', '/results', '/tests', '/team', '/records']) {
      await page.goto(`${base}${path}`);
      await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await fitsViewport(`${path} at ${width}px`);
      if (width === 1440 || width === 390) await page.screenshot({ path: `test-results/theme-${path.slice(1)}-${width}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  worklistMode = 'loading';
  await page.goto(`${base}/samples`);
  await page.getByText('Loading worklist…', { exact: true }).waitFor();
  assert.deepEqual(await page.locator('.stat strong').allTextContents(), ['—', '—', '—', '—']);
  worklistMode = 'populated'; releaseWorklist();
  await page.getByText(order.accession_no, { exact: true }).waitFor();
  assert.deepEqual(await page.locator('.stat strong').allTextContents(), ['0', '0', '1', '0']);
  await page.screenshot({ path: 'test-results/theme-samples-api.png', fullPage: true });
  worklistMode = 'error';
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('Worklist unavailable. Refresh to try again.').waitFor();
  assert.equal(await page.getByText(order.accession_no, { exact: true }).count(), 0);
  assert.deepEqual(await page.locator('.stat strong').allTextContents(), ['—', '—', '—', '—']);
  worklistMode = 'empty';
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByText('No orders match this view.').waitFor();
  assert.deepEqual(await page.locator('.stat strong').allTextContents(), ['0', '0', '0', '0']);
  await page.goto(`${base}/orders/theme-order/report`);
  await page.locator('.report-sheet').waitFor();
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.app-sidebar').isVisible(), false);
  assert.equal(await page.locator('.workspace-header').isVisible(), false);
  assert.equal(await page.locator('.report-actions').isVisible(), false);
  assert.ok(await page.locator('.report-sheet').isVisible());
  await page.pdf({ path: 'test-results/theme-report-print.pdf', format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 390, height: 844 });
  await fitsViewport('Report at 390px');
  role = 'DOCTOR';
  await page.goto(`${base}/patients`);
  await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Staff and departments', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Patient and order registration', exact: true }).count(), 0);
  await fitsViewport('Doctor at 390px');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: 'test-results/theme-login-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: seven routes at five widths, visible navigation/user, API-backed counts, loading/error/empty states, role navigation, sign-out and A4 print shell. Browser fixtures only; no database writes.');
} catch (error) {
  await page.screenshot({ path: 'test-results/theme-failure.png', fullPage: true });
  throw error;
} finally {
  releaseWorklist?.();
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
