import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { makeReportPdf } from '../dist/src/services/reportPdfService.js';

async function pdfText(bytes) {
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await loading.promise;
  let text = '';
  for (let page = 1; page <= pdf.numPages; page++) {
    const content = await (await pdf.getPage(page)).getTextContent();
    text += content.items.map((item) => item.str || '').join(' ') + '\n';
  }
  const pages = pdf.numPages;
  await loading.destroy();
  return { text, pages };
}
test('downloaded integration report preserves results and separately attributed notes', async () => {
  const result = await pdfText(await fs.readFile(new URL('../test-results/doctor-report.pdf', import.meta.url)));
  for (const expected of ['Synthetic Doctor Patient', 'Negative', 'Doctor clinical notes', 'Synthetic DOCTOR', 'follow-up arranged', 'Laboratory authorization']) assert.ok(result.text.includes(expected), expected);
  assert.match(result.text, /μmol\/L/);
  assert.match(result.text, /पुनः/);
});
test('long clinical notes paginate without dropping final text', async () => {
  const report = { accession_no: 'SYNTHETIC-LONG', patient_name: 'Synthetic long report', age_value: '25', age_unit: 'years', gender: 'Female', status: 'AUTHORIZED', sample_date: new Date(), authorized_at: new Date(), amendment_count: 0,
    tests: [], clinical_notes: [{ id: 'note', author_name: 'Synthetic Doctor', created_at: new Date(), body: 'Long note with medical unit μmol/L. '.repeat(130) + ' FINAL-NOTE-TEXT' }] };
  const bytes = await makeReportPdf(report);
  const result = await pdfText(bytes);
  assert.ok(result.pages > 1); assert.match(result.text, /FINAL-NOTE-TEXT/);
  assert.match(result.text, new RegExp(`Page ${result.pages} of ${result.pages}`));
});
