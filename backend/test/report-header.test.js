import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeReportPdf } from '../dist/src/services/reportPdfService.js';

const report = {
  accession_no: 'SYNTHETIC-HEADER-001', patient_name: 'Synthetic Patient', uhid: 'TEST-UHID-001',
  age_value: 1, age_unit: 'months', gender: 'Male', patient_type: 'OPD', referring_doctor: 'Synthetic Doctor',
  created_at: '2026-09-12T09:30:00Z', sample_date: '2026-09-12T09:35:00Z', sample_received_at: null,
  authorized_at: '2026-09-12T10:00:00Z', amendment_count: 0, tests: [], clinical_notes: [],
};

test('PDF patient header uses aligned labels and values in two columns', async () => {
  const bytes = await makeReportPdf(report);
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await writeFile(new URL('../test-results/report-header.pdf', import.meta.url), bytes);
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const pdf = await task.promise;
    const { items } = await (await pdf.getPage(1)).getTextContent();
    const find = value => items.find(item => item.str === value);
    for (const label of ['Patient name', 'Age / Gender', 'Accession / SID', 'Referring doctor', 'Patient type']) {
      assert.equal(find(label)?.transform[4], 44, label);
    }
    for (const label of ['Patient ID / UHID', 'Registered', 'Sample collected', 'Sample received', 'Report date / time']) {
      assert.equal(find(label)?.transform[4], 308, label);
    }
    assert.equal(find('Synthetic Patient')?.transform[4], 143);
    assert.equal(find('TEST-UHID-001')?.transform[4], 407);
    assert.equal(find('Patient name')?.transform[5], find('Patient ID / UHID')?.transform[5]);
    assert.ok(find('1 months / Male'));
    assert.ok(find('Not recorded'));
    const collected = find('Sample collected');
    assert.ok(items.some(item => item.str === 'Not recorded' && item.transform[4] === 407 && item.transform[5] === collected.transform[5]), 'registration time is not presented as collection time');
    assert.equal(pdf.numPages, 1);
  } finally { await task.destroy(); }
});

test('long names wrap within the PDF column, retaining missing-value fallbacks', async () => {
  const bytes = await makeReportPdf({ ...report, patient_name: 'Synthetic very long patient name '.repeat(4) + 'END-NAME', uhid: null, authorized_at: null });
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
