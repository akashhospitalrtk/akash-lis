import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeReportPdf } from '../dist/src/services/reportPdfService.js';
import { defaultReportTemplate } from '../dist/src/schemas/reportTemplateSchema.js';

const report = {
  accession_no: 'SYNTHETIC-HEADER-001', patient_name: 'Synthetic Patient', uhid: 'TEST-UHID-001',
  age_value: 1, age_unit: 'months', gender: 'Male', patient_type: 'OPD', referring_doctor: 'Synthetic Doctor',
  created_at: '2026-09-12T09:30:00Z', sample_date: '2026-09-12T09:35:00Z', sample_received_at: null,
  authorized_at: '2026-09-12T10:00:00Z', amendment_count: 0, tests: [], clinical_notes: [],
};

test('header alignment and font sizes affect the actual PDF', async () => {
  async function brand(alignment) {
    const bytes = await makeReportPdf(report, { ...defaultReportTemplate, brandName: 'TEST LAB', brandFontPt: 40, headerAlignment: alignment });
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    try {
      const pdf = await task.promise;
      return (await (await pdf.getPage(1)).getTextContent()).items.find(item => item.str === 'TEST LAB');
    } finally { await task.destroy(); }
  }
  const left = await brand('left'), center = await brand('center'), right = await brand('right');
  assert.equal(left.height, 40);
  assert.ok(left.transform[4] < center.transform[4] && center.transform[4] < right.transform[4]);
});

test('split letterhead keeps branding left and contact details right with independent alignment', async () => {
  const bytes = await makeReportPdf(report, { ...defaultReportTemplate, brandName: 'CUSTOM LAB', brandFontPt: 40, headerGapMm: 12, footerGapMm: 12 });
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const { items } = await (await pdf.getPage(1)).getTextContent();
    const brand = items.find(item => item.str === 'CUSTOM LAB');
    assert.equal(brand.transform[4], 90);
    const phone = items.find(item => item.str === defaultReportTemplate.phone && item.transform[5] > 700);
    assert.ok(Math.abs(phone.transform[4] + phone.width - (595.28 - 44)) < 1);
    assert.ok(phone.transform[4] > 352 + 12 * 72 / 25.4);
    const location = items.find(item => item.str === defaultReportTemplate.locationLine);
    assert.ok(Math.abs(location.transform[4] + location.width - (595.28 - 44)) < 1);
    const footerPhone = items.find(item => item.str === defaultReportTemplate.phone && item.transform[5] < 120);
    assert.ok(Math.abs(footerPhone.transform[4] + footerPhone.width - (595.28 - 44)) < 1);
  } finally { await task.destroy(); }
});

test('PDF patient header uses aligned labels and values in two columns', async () => {
  const bytes = await makeReportPdf(report, { ...defaultReportTemplate, patientLayout: 'bordered' });
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await writeFile(new URL('../test-results/report-header.pdf', import.meta.url), bytes);
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const { items } = await (await pdf.getPage(1)).getTextContent();
    const find = value => items.find(item => item.str === value);
    for (const label of ['Name', 'Age / Gender', 'Ref. Dr.', 'Mobile', 'Patient type', 'Sample collected']) {
      assert.equal(find(label)?.transform[4], 44, label);
    }
    for (const label of ['UHID / Patient ID', 'Report / SID No.', 'Reg. Date', 'Sample received', 'Rep. Date']) {
      assert.equal(find(label)?.transform[4], 308, label);
    }
    assert.equal(find('Synthetic Patient')?.transform[4], 143);
    assert.notEqual(find('Name')?.fontName, find('Synthetic Patient')?.fontName, 'bold labels use an embedded bold font');
    assert.equal(find('TEST-UHID-001')?.transform[4], 407);
    assert.equal(find('Name')?.transform[5], find('UHID / Patient ID')?.transform[5]);
    assert.ok(find('1 months / Male'));
    assert.ok(find('Not recorded'));
    const collected = find('Sample collected');
    assert.ok(items.some(item => item.str === 'Not recorded' && item.transform[4] === 143 && Math.abs(item.transform[5] - collected.transform[5]) < 1.1), 'registration time is not presented as collection time; bold and regular font baselines align');
    assert.equal(pdf.numPages, 1);
  } finally { await task.destroy(); }
});

