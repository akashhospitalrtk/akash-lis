import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH || 'D:/pharmacy-on/node_modules/playwright-core/index.mjs').href);
const template = JSON.parse(await readFile(new URL('../src/config/reportTemplate.defaults.json', import.meta.url), 'utf8'));
const profiles = Array.from({ length: 150 }, (_, i) => ({ id: `test-${i}`, name: `Synthetic investigation ${String(i).padStart(3, '0')}`, code: `T${i}`, department: `Department ${Math.floor(i / 30)}`, specimen_type: 'Synthetic specimen', parameters: [], active: true }));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], submissions = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/orders' && route.request().method() === 'POST') {
      submissions.push(route.request().postDataJSON());
      return route.fulfill({ status: 400, json: { message: 'Synthetic test: no patient record created.' } });
    }
    const data = path.endsWith('/config') ? { hospital: { name: 'Synthetic Laboratory' } }
      : path.endsWith('/setup/status') ? { initialized: true }
      : path.endsWith('/auth/me') ? { user: { id: 'synthetic', fullName: 'Synthetic Operator', role: 'ADMIN' } }
      : path.endsWith('/report-template') ? { template, revision: 0 }
      : path.endsWith('/profiles') ? profiles : [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript(() => localStorage.setItem('lis_token', 'synthetic-only'));
  await page.goto(`${process.env.REPORT_UI_URL || 'http://localhost:4182'}/register`);
  const list = page.getByRole('region', { name: 'Available investigations', exact: true });
  await list.locator('input').first().waitFor();
  assert.equal(await list.locator('input').count(), 150);
  const geometry = await list.evaluate(el => ({ height: el.clientHeight, content: el.scrollHeight }));
  assert.ok(geometry.height <= 360 && geometry.content > geometry.height * 4);
  await list.locator('input').first().check();
  await page.getByLabel('Search investigations', { exact: true }).fill('149');
  assert.equal(await list.locator('input').count(), 1);
  await list.locator('input').check();
  assert.equal(await page.getByRole('region', { name: 'Selected investigations', exact: true }).getByRole('button').count(), 2);
  await page.getByLabel('Search investigations', { exact: true }).fill('no matching test');
  assert.ok(await list.getByText('No active investigation matches', { exact: false }).isVisible());
  await page.getByLabel('Search investigations', { exact: true }).fill('');
  await list.focus(); await page.keyboard.press('End');
  await page.waitForFunction(() => document.querySelector('.investigation-scroll').scrollTop > 0);
  await page.getByLabel('Patient name *', { exact: true }).fill('Synthetic Layout Patient');
  for (const [name, mode] of [['Submit sample', 'SAMPLE'], ['Submit & enter values', 'RESULTS']]) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(submissions.at(-1).entryMode, mode);
    assert.deepEqual(submissions.at(-1).profileIds, ['test-0', 'test-149']);
  }
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Submit sample', exact: true }).click();
  assert.match(await page.getByRole('alert').innerText(), /Select at least one/);
  assert.equal(submissions.length, 2);
  await page.reload();
  await list.locator('input').first().waitFor();
  await list.locator('input').first().check();
  await page.getByLabel('Patient name *', { exact: true }).fill('Synthetic Layout Patient');
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  for (const [width, height, label] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    await page.setViewportSize({ width, height });
    if (width < 560) assert.ok((await page.locator('.patient-typeahead').boundingBox()).height < 80, 'Mobile patient search must not reserve a large blank area');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const box = await page.getByRole('button', { name: 'Submit sample', exact: true }).boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= height);
    await page.screenshot({ path: fileURLToPath(new URL(`../test-results/registration-${label}.png`, import.meta.url)), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: 150-test catalogue stays bounded; search and selections persist; both submit modes preserved; validation, keyboard scrolling and mobile checked. No real records created.');
} finally { await browser.close(); }
