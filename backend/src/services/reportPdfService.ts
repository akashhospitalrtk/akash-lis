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
  const bodyTop = headerHeight + 17, signatureTop = height - footerHeight - 88;
  const bodyBottom = signatureTop - 12;
  const doc = new PDFDocument({ size: 'A4', margins: { top: bodyTop, bottom: height - bodyBottom, left, right: left }, bufferPages: true,
    info: { Title: `Laboratory report ${report.accession_no}`, Author: `${t.brandName} ${t.subtitle}` } });
  doc.registerFont('Body', assetFile('fonts/NotoSans.ttf'));
  doc.registerFont('BodyBold', assetFile('fonts/Inter-Bold.woff'));
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
  function text(value: string, size = t.bodyFontPt, color = '#252531', textWidth = contentWidth, align: 'left' | 'center' | 'right' = 'left') {
    const runs = value.split(/([\u0900-\u097f\u200c\u200d]+)/).filter(Boolean);
    runs.forEach((run, index) => {
      doc.font(/[\u0900-\u097f]/.test(run) ? 'Hindi' : 'Body').fontSize(size).fillColor(color)
        .text(run, { width: textWidth, lineGap: 2, align, stroke: false, fill: true, continued: index < runs.length - 1 });
    });
  }
  function at(value: string, x: number, y: number, w: number, size = t.bodyFontPt, color = '#252531', align: 'left' | 'center' | 'right' = 'left') {
    doc.x = x; doc.y = y; text(value, size, color, w, align); return doc.y;
  }
  function labelAt(value: string, x: number, y: number, w: number, size: number, continued = false) {
    const bold = t.patientLabelWeight === 'bold';
    doc.font(/[\u0900-\u097f]/.test(value) ? 'Hindi' : bold ? 'BodyBold' : 'Body').fontSize(size).fillColor(bold ? '#252536' : '#555567');
    doc.text(value, x, y, { width: w, lineGap: 2, stroke: false, fill: true, continued });
    return doc.y;
  }
  function patientValueAt(value: string, x: number, y: number, w: number, size: number, continued = false) {
    const runs = value.split(/([\u0900-\u097f\u200c\u200d]+)/).filter(Boolean);
    runs.forEach((run, index) => {
      doc.font(/[\u0900-\u097f]/.test(run) ? 'Hindi' : t.patientValueWeight === 'bold' ? 'BodyBold' : 'Body').fontSize(size).fillColor('#252531')
        .text(run, x, y, { width: w, lineGap: 2, stroke: false, fill: true, continued: continued || index < runs.length - 1 });
    });
    return doc.y;
  }
  function measure(value: string, size = t.bodyFontPt, w = contentWidth) {
    return doc.font(/[\u0900-\u097f]/.test(value) ? 'Hindi' : 'Body').fontSize(size).heightOfString(value, { width: w, lineGap: 2 });
  }
  // Bounded boxes prevent editable letterhead copy from flowing into patient results.
  function fitted(value: string, x: number, y: number, w: number, h: number, size: number, color: string, align: 'left' | 'center' | 'right' = 'left', icon?: 'phone' | 'pin') {
    doc.font(/[\u0900-\u097f]/.test(value) ? 'Hindi' : 'Body');
    let selected = size;
    while (selected > 5 && doc.fontSize(selected).heightOfString(value, { width: w, lineGap: 0 }) > h) selected -= .25;
    doc.fontSize(selected).fillColor(color).text(value, x, y, { width: w, height: h, lineGap: 0, align, stroke: false });
    if (icon && value) {
      let firstLine = '';
      for (const word of value.split('\n')[0].split(' ')) {
        const next = firstLine ? `${firstLine} ${word}` : word;
        if (firstLine && doc.widthOfString(next) > w) break;
        firstLine = next;
      }
      const lineWidth = Math.min(w, doc.widthOfString(firstLine));
      const start = x + (align === 'right' ? w - lineWidth : align === 'center' ? (w - lineWidth) / 2 : 0);
      doc.save().translate(start - 17, y + 2).scale(.55).strokeColor(color).lineWidth(1.8);
      if (icon === 'phone') doc.path('M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 1.9z').stroke();
      else { doc.path('M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z').stroke(); doc.circle(12, 10, 2.5).stroke(); }
      doc.restore();
    }
  }
  function drawLetterhead() {
    doc.save();
    doc.rect(0, 0, width, headerHeight).fill(t.bandColor);
    doc.image(emblem, left, 25, { fit: [32, 42] });
    // Shared left edge and explicit single-line brand boxes avoid metric-driven
    // wrapping/shrinking that made the printed header unlike the screen guide.
    function brandLine(value: string, y: number, h: number, requested: number) {
      doc.font(/[\u0900-\u097f]/.test(value) ? 'Hindi' : 'BodyBold');
      let size = Math.min(requested, h);
      while (size > 5 && doc.fontSize(size).widthOfString(value) > 262) size -= .25;
      const measured = doc.fontSize(size).widthOfString(value);
      const x = 90 + (t.headerAlignment === 'right' ? 262 - measured : t.headerAlignment === 'center' ? (262 - measured) / 2 : 0);
      doc.fillColor(t.bandTextColor).text(value, x, y, { lineBreak: false });
    }
    brandLine(t.brandName, 24, headerHeight * .48, t.brandFontPt);
    brandLine(t.subtitle, headerHeight * .7, headerHeight * .22, t.subtitleFontPt);
    const contactLeft = 352 + t.headerGapMm * mm, contactText = contactLeft + 17, contactWidth = width - left - contactText;
    fitted(t.phone, contactText, 23, contactWidth, 15, t.contactFontPt + 1, t.bandTextColor, t.headerContactAlignment, 'phone');
    fitted(t.address, contactText, 42, contactWidth, headerHeight * .32, t.contactFontPt, t.bandTextColor, t.headerContactAlignment, 'pin');
    fitted(t.locationLine, contactText, headerHeight - 16, contactWidth, 14, t.contactFontPt, t.bandTextColor, t.headerContactAlignment);
    doc.strokeColor('#214e70').lineWidth(1.2).moveTo(left, headerHeight).lineTo(width - left, headerHeight).stroke();
    doc.save().opacity(t.watermarkOpacity).image(emblem, 90, 185, { width: 415, height: 498 }).restore();
    const footerTop = height - footerHeight, bandHeight = footerHeight * .45, servicesHeight = footerHeight - bandHeight;
    const callX = t.showBadge ? 409 : width - left - 87;
    const copyWidth = callX - left - t.footerGapMm * mm;
    doc.strokeColor('#c7d5df').lineWidth(.5).moveTo(left, footerTop).lineTo(width - left, footerTop).stroke();
    fitted(t.supportLine, left, footerTop + 5, copyWidth, servicesHeight * .27, t.footerFontPt, t.footerTextColor, t.footerAlignment);
    fitted(t.servicesLine, left, footerTop + servicesHeight * .32, copyWidth, servicesHeight * .4, t.footerFontPt, t.footerTextColor, t.footerAlignment);
    fitted(t.facilitiesLine, left, footerTop + servicesHeight * .74, copyWidth, servicesHeight * .25, t.footerFontPt, t.footerTextColor, t.footerAlignment);
    fitted(`Helpline No.\n${t.phone}`, callX, footerTop + servicesHeight * .45, 87, servicesHeight * .52, t.helplineFontPt, t.helplineColor, t.footerContactAlignment);
    if (t.showBadge) doc.image(badge, width - left - 45, footerTop + 4, { fit: [45, servicesHeight - 6] });
    doc.rect(0, height - bandHeight, width, bandHeight).fill(t.footerBandColor);
    fitted(t.disclaimerLines.filter(Boolean).map(line => `• ${line}`).join('\n'), left, height - bandHeight + 4, contentWidth, bandHeight - 7, t.disclaimerFontPt, t.footerBandTextColor, t.footerAlignment);
    doc.restore(); doc.x = left; doc.y = bodyTop;
  }
  let activeTest: string | null = null;
  const tableColumns = [left + 5, left + contentWidth * .48, left + contentWidth * .64, left + contentWidth * .77];
  const tableWidths = [.48, .16, .13, .23].map(fraction => contentWidth * fraction - 10);
  function tableHeader(title?: string) {
    if (title) { at(`${title} (continued)`, left, doc.y, contentWidth, t.bodyFontPt + 1); doc.moveDown(.3); }
    const y = doc.y;
    doc.rect(left, y, contentWidth, 24).fill('#edf3f7');
    ['Test name', 'Result', 'Unit', 'Reference range'].forEach((label, i) => {
      doc.font('BodyBold').fontSize(t.bodyFontPt - .5).fillColor('#214e70');
      const offset = i === 1 ? tableWidths[i] - doc.widthOfString(label) : i === 2 ? (tableWidths[i] - doc.widthOfString(label)) / 2 : 0;
      doc.text(label, tableColumns[i] + offset, y + 7, { lineBreak: false });
    });
    doc.strokeColor('#c7d5df').lineWidth(.5).moveTo(left, y).lineTo(width - left, y).stroke();
    doc.moveTo(left, y + 24).lineTo(width - left, y + 24).stroke();
    doc.x = left; doc.y = y + 31;
  }
  doc.on('pageAdded', () => { drawLetterhead(); if (activeTest) tableHeader(activeTest); });
  drawLetterhead();
  function space(needed: number) { if (doc.y + needed > bodyBottom) doc.addPage(); }
  function heading(value: string) { space(60); doc.x = left; doc.moveDown(.4); text(value, t.bodyFontPt + 2); doc.moveDown(.3); }

  text(report.authorized_at ? 'AUTHORIZED LABORATORY REPORT' : 'LABORATORY REPORT — PREVIEW', 9, '#214e70'); doc.moveDown(.5);
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
        if (index === 0) { labelAt(label, x, doc.y, w, 7.5); patientValueAt(value, x, doc.y + 1, w, column === 0 ? t.bodyFontPt + 2 : t.bodyFontPt + .5); }
        else {
          labelAt(`${label}: `, x, doc.y, w, t.bodyFontPt - .5, true);
          patientValueAt(value, doc.x, doc.y, w, t.bodyFontPt - .5);
        }
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
    const labelBottom = labelAt(label, x, y, 87, t.bodyFontPt);
    at(':', x + 89, y, 5); return Math.max(labelBottom, patientValueAt(value, x + 99, y, 144, t.bodyFontPt));
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
    // Measure whole parameter blocks, including all explanatory text. Keep a
    // panel intact when it fits on one fresh page; larger panels break at rows.
    const rows = test.results.map(result => {
      const range = matchingRange(result.reference_ranges, report);
      const reference = range ? range.low != null || range.high != null ? `${range.low ?? '-'} – ${range.high ?? '-'}` : range.label || '-' : '-';
      const values = [result.parameter_name, `${result.result_value || '-'}${result.abnormal_flag ? `  ${result.abnormal_flag}` : ''}`, result.unit || '-', reference];
      const notes: [string, number][] = [];
      if (result.method) notes.push([`Method: ${result.method}`, t.bodyFontPt - 1.5]);
      if (result.reference_note) notes.push([result.reference_note, t.bodyFontPt - 1]);
      if (result.comments) notes.push([`Comment: ${result.comments}`, t.bodyFontPt - 1]);
      if (result.description) notes.push([result.description, t.bodyFontPt - 1]);
      const needed = Math.max(...values.map((value, i) => measure(value, t.bodyFontPt, tableWidths[i]))) + 12
        + notes.reduce((sum, [value, size]) => sum + measure(value, size), 0);
      return { result, values, needed };
    });
    const extra = (test.description ? measure(`Test information: ${test.description}`, t.bodyFontPt - 1) : 0)
      + (test.remarks ? measure(`Remarks: ${test.remarks}`, t.bodyFontPt - 1) : 0);
    const panelHeight = 16 + measure(test.profile_name, t.bodyFontPt + 2) + 31 + rows.reduce((sum, row) => sum + row.needed, 0) + extra;
    const startHeight = 16 + measure(test.profile_name, t.bodyFontPt + 2) + 31 + (rows[0]?.needed || 0);
    space(panelHeight <= bodyBottom - bodyTop ? panelHeight : startHeight <= bodyBottom - bodyTop ? startHeight : 65);
    doc.y += 8;
    at(test.profile_name, left, doc.y, contentWidth, t.bodyFontPt + 2, '#214e70'); doc.y += 8;
    activeTest = test.profile_name; tableHeader();
    for (const { result, values, needed } of rows) {
      const cells: [string, number, number][] = values.map((value, i) => [value, tableColumns[i], tableWidths[i]]);
      doc.font('Body').fontSize(t.bodyFontPt);
      const rowHeight = Math.max(...cells.map(([value, , w]) => doc.heightOfString(value, { width: w, lineGap: 2 }))) + 6;
      const freshRowSpace = bodyBottom - bodyTop - measure(`${test.profile_name} (continued)`, t.bodyFontPt + 1) - 40;
      space(needed <= freshRowSpace ? needed : rowHeight + (result.method ? 18 : 0));
      const y = doc.y;
      const bottoms = cells.map(([value, x, w], i) => at(value, x, y, w, t.bodyFontPt, i === 1 && result.abnormal_flag ? '#922d28' : '#252531', i === 1 ? 'right' : i === 2 ? 'center' : 'left'));
      doc.x = left; doc.y = Math.max(...bottoms) + 2;
      if (result.method) text(`Method: ${result.method}`, t.bodyFontPt - 1.5, '#616172');
      if (result.reference_note) text(result.reference_note, t.bodyFontPt - 1);
      if (result.comments) text(`Comment: ${result.comments}`, t.bodyFontPt - 1);
      if (result.description) text(result.description, t.bodyFontPt - 1);
      if (doc.y + 7 <= bodyBottom) doc.strokeColor('#d9dde5').lineWidth(.35).moveTo(left, doc.y + 3).lineTo(width - left, doc.y + 3).stroke();
      doc.x = left; doc.y += 10;
    }
    if (test.description) text(`Test information: ${test.description}`, t.bodyFontPt - 1);
    if (test.remarks) text(`Remarks: ${test.remarks}`, t.bodyFontPt - 1);
    activeTest = null;
  }
  doc.x = left;
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
    const signX = width - left - 230;
    if (report.authorized_at) {
      fitted(report.authorized_signature_label || 'Digitally authorised', signX, signatureTop, 230, 16, 9, '#252531', 'right');
      fitted(report.authorized_by_name || 'Authorized signatory', signX, signatureTop + 17, 230, 18, t.bodyFontPt + 1, '#252531', 'right');
      if (report.authorized_by_designation) fitted(report.authorized_by_designation, signX, signatureTop + 36, 230, 14, 8, '#616172', 'right');
      fitted(`Authorized: ${date(report.authorized_at)}`, signX, signatureTop + 51, 230, 14, 8, '#616172', 'right');
    }
    doc.font('Body').fontSize(7).fillColor('#616172').text(`${report.accession_no} · Page ${i + 1} of ${pages.count}`, left, height - footerHeight - 14, { width: contentWidth, height: 12, lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
  doc.end(); return finished;
}
