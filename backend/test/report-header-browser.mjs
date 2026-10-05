import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
const template = JSON.parse(await readFile(new URL('../src/config/reportTemplate.defaults.json', import.meta.url), 'utf8'));

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH || 'D:/pharmacy-on/node_modules/playwright-core/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const order = {
  id: 'synthetic-header', accession_no: 'SYNTHETIC-001', patient_name: 'Synthetic Patient',
  uhid: 'TEST-001', age_value: 1, age_unit: 'months', gender: 'Male', patient_type: 'OPD',
  referring_doctor: 'Synthetic Doctor', created_at: '2026-09-12T09:30:00Z', sample_date: '2026-09-12T09:35:00Z',
  authorized_at: '2026-09-12T10:00:00Z', status: 'AUTHORIZED', sample_status: 'APPROVED',
  amendment_count: 2, amendment_reason: 'INTERNAL-ONLY-AMENDMENT-REASON',
  tests: [{ id: 'synthetic-panel', profile_name: 'Synthetic panel', results: [{ id: 'synthetic-result',
    parameter_name: 'Synthetic analyte', result_kind: 'NUMERIC', result_value: '12.5', unit: 'U/L', reference_ranges: [] }] }], clinical_notes: [],
};
// Synthetic API fixtures only; never reads or writes patient records.
await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  let data = [];
  if (path.endsWith('/config')) data = { hospital: { name: 'Synthetic Laboratory', phone: '', address: '' } };
  else if (path.endsWith('/setup/status')) data = { initialized: true };
  else if (path.endsWith('/report-template')) data = { template, revision: 0 };
  else if (path.endsWith('/auth/me')) data = { user: { id: 'synthetic-user', fullName: 'Synthetic Operator', role: 'ADMIN' } };
  else if (path.endsWith('/orders/synthetic-header')) data = order;
  await route.fulfill({ json: { success: true, data } });
});
try {
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.addInitScript(() => localStorage.setItem('lis_token', 'synthetic-token'));
  await page.goto(`${process.env.REPORT_UI_URL || 'http://localhost:4181'}/orders/synthetic-header/report`);
  await page.locator('.report-patient-name').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const sheet = page.locator('.report-sheet');
  assert.doesNotMatch(await sheet.innerText(), /amend|revision|INTERNAL-ONLY/i);
  assert.deepEqual(await sheet.locator('thead th').allTextContents(), ['Test name', 'Result', 'Unit', 'Reference range']);
  assert.equal(await sheet.locator('.letterhead-contact-icon').count(), 2);
  const labelWeights = await sheet.locator('.report-patient-row').first().evaluate(row => ({
    label: Number(getComputedStyle(row.querySelector('dt')).fontWeight),
    value: Number(getComputedStyle(row.querySelector('dd')).fontWeight)
  }));
  assert.ok(labelWeights.label > labelWeights.value, 'patient labels are heavier than values');
  assert.equal(await sheet.locator('.signature').evaluate(el => getComputedStyle(el).textAlign), 'right');
  async function checkColumns(count) {
    const measurements = await page.locator('.report-patient').evaluate(section => {
      const columns = [...section.querySelectorAll('dl')];
      return {
        columns: getComputedStyle(section).gridTemplateColumns.split(' ').length,
        aligned: columns.every(column => {
          const rows = [...column.querySelectorAll('.report-patient-row')];
          const x = rows[0].querySelector('dd').getBoundingClientRect().x;
          return rows.every(row => Math.abs(row.querySelector('dd').getBoundingClientRect().x - x) < 1);
        }),
        fits: [...section.querySelectorAll('dd')].every(value => value.scrollWidth <= value.clientWidth + 1),
      };
    });
    assert.equal(measurements.columns, count);
    if (count === 2) assert.ok(measurements.aligned);
    assert.ok(measurements.fits);
  }
  await checkColumns(3);
  const groups = await page.locator('.letterhead-header').evaluate(el => {
    const brand = el.querySelector('.letterhead-brand'), contact = el.querySelector('.letterhead-contact');
    return { left: getComputedStyle(brand).textAlign, right: getComputedStyle(contact).textAlign, gap: contact.getBoundingClientRect().left - brand.getBoundingClientRect().right };
  });
  assert.equal(groups.left, 'left'); assert.equal(groups.right, 'right'); assert.ok(groups.gap >= template.headerGapMm * 96 / 25.4);
  assert.equal(await page.locator('.letterhead-helpline').evaluate(el => getComputedStyle(el).textAlign), 'right');
  assert.equal(await page.locator('.report-patient-row').filter({ has: page.locator('dt', { hasText: 'Sample collected' }) }).locator('dd').innerText(), 'Not recorded');
  await page.locator('.report-sheet').screenshot({ path: new URL('../test-results/report-header-desktop.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  order.patient_name = 'Synthetic Very Long Patient Name '.repeat(4);
  await page.reload();
  await page.locator('.report-patient-name').first().waitFor();
  await checkColumns(3);
  await page.setViewportSize({ width: 390, height: 900 });
  await checkColumns(1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 794, height: 1123 });
  await checkColumns(3);
  // The supported Print report action now opens the canonical server PDF, not
  // window.print() on this HTML draft. Its output is covered by the integration test.
  assert.deepEqual(errors, []);
  console.log('PASS: desktop, long names, mobile and A4 print patient-header alignment; synthetic API fixtures only.');
} finally { await browser.close(); }