test('letterhead repeats on every page and long results and notes stay inside reserved margins', async () => {
  const multi = { ...report, tests: [{ profile_name: 'Synthetic panel', results: Array.from({ length: 65 }, (_, i) => ({
    parameter_name: `Measurement-${i}`, result_value: String(i), unit: 'µmol/L', reference_ranges: [], method: 'Synthetic method',
    description: i === 20 ? 'Long explanatory text. '.repeat(150) + ' END-DESCRIPTION' : null,
  })) }], clinical_notes: [{ author_name: 'Synthetic Doctor', created_at: report.authorized_at, body: 'Clinical note text. '.repeat(450) + ' FINAL-NOTE-TEXT' }] };
  const bytes = await makeReportPdf(multi);
  await writeFile(new URL('../test-results/report-letterhead-multipage.pdf', import.meta.url), bytes);
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    assert.ok(pdf.numPages > 2 && pdf.numPages < 20);
    let all = '';
    let fixedPositions;
    for (let p = 1; p <= pdf.numPages; p++) {
      const { items } = await (await pdf.getPage(p)).getTextContent();
      const text = items.map(i => i.str).join(' '); all += text;
      assert.ok(text.includes('AKASH'), `page ${p} header`);
      assert.ok(text.includes('Inside Akash Hospital'), `page ${p} location`);
      assert.ok(text.includes('Helpline No.'), `page ${p} footer`);
      assert.ok(text.includes(`Page ${p} of ${pdf.numPages}`));
      const signature = items.find(item => item.str === 'Authorized signatory');
      assert.ok(signature, `page ${p}: signatory repeated`);
      assert.ok(Math.abs(signature.transform[4] + signature.width - (595.28 - 44)) < 1, 'signature right aligned');
      assert.ok(items.some(item => item.str === 'Digitally authorised'));
      const positions = ['AKASH', 'Inside Akash Hospital', 'Helpline No.', 'Authorized signatory'].map(label => {
        const item = items.find(item => item.str === label);
        assert.ok(item, label);
        return item.transform.slice(4, 6);
      });
      if (!fixedPositions) fixedPositions = positions;
      assert.deepEqual(positions, fixedPositions, `page ${p}: letterhead stays fixed`);
      for (const item of items.filter(i => /Measurement-\d+/.test(i.str) || i.str.includes('Clinical note text.') || i.str.includes('Long explanatory text.'))) {
        const y = 841.89 - item.transform[5];
        assert.ok(y > defaultReportTemplate.headerHeightMm * 72 / 25.4 && y < 841.89 - defaultReportTemplate.footerHeightMm * 72 / 25.4 - 90, `page ${p}: content stays above signature y=${y}`);
      }
    }
    assert.ok(all.includes('Measurement-64'));
    assert.ok(all.replace(/\s+/g, '').includes('END-DESCRIPTION'));
    assert.ok(all.replace(/\s+/g, '').includes('FINAL-NOTE-TEXT'));
  } finally { await task.destroy(); }
});

test('amendment history stays off the patient PDF and multiple panels retain result columns', async () => {
  const bytes = await makeReportPdf({ ...report, amendment_count: 2,
    amendment_reason: 'INTERNAL-ONLY-AMENDMENT-REASON',
    tests: Array.from({ length: 12 }, (_, panel) => ({ profile_name: `Panel ${panel}`,
      results: Array.from({ length: 8 }, (_, row) => ({ parameter_name: `Analyte ${panel}-${row}`,
        result_value: '12.5', unit: 'U/L', reference_ranges: [], method: 'Synthetic method' }))
    })) });
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    assert.ok(pdf.numPages > 1);
    let all = '';
    for (let page = 1; page <= pdf.numPages; page++) {
      const { items } = await (await pdf.getPage(page)).getTextContent();
      const words = items.map(item => item.str).join(' ');
      all += words;
      for (const label of ['AKASH', 'Helpline No.', 'Test name', 'Result', 'Unit', 'Reference range']) {
        assert.ok(words.includes(label), `page ${page}: ${label}`);
      }
      for (const item of items.filter(item => item.str.startsWith('Analyte '))) {
        const y = 841.89 - item.transform[5];
        assert.ok(y > defaultReportTemplate.headerHeightMm * 72 / 25.4 && y < 841.89 - defaultReportTemplate.footerHeightMm * 72 / 25.4 - 10);
      }
    }
    assert.doesNotMatch(all, /amend|revision|INTERNAL-ONLY/i);
    for (let panel = 0; panel < 12; panel++) {
      for (let row = 0; row < 8; row++) assert.ok(all.includes(`Analyte ${panel}-${row}`));
    }
  } finally { await task.destroy(); }
});

