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
  function text(value: string, size = 10, color = '#172b4d') {
    const runs = value.split(/([\u0900-\u097f\u200c\u200d]+)/).filter(Boolean);
    runs.forEach((run, index) => {
      doc.font(/[\u0900-\u097f]/.test(run) ? 'Hindi' : 'Body').fontSize(size).fillColor(color)
        .text(run, { width: 507, lineGap: 3, continued: index < runs.length - 1 });
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
  text(`Patient: ${report.patient_name}    UHID: ${report.uhid || '-'}`);
  text(`Accession: ${report.accession_no}    Revision: ${report.amendment_count || 0}`);
  text(`Age: ${report.age_value ?? report.age_years ?? '-'} ${report.age_value != null ? report.age_unit : 'years'}    Sex: ${report.gender || '-'}    Type: ${report.patient_type || '-'}`);
  text(`Referring doctor: ${report.referring_doctor || '-'}`);
  text(`Sample: ${date(report.sample_date)}    Authorized: ${date(report.authorized_at)}`, 9);
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
