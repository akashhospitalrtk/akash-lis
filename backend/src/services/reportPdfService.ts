import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config } from '../config/env.js';
import { matchingRange } from './resultService.js';
import type { getOrderDetails } from './orderService.js';

type ReportData = Omit<NonNullable<Awaited<ReturnType<typeof getOrderDetails>>>, 'audit' | 'amendments'> & {
  authorized_by_name?: string; authorized_by_designation?: string; authorized_signature_label?: string;
};
function fontFile(name: string) {
  const file = [new URL(`../../assets/fonts/${name}`, import.meta.url), new URL(`../../../assets/fonts/${name}`, import.meta.url), resolve(process.cwd(), 'assets/fonts', name)].find(existsSync);
  if (!file) throw new Error(`Missing report font ${name}`);
  return typeof file === 'string' ? file : fileURLToPath(file);
}
function date(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value)) + ' IST' : '-';
}
export async function makeReportPdf(report: ReportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 44, bufferPages: true, info: { Title: `Laboratory report ${report.accession_no}`, Author: config.hospital.name } });
  doc.registerFont('Body', fontFile('NotoSans.ttf'));
  doc.registerFont('Hindi', fontFile('NotoSansDevanagari.ttf'));
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => { doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  function text(value: string, size = 10, color = '#172b4d', width = 507) {
    const runs = value.split(/([\u0900-\u097f\u200c\u200d]+)/).filter(Boolean);
    runs.forEach((run, index) => {
      doc.font(/[\u0900-\u097f]/.test(run) ? 'Hindi' : 'Body').fontSize(size).fillColor(color)
        .text(run, { width, lineGap: 3, continued: index < runs.length - 1 });
    });
  }
  function heading(value: string) {
    if (doc.y > 710) doc.addPage();
    doc.moveDown(.5); text(value, 13, '#235ca8'); doc.moveDown(.3);
  }
  text(config.hospital.name, 19, '#235ca8');
  if (config.hospital.address) text(config.hospital.address, 9);
  if (config.hospital.phone) text(`Phone: ${config.hospital.phone}`, 9);
  heading('Authorized laboratory report');
  const age = report.age_value ?? report.age_years;
  const ageText = age != null ? `${age} ${report.age_value != null ? report.age_unit || 'years' : 'years'}` : '-';
  const patientRows = [
    ['Patient name', report.patient_name, 'Patient ID / UHID', report.uhid || '-'],
    ['Age / Gender', `${ageText} / ${report.gender || '-'}`, 'Registered', date(report.sample_date)],
    // sample_date is registration time; no separate collection event is stored yet.
    ['Accession / SID', report.accession_no, 'Sample collected', 'Not recorded'],
    ['Referring doctor', report.referring_doctor || '-', 'Sample received', report.sample_received_at ? date(report.sample_received_at) : 'Not recorded'],
    ['Patient type', report.patient_type || '-', 'Report date / time', report.authorized_at ? date(report.authorized_at) : 'Pending authorization'],
  ];
  function patientField(label: string, value: string, x: number, y: number) {
    doc.x = x; doc.y = y; text(label, 9, '#172b4d', 87);
    const labelBottom = doc.y;
    doc.x = x + 89; doc.y = y; text(':', 9, '#172b4d', 5);
    doc.x = x + 99; doc.y = y; text(value, 9, '#172b4d', 144);
    return Math.max(labelBottom, doc.y);
  }
  for (const [leftLabel, leftValue, rightLabel, rightValue] of patientRows) {
    const y = doc.y;
    const leftBottom = patientField(leftLabel, leftValue, 44, y);
    const rightBottom = patientField(rightLabel, rightValue, 308, y);
    doc.x = 44; doc.y = Math.max(leftBottom, rightBottom) + 3;
  }
  for (const test of report.tests) {
    heading(test.profile_name);
    for (const result of test.results) {
      if (doc.y > 700) doc.addPage();
      const range = matchingRange(result.reference_ranges, report);
      const reference = range ? range.low != null || range.high != null ? `${range.low ?? '-'} – ${range.high ?? '-'}` : range.label || '-' : '-';
      text(`${result.parameter_name}: ${result.result_value || '-'} ${result.unit || ''}    Flag: ${result.abnormal_flag || 'Normal'}`, 10);
      text(`Reference: ${reference}${result.reference_note ? '\n' + result.reference_note : ''}`, 9);
      if (result.method) text(`Method: ${result.method}`, 8);
      if (result.comments) text(`Comment: ${result.comments}`, 9);
      if (result.description) text(result.description, 9);
      doc.moveDown(.4);
    }
    if (test.description) text(`Test information: ${test.description}`, 9);
    if (test.remarks) text(`Remarks: ${test.remarks}`, 9);
  }
  if (report.amendment_count) { heading(`Laboratory amendment ${report.amendment_count}`); text(report.amendment_reason || 'Corrected report.'); }
  heading('Laboratory authorization');
  text(`${report.authorized_by_name || 'Authorized signatory'}${report.authorized_by_designation ? ' · ' + report.authorized_by_designation : ''}`);
  text(`Authorized: ${date(report.authorized_at)}`, 9);
  if (report.clinical_notes.length) {
    heading('Doctor clinical notes');
    text('Independently authored clinical notes. Laboratory authorization applies to laboratory results; notes may be added later.', 8);
    for (const note of report.clinical_notes) {
      heading(`${note.author_name}${note.author_designation ? ' · ' + note.author_designation : ''}`);
      text(date(note.created_at), 8); text(note.body);
    }
  }
  doc.moveDown(); text('Interpret results with the patient’s history and examination. Reference intervals are laboratory- and method-specific.', 8);
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc.font('Body').fontSize(8).fillColor('#56657a').text(`${report.accession_no} · Revision ${report.amendment_count || 0} · Page ${i + 1} of ${pages.count}`, 44, 807, { lineBreak: false });
  }
  doc.end();
  return finished;
}
