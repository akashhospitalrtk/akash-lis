import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { matchingRange } from './resultService.js';
import { defaultReportTemplate, reportTemplateSchema, type ReportTemplate } from '../schemas/reportTemplateSchema.js';
import type { getOrderDetails } from './orderService.js';

type ReportData = Omit<NonNullable<Awaited<ReturnType<typeof getOrderDetails>>>, 'audit' | 'amendments'> & {
  authorized_by_name?: string; authorized_by_designation?: string; authorized_signature_label?: string;
};
function assetFile(name: string) {
  const file = [new URL(`../../assets/${name}`, import.meta.url), new URL(`../../../assets/${name}`, import.meta.url), resolve(process.cwd(), 'assets', name)].find(existsSync);
  if (!file) throw new Error(`Missing report asset ${name}`);
  return typeof file === 'string' ? file : fileURLToPath(file);
}

export async function makeReportPdf(report: ReportData, input: ReportTemplate = defaultReportTemplate): Promise<Buffer> {
  const t = reportTemplateSchema.parse(input);
  const mm = 72 / 25.4, width = 595.28, height = 841.89, left = 44, contentWidth = width - left * 2;
  const headerHeight = t.headerHeightMm * mm, footerHeight = t.footerHeightMm * mm;
  const bodyTop = headerHeight + 17, bodyBottom = height - footerHeight - 22;
  const doc = new PDFDocument({ size: 'A4', margins: { top: bodyTop, bottom: height - bodyBottom, left, right: left }, bufferPages: true,
    info: { Title: `Laboratory report ${report.accession_no}`, Author: `${t.brandName} ${t.subtitle}` } });
  doc.registerFont('Body', assetFile('fonts/NotoSans.ttf'));
  doc.registerFont('Hindi', assetFile('fonts/NotoSansDevanagari.ttf'));
  const emblem = assetFile('letterhead/emblem.png'), badge = assetFile('letterhead/beti-bachao.png');
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
  });
  function date(value: Date | string | null | undefined) {
    return value ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric',
      ...(t.dateStyle === 'date-time' ? { hour: '2-digit', minute: '2-digit' } as const : {}), timeZone: 'Asia/Kolkata' }).format(new Date(value)) + (t.dateStyle === 'date-time' ? ' IST' : '') : 'Not recorded';
  }
  function text(value: string, size = t.bodyFontPt, color = '#252531', textWidth = contentWidth) {
    const runs = value.split(/([\u0900-\u097f\u200c\u200d]+)/).filter(Boolean);
    runs.forEach((run, index) => {
      doc.font(/[\u0900-\u097f]/.test(run) ? 'Hindi' : 'Body').fontSize(size).fillColor(color)
        .text(run, { width: textWidth, lineGap: 2, continued: index < runs.length - 1 });
    });
  }
  function at(value: string, x: number, y: number, w: number, size = t.bodyFontPt, color = '#252531') {
    doc.x = x; doc.y = y; text(value, size, color, w); return doc.y;
  }
  // Bounded boxes prevent editable letterhead copy from flowing into patient results.
  function fitted(value: string, x: number, y: number, w: number, h: number, size: number, color: string) {
    doc.font(/[\u0900-\u097f]/.test(value) ? 'Hindi' : 'Body');
    let selected = size;
    while (selected > 5 && doc.fontSize(selected).heightOfString(value, { width: w, lineGap: 0 }) > h) selected -= .25;
    doc.fontSize(selected).fillColor(color).text(value, x, y, { width: w, height: h, lineGap: 0 });
  }
  function drawLetterhead() {
    doc.save();
    doc.rect(0, 0, width, headerHeight).fill(t.bandColor);
    doc.image(emblem, 10, 10, { fit: [58, headerHeight - 18] });
    fitted(t.brandName, 80, 4, 262, headerHeight * .68, 66, t.bandTextColor);
    fitted(t.subtitle, 81, headerHeight * .70, 262, headerHeight * .25, 23, t.bandTextColor);
    fitted(t.phone, 376, 17, 205, 19, 14, t.bandTextColor);
    doc.roundedRect(357, 19, 15, 15, 2).fill(t.bandTextColor);
    doc.save().translate(359, 21).scale(.5).path('M4 1L9 1L11 7L8 10C10 14 13 17 17 18L20 15L25 18L25 23C13 26 0 12 4 1Z').fill(t.bandColor).restore();
    fitted(t.address, 376, 40, 205, headerHeight * .32, 10.5, t.bandTextColor);
    doc.circle(365, 47, 5).fill(t.bandTextColor); doc.moveTo(360, 49).lineTo(365, 60).lineTo(370, 49).fill(t.bandTextColor); doc.circle(365, 47, 2).fill(t.bandColor);
    fitted(t.locationLine, 376, headerHeight - 25, 207, 22, 15, t.bandTextColor);
    doc.save().opacity(t.watermarkOpacity).image(emblem, 90, 185, { width: 415, height: 498 }).restore();
    const footerTop = height - footerHeight, bandHeight = footerHeight * .45, servicesHeight = footerHeight - bandHeight;
    const copyWidth = t.showBadge ? 418 : 470;
    fitted(`• ${t.supportLine}`, 12, footerTop + 4, copyWidth, servicesHeight * .27, 8, '#373044');
    fitted(t.servicesLine, 12, footerTop + servicesHeight * .32, copyWidth, servicesHeight * .4, 7.7, '#373044');
    fitted(t.facilitiesLine, 12, footerTop + servicesHeight * .74, copyWidth, servicesHeight * .25, 7.5, '#373044');
    const callX = t.showBadge ? 435 : 486;
    fitted(`Helpline No.\n${t.phone}`, callX, footerTop + servicesHeight * .45, 87, servicesHeight * .52, 10, t.helplineColor);
    if (t.showBadge) doc.image(badge, 535, footerTop, { fit: [49, servicesHeight - 2] });
    doc.rect(0, height - bandHeight, width, bandHeight).fill(t.bandColor);
    fitted(t.disclaimerLines.filter(Boolean).map(line => `• ${line}`).join('\n'), 12, height - bandHeight + 4, width - 24, bandHeight - 7, 7, t.bandTextColor);
    doc.restore(); doc.x = left; doc.y = bodyTop;
  }
  let activeTest: string | null = null;
  function tableHeader(title?: string) {
    if (title) { at(`${title} (continued)`, left, doc.y, contentWidth, t.bodyFontPt + 1); doc.moveDown(.3); }
    const y = doc.y;
    for (const [label, x, w] of [['Test name', left, 237], ['Value', 285, 75], ['Unit', 365, 62], ['Ref. range', 432, 119]] as const) at(label, x, y, w, t.bodyFontPt);
    doc.strokeColor('#b8b9c6').lineWidth(.5).moveTo(left, y + 17).lineTo(width - left, y + 17).stroke();
    doc.x = left; doc.y = y + 23;
  }
  doc.on('pageAdded', () => { drawLetterhead(); if (activeTest) tableHeader(activeTest); });
  drawLetterhead();
  function space(needed: number) { if (doc.y + needed > bodyBottom) doc.addPage(); }
  function heading(value: string) { space(60); doc.x = left; doc.moveDown(.4); text(value, t.bodyFontPt + 2); doc.moveDown(.3); }

  text(report.amendment_count ? `Amended laboratory report · Revision ${report.amendment_count}` : 'Authorized laboratory report', 8, '#616172'); doc.moveDown(.5);
  const age = report.age_value ?? report.age_years;
  const ageText = age != null ? `${age} ${report.age_value != null ? report.age_unit || 'years' : 'years'}` : '-';
  const l = t.labels, patientTop = doc.y;
  if (t.patientLayout === 'three-column') {
    type Field = [string, string];
    const columns: Field[][] = [
      [[l.name, report.patient_name], [l.ageGender, `${ageText} / ${report.gender || '-'}`], [l.uhid, report.uhid || '-'], [l.mobile, report.mobile || '-']],
      [[l.referringDoctor, report.referring_doctor || '-'], [l.patientType, report.patient_type || '-'], ...(t.showSampleDates ? [[l.collected, 'Not recorded'] as Field] : [])],
      [[l.accession, report.accession_no], [l.registered, date(report.sample_date)], ...(t.showSampleDates ? [[l.received, date(report.sample_received_at)] as Field] : []), [l.reported, report.authorized_at ? date(report.authorized_at) : 'Pending authorization']]
    ];
    const columnWidth = contentWidth / 3, bottoms: number[] = [];
    columns.forEach((fields, column) => {
      const x = left + column * columnWidth + (column ? 9 : 0), w = columnWidth - 18;
      doc.y = patientTop;
      fields.forEach(([label, value], index) => {
        if (index === 0) { at(label, x, doc.y, w, 7.5, '#616172'); at(value, x, doc.y + 1, w, column === 0 ? t.bodyFontPt + 2 : t.bodyFontPt + .5); }
        else at(`${label}: ${value}`, x, doc.y, w, t.bodyFontPt - .5);
        doc.y += 3;
      });
      bottoms.push(doc.y);
    });
    const bottom = Math.max(...bottoms);
    for (let i = 1; i <= 2; i++) doc.strokeColor('#c9cad5').lineWidth(.5).moveTo(left + columnWidth * i, patientTop).lineTo(left + columnWidth * i, bottom).stroke();
    doc.y = bottom;
  } else {
  const patientRows = [
    [l.name, report.patient_name, l.uhid, report.uhid || '-'],
    [l.ageGender, `${ageText} / ${report.gender || '-'}`, l.accession, report.accession_no],
    [l.referringDoctor, report.referring_doctor || '-', l.registered, date(report.sample_date)],
    [l.mobile, report.mobile || '-', l.reported, report.authorized_at ? date(report.authorized_at) : 'Pending authorization'],
    [l.patientType, report.patient_type || '-', ...(t.showSampleDates ? [l.received, date(report.sample_received_at)] : ['', ''])],
    ...(t.showSampleDates ? [[l.collected, 'Not recorded', '', '']] : [])
  ];
  function field(label: string, value: string, x: number, y: number) {
    if (!label) return y;
    const labelBottom = at(label, x, y, 87, t.bodyFontPt);
    at(':', x + 89, y, 5); return Math.max(labelBottom, at(value, x + 99, y, 144));
  }
  for (const [ll, lv, rl, rv] of patientRows) {
    const y = doc.y; const a = field(ll, lv, left, y); const b = field(rl, rv, 308, y); doc.y = Math.max(a, b) + 3;
  }
  }
  doc.strokeColor('#aeb0c3').lineWidth(.5);
  if (t.patientLayout === 'bordered') doc.rect(left - 5, patientTop - 4, contentWidth + 10, doc.y - patientTop + 8).stroke();
  else doc.moveTo(left, doc.y + 3).lineTo(width - left, doc.y + 3).stroke();
  doc.x = left; doc.y += 12;

  for (const test of report.tests) {
    heading(test.profile_name); activeTest = test.profile_name; tableHeader();
    for (const result of test.results) {
      const range = matchingRange(result.reference_ranges, report);
      const reference = range ? range.low != null || range.high != null ? `${range.low ?? '-'} – ${range.high ?? '-'}` : range.label || '-' : '-';
      const cells: [string, number, number][] = [[result.parameter_name, left, 235], [`${result.result_value || '-'}${result.abnormal_flag ? `  ${result.abnormal_flag}` : ''}`, 285, 74], [result.unit || '-', 365, 60], [reference, 432, 119]];
      doc.font('Body').fontSize(t.bodyFontPt);
      const rowHeight = Math.max(...cells.map(([value, , w]) => doc.heightOfString(value, { width: w, lineGap: 2 }))) + 6;
      space(rowHeight + (result.method ? 18 : 0));
      const y = doc.y;
      const bottoms = cells.map(([value, x, w], i) => at(value, x, y, w, t.bodyFontPt, i === 1 && result.abnormal_flag ? '#922d28' : '#252531'));
      doc.x = left; doc.y = Math.max(...bottoms) + 2;
      if (result.method) text(`Method: ${result.method}`, t.bodyFontPt - 1.5, '#616172');
      if (result.reference_note) text(result.reference_note, t.bodyFontPt - 1);
      if (result.comments) text(`Comment: ${result.comments}`, t.bodyFontPt - 1);
      if (result.description) text(result.description, t.bodyFontPt - 1);
      doc.x = left; doc.y += 7;
    }
    if (test.description) text(`Test information: ${test.description}`, t.bodyFontPt - 1);
    if (test.remarks) text(`Remarks: ${test.remarks}`, t.bodyFontPt - 1);
    activeTest = null;
  }
  if (report.amendment_count) { heading(`Laboratory amendment ${report.amendment_count}`); text(report.amendment_reason || 'Corrected report.'); }
  heading('Laboratory authorization');
  text(`${report.authorized_by_name || 'Authorized signatory'}${report.authorized_by_designation ? ' · ' + report.authorized_by_designation : ''}`);
  if (report.authorized_signature_label) text(report.authorized_signature_label, 9);
  text(`Authorized: ${date(report.authorized_at)}`, 8);
  if (report.clinical_notes.length) {
    heading('Doctor clinical notes');
    text('Independently authored clinical notes. Laboratory authorization applies to laboratory results; notes may be added later.', 8);
    for (const note of report.clinical_notes) {
      heading(`${note.author_name}${note.author_designation ? ' · ' + note.author_designation : ''}`);
      text(date(note.created_at), 8); text(note.body);
    }
  }
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    // Page numbering is in the reserved footer gap, outside normal body flow.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Body').fontSize(7).fillColor('#616172').text(`${report.accession_no} · Revision ${report.amendment_count || 0} · Page ${i + 1} of ${pages.count}`, left, bodyBottom + 8, { width: contentWidth, height: 12, lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
  doc.end(); return finished;
}