test('custom design changes PDF labels, header/footer copy and optional sample fields', async () => {
  const template = { ...defaultReportTemplate, brandName: 'CUSTOM LAB', phone: 'TEST-PHONE', headerHeightMm: 45, footerHeightMm: 45,
    bodyFontPt: 11, patientLayout: 'minimal', dateStyle: 'date', showSampleDates: false,
    supportLine: 'CUSTOM SUPPORT', labels: { ...defaultReportTemplate.labels, name: 'Patient full name' } };
  const bytes = await makeReportPdf(report, template);
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 1);
    const { items } = await (await pdf.getPage(1)).getTextContent();
    const text = items.map(i => i.str).join(' ');
    assert.ok(text.includes('CUSTOM LAB') && text.includes('CUSTOM SUPPORT') && text.includes('TEST-PHONE'));
    assert.ok(text.includes('Patient full name'));
    assert.ok(!text.includes('Sample collected') && !text.includes('Sample received'));
  } finally { await task.destroy(); }
});

test('whole investigations move to a fresh page and parameter explanations stay with their values', async () => {
  const tests = Array.from({ length: 4 }, (_, panel) => ({ profile_name: `Whole panel ${panel}`,
    results: Array.from({ length: 4 }, (_, row) => ({ parameter_name: `Complete-${panel}-${row}`, result_value: '12.5',
      unit: 'U/L', reference_ranges: [], method: 'Synthetic', description: `Explanation-${panel}-${row} ` + 'Explanation text. '.repeat(5) + ` END-${panel}-${row}` }))
  }));
  const bytes = await makeReportPdf({ ...report, tests });
  await writeFile(new URL('../test-results/report-kept-panels.pdf', import.meta.url), bytes);
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let page = 1; page <= pdf.numPages; page++) pages.push((await (await pdf.getPage(page)).getTextContent()).items.map(item => item.str).join(' '));
    assert.ok(pdf.numPages > 1);
    for (let panel = 0; panel < 4; panel++) {
      const page = pages.find(content => content.includes(`Whole panel ${panel}`));
      assert.ok(page);
      for (let row = 0; row < 4; row++) {
        assert.ok(page.includes(`Complete-${panel}-${row}`), 'whole investigation is on same page');
        assert.ok(page.includes(`END-${panel}-${row}`), 'explanation stays with its parameter');
      }
    }
  } finally { await task.destroy(); }
});

test('oversized investigations break only between complete ordinary parameters', async () => {
  const bytes = await makeReportPdf({ ...report, tests: [{ profile_name: 'Large investigation',
    results: Array.from({ length: 25 }, (_, i) => ({ parameter_name: `PARAMETER-${i}-START`, result_value: '1',
      unit: 'U/L', reference_ranges: [], method: 'Method text. '.repeat(8), comments: 'Comment text. '.repeat(8),
      description: 'Description text. '.repeat(12) + ` PARAMETER-${i}-END` })) }] });
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let page = 1; page <= pdf.numPages; page++) pages.push((await (await pdf.getPage(page)).getTextContent()).items.map(item => item.str).join(' '));
    assert.ok(pages.length > 2);
    for (let i = 0; i < 25; i++) {
      const page = pages.find(content => content.includes(`PARAMETER-${i}-START`));
      assert.ok(page?.includes(`PARAMETER-${i}-END`), `parameter ${i} stays complete`);
    }
  } finally { await task.destroy(); }
});

test('long names wrap within the PDF column, retaining missing-value fallbacks', async () => {
  const bytes = await makeReportPdf({ ...report, patient_name: 'Synthetic very long patient name '.repeat(4) + 'ENDNAME', uhid: null, authorized_at: null }, { ...defaultReportTemplate, patientLayout: 'bordered' });
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const { items } = await (await pdf.getPage(1)).getTextContent();
    const end = items.find(item => item.str.includes('ENDNAME'));
    const next = items.find(item => item.str === 'Age / Gender');
    assert.ok(end && next);
    assert.ok(end.transform[5] > next.transform[5], 'next row must be below wrapped name');
    for (const item of items.filter(item => item.transform[4] === 143 && item.transform[5] >= end.transform[5])) {
      assert.ok(item.transform[4] + item.width <= 287.5, 'name stays inside left column');
    }
    assert.ok(items.some(item => item.str.includes('Pending authorization')));
  } finally { await task.destroy(); }
});
