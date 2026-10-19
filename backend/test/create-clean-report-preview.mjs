// Synthetic layout artifact only. Does not connect to the database.
import { mkdir, writeFile } from 'node:fs/promises';
import { makeReportPdf } from '../dist/src/services/reportPdfService.js';

const order = {
  accession_no: 'DESIGN-PREVIEW-001', patient_name: 'SYNTHETIC PATIENT', uhid: 'SAMPLE-001',
  age_value: 30, age_unit: 'years', gender: 'Female', mobile: 'Not supplied', patient_type: 'OPD',
  referring_doctor: 'Sample referring doctor', sample_date: '2026-10-12T03:30:00Z',
  sample_received_at: '2026-10-12T03:45:00Z', authorized_at: '2026-10-12T05:00:00Z',
  authorized_by_name: 'Sample signatory', authorized_by_designation: 'Laboratory specialist',
  clinical_notes: [], tests: [{ profile_name: 'Haematology — sample layout',
    remarks: 'DESIGN PREVIEW ONLY. These are illustrative values, not a patient report.',
    results: [
      ['Haemoglobin', '12.8', 'g/dL', '12.0 – 15.0', 'Photometry'],
      ['Total leucocyte count', '6.80', '×10³/µL', '4.0 – 10.0', 'Impedance'],
      ['Platelet count', '245', '×10³/µL', '150 – 410', 'Impedance'],
      ['Red blood cell count', '4.32', '×10⁶/µL', '3.8 – 4.8', 'Impedance'],
      ['Haematocrit', '39.0', '%', '36 – 46', 'Calculated']
    ].map(([parameter_name, result_value, unit, label, method]) => ({ parameter_name, result_value, unit, method, reference_ranges: [{ label }] }))
  }]
};
await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
await writeFile(new URL('../test-results/clean-hospital-report-preview.pdf', import.meta.url), await makeReportPdf(order));
await writeFile(new URL('../test-results/clean-hospital-long-name.pdf', import.meta.url), await makeReportPdf({ ...order, patient_name: 'Synthetic very long patient name '.repeat(4) + 'END-NAME' }));
console.log('Synthetic clean report preview written.');
