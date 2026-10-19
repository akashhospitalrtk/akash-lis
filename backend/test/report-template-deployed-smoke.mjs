// Run inside the deployed backend via stdin. Reads the saved template only;
// the report is synthetic and is never inserted into the clinical database.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { getReportTemplate } from './dist/src/services/reportTemplateService.js';
import { makeReportPdf } from './dist/src/services/reportPdfService.js';
import { pool } from './dist/src/database/pool.js';
try {
  const { template, revision } = await getReportTemplate();
  assert.equal(typeof template.brandFontPt, 'number');
  assert.equal(typeof template.footerFontPt, 'number');
  assert.ok(['left', 'center', 'right'].includes(template.headerAlignment));
  assert.ok(['left', 'center', 'right'].includes(template.headerContactAlignment));
  assert.ok(['left', 'center', 'right'].includes(template.footerContactAlignment));
  assert.ok(template.headerGapMm >= 3 && template.headerGapMm <= 12);
  assert.ok(template.footerGapMm >= 3 && template.footerGapMm <= 12);
  const bytes = await makeReportPdf({
    accession_no: 'DEPLOYMENT-DESIGN-SMOKE', patient_name: 'SYNTHETIC PREVIEW ONLY', uhid: 'TEST-ONLY',
    age_value: 30, age_unit: 'years', gender: 'Female', patient_type: 'OPD', referring_doctor: 'Sample referring doctor',
    sample_date: '2026-09-29T04:30:00Z', authorized_at: '2026-09-29T06:00:00Z', amendment_count: 0,
    tests: [{ profile_name: 'SYNTHETIC LAYOUT CHECK', results: [{ parameter_name: 'Example parameter', result_value: 'Example', unit: '-', reference_ranges: [] }] }],
    clinical_notes: [], authorized_by_name: 'Sample signatory'
  }, template);
  assert.ok(bytes.length > 10000);
  await writeFile('/tmp/lis-report-design-smoke.pdf', bytes);
  console.log(JSON.stringify({ savedTemplateRead: true, revision, syntheticPdfBytes: bytes.length, clinicalRecordsChanged: false }));
} finally { await pool.end(); }
