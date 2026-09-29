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
    assert.equal(find('TEST-UHID-001')?.transform[4], 407);
    assert.equal(find('Name')?.transform[5], find('UHID / Patient ID')?.transform[5]);
    assert.ok(find('1 months / Male'));
    assert.ok(find('Not recorded'));
    const collected = find('Sample collected');
    assert.ok(items.some(item => item.str === 'Not recorded' && item.transform[4] === 143 && item.transform[5] === collected.transform[5]), 'registration time is not presented as collection time');
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
    for (let p = 1; p <= pdf.numPages; p++) {
      const { items } = await (await pdf.getPage(p)).getTextContent();
      const text = items.map(i => i.str).join(' '); all += text;
      assert.ok(text.includes('AKASH'), `page ${p} header`);
      assert.ok(text.includes('Inside Akash Hospital'), `page ${p} location`);
      assert.ok(text.includes('Helpline No.'), `page ${p} footer`);
      assert.ok(text.includes(`Page ${p} of ${pdf.numPages}`));
      for (const item of items.filter(i => /Measurement-\d+/.test(i.str) || i.str.includes('Clinical note text.') || i.str.includes('Long explanatory text.'))) {
        const y = 841.89 - item.transform[5];
        assert.ok(y > 38 * 72 / 25.4 && y < 841.89 - 34 * 72 / 25.4 - 10, `page ${p}: content y=${y}`);
      }
    }
    assert.ok(all.includes('Measurement-64'));
    assert.ok(all.includes('END-DESCRIPTION'));
    assert.ok(all.includes('FINAL-NOTE-TEXT'));
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

test('long names wrap within the PDF column, retaining missing-value fallbacks', async () => {
  const bytes = await makeReportPdf({ ...report, patient_name: 'Synthetic very long patient name '.repeat(4) + 'END-NAME', uhid: null, authorized_at: null }, { ...defaultReportTemplate, patientLayout: 'bordered' });
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const { items } = await (await pdf.getPage(1)).getTextContent();
    const end = items.find(item => item.str.includes('END-NAME'));
    const next = items.find(item => item.str === 'Age / Gender');
    assert.ok(end && next);
    assert.ok(end.transform[5] > next.transform[5], 'next row must be below wrapped name');
    for (const item of items.filter(item => item.transform[4] === 143 && item.transform[5] >= end.transform[5])) {
      assert.ok(item.transform[4] + item.width <= 287.5, 'name stays inside left column');
    }
    assert.ok(items.some(item => item.str.includes('Pending authorization')));
  } finally { await task.destroy(); }
});
