import { useState } from 'react';
import { api } from '../api';
import { defaultReportTemplate, type ReportTemplate, type ReportTemplateRecord } from '../reportTemplate';
import type { Hospital, Order, User } from '../types';
import { Report } from './Report';

const previewOrder: Order = {
  id: 'design-preview', accession_no: 'PREVIEW-0001', patient_name: 'SAMPLE PATIENT', patient_source: 'MANUAL',
  uhid: 'SAMPLE-UHID', age_value: 30, age_unit: 'years', gender: 'Female', mobile: 'Not supplied',
  referring_doctor: 'Sample referring doctor', patient_type: 'OPD', status: 'AUTHORIZED', sample_status: 'APPROVED',
  sample_date: '2026-09-29T04:30:00Z', created_at: '2026-09-29T04:30:00Z', authorized_at: '2026-09-29T06:00:00Z',
  authorized_by_name: 'Authorized signatory', authorized_by_designation: 'Designation', clinical_notes: [],
  tests: [{ id: 'sample', profile_id: 'sample', profile_code: 'PREVIEW', profile_name: 'INVESTIGATION NAME — DESIGN PREVIEW', status: 'AUTHORIZED', sort_order: 0,
    results: ['Parameter name', 'Another parameter', 'Additional parameter'].map((name, index) => ({ id: `sample-${index}`, order_test_id: 'sample', parameter_code: 'PREVIEW', parameter_name: name,
      result_kind: 'TEXT', result_value: 'Example', method: 'Method appears here when recorded', unit: '—', reference_ranges: [], select_options: [], common_values: [], sort_order: index })) }]
};
export function ReportDesign({ record, hospital, user, onSaved }: { record: ReportTemplateRecord; hospital: Hospital; user: User; onSaved: (record: ReportTemplateRecord) => void }) {
  const [draft, setDraft] = useState<ReportTemplate>(record.template);
  const [revision, setRevision] = useState(record.revision);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  function update<K extends keyof ReportTemplate>(key: K, value: ReportTemplate[K]) { setDraft(old => ({ ...old, [key]: value })); setMessage(''); }
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await api<ReportTemplateRecord>('/report-template', { method: 'PUT', body: JSON.stringify({ template: draft, expectedRevision: revision }) });
      setDraft(saved.template); setRevision(saved.revision); onSaved(saved); setMessage('Design saved. New printouts and PDF downloads use this design.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save design.'); }
    finally { setBusy(false); }
  }
  const textFields = (fields: [keyof ReportTemplate, string, number][]) => fields.map(([key, label, max]) => <label key={key}>{label}<input value={String(draft[key])} maxLength={max} onChange={e => update(key, e.target.value as never)} /></label>);
  return <section className="page report-design-page">
    <div className="page-heading"><div><p className="eyebrow">Administration</p><h1>Report design</h1><p className="muted">Edit the letterhead and patient information format. The preview contains sample data only.</p></div></div>
    <div className="report-design-layout"><form className="report-design-form" onSubmit={e => { e.preventDefault(); void save(); }}>
      <div className="report-design-toolbar"><button disabled={busy}>Save design</button><button type="button" className="secondary" disabled={busy} onClick={() => { setDraft(defaultReportTemplate); setMessage('Default design loaded into preview. Save to apply.'); }}>Preview defaults</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}
      <fieldset><legend>Header</legend>{textFields([['brandName', 'Brand name', 24], ['subtitle', 'Subtitle', 40], ['phone', 'Phone / helpline', 30], ['locationLine', 'Location line', 45]])}<label>Address<textarea maxLength={160} value={draft.address} onChange={e => update('address', e.target.value)} /></label></fieldset>
      <fieldset><legend>Colours and spacing</legend>{(['bandColor', 'bandTextColor', 'helplineColor'] as const).map((key, index) => <label key={key}>{['Header / footer colour', 'Header / footer text colour', 'Helpline colour'][index]}<input type="color" value={draft[key]} onChange={e => update(key, e.target.value)} /><small>{draft[key]}</small></label>)}
        {([['headerHeightMm', 'Header height (mm)', 32, 45, 1], ['footerHeightMm', 'Footer height (mm)', 32, 45, 1], ['bodyFontPt', 'Report text size (pt)', 8, 11, .5], ['watermarkOpacity', 'Watermark opacity (0 hides it)', 0, .12, .005]] as const).map(([key, label, min, max, step]) => <label key={key}>{label}<input type="number" required min={min} max={max} step={step} value={draft[key]} onChange={e => update(key, Number(e.target.value))} /></label>)}
      </fieldset>
      <fieldset><legend>Patient information</legend><label>Patient block format<select value={draft.patientLayout} onChange={e => update('patientLayout', e.target.value as ReportTemplate['patientLayout'])}><option value="three-column">Three sections — reference image</option><option value="bordered">Two columns with border</option><option value="minimal">Two columns without border</option></select></label><label>Date format<select value={draft.dateStyle} onChange={e => update('dateStyle', e.target.value as ReportTemplate['dateStyle'])}><option value="date-time">Date and time (IST)</option><option value="date">Date only</option></select></label><label>Include sample collection / receipt fields<input type="checkbox" checked={draft.showSampleDates} onChange={e => update('showSampleDates', e.target.checked)} /></label>
        {Object.entries(draft.labels).map(([key, value]) => <label key={key}>{defaultReportTemplate.labels[key as keyof ReportTemplate['labels']]} label<input required maxLength={24} value={value} onChange={e => update('labels', { ...draft.labels, [key]: e.target.value })} /></label>)}
      </fieldset>
      <fieldset><legend>Footer</legend>{textFields([['supportLine', 'Result-query message', 100], ['servicesLine', 'Available investigations', 180], ['facilitiesLine', 'Facilities', 120]])}{draft.disclaimerLines.map((line, index) => <label key={index}>Footer statement {index + 1}<textarea maxLength={180} value={line} onChange={e => update('disclaimerLines', draft.disclaimerLines.map((old, i) => i === index ? e.target.value : old))} /></label>)}<label>Show girl-child education emblem<input type="checkbox" checked={draft.showBadge} onChange={e => update('showBadge', e.target.checked)} /></label></fieldset>
      <p className="hint">Changes apply to future renders of reports. PDFs already downloaded keep their previous design. Patient details and laboratory results are edited in their respective workflows.</p>
    </form><div className="report-design-canvas"><Report order={previewOrder} hospital={hospital} user={user} template={draft} designPreview onUpdated={() => undefined} onBack={() => undefined} /></div></div>
  </section>;
}
