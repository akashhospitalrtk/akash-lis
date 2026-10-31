import { Fragment } from 'react';
import { useState } from 'react';
import { api, download, fetchDocument } from '../api';
import { DoctorNotes } from './DoctorNotes';
import { formatAge, isDetailOrder, referenceText, hasRole } from '../lib';
import type { Hospital, Order, User } from '../types';
import { defaultReportTemplate, reportDate, type ReportTemplate } from '../reportTemplate';
import { LetterheadHeader, LetterheadFooter, templateStyle } from './ReportLetterhead';

function PatientDetail({ label, value, primary = false }: { label: string; value: string; primary?: boolean }) {
  return <div className={`report-patient-row${primary ? ' report-patient-name' : ''}`}><dt>{label}</dt><span aria-hidden="true">:</span><dd>{value}</dd></div>;
}

export function Report({ order, hospital, user, onUpdated, onBack, template = defaultReportTemplate, designPreview = false }: { order: Order | null; hospital: Hospital; user: User; onUpdated: (order: Order) => void; onBack: () => void; template?: ReportTemplate; designPreview?: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAmendment, setShowAmendment] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const detailed = isDetailOrder(order) ? order : null;
  if (!detailed) return <section className="page empty-state"><h1>No report selected</h1><p>Open an order from the worklist first.</p></section>;

  const canPrint = hasRole(user, 'ADMIN', 'AUTHORIZER', 'DOCTOR') && detailed.status === 'AUTHORIZED';
  const canDeliver = hasRole(user, 'ADMIN', 'AUTHORIZER') && canPrint && detailed.sample_status !== 'DELIVERED';
  const amendmentNo = Number(detailed.amendment_count || 0);

  async function amendAndEdit() {
    if (!detailed) return;
    setBusy(true); setError('');
    try {
      const updated = await api<Order>(`/orders/${detailed.id}/amend`, { method: 'POST', body: JSON.stringify({ reason: amendmentReason.trim() }) });
      onUpdated(updated); onBack();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open amendment.'); }
    finally { setBusy(false); }
  }

  async function print() {
    if (!canPrint || !detailed) return;
    // Open a blank tab synchronously so Chrome does not block the authenticated PDF tab as a popup.
    const printTab = window.open('about:blank', '_blank');
    if (!printTab) {
      setError('Allow pop-ups for this LIS site, then click Print report again.');
      return;
    }
    printTab.document.title = `Laboratory report ${detailed.accession_no}`;
    printTab.document.body.innerHTML = '<p style="font:14px Arial;padding:24px">Preparing report PDF…</p>';
    setBusy(true); setError('');
    try {
      const updated = await api<Order>(`/clinical/orders/${detailed.id}/print`, { method: 'POST' });
      onUpdated(updated);
      const { blob } = await fetchDocument(`/clinical/orders/${detailed.id}/report.pdf`);
      if (blob.type !== 'application/pdf') throw new Error('The server did not return a PDF report.');
      const url = URL.createObjectURL(blob);
      printTab.location.href = url;
      // Keep the object URL alive while Chrome's built-in PDF viewer loads and prints it.
      window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    } catch (reason) {
      printTab.close();
      setError(reason instanceof Error ? reason.message : 'Could not open the report PDF.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!canPrint || !detailed) return;
    setBusy(true); setError('');
    try { await download(`/clinical/orders/${detailed.id}/report.pdf`, `${detailed.accession_no}.pdf`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not download report.'); }
    finally { setBusy(false); }
  }

  async function deliver() {
    if (!canDeliver || !detailed) return;
    setBusy(true); setError('');
    try {
      const updated = await api<Order>(`/orders/${detailed.id}/deliver`, { method: 'POST' });
      onUpdated(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not mark this report as delivered.');
    } finally {
      setBusy(false);
    }
  }

  const labels = template.labels;
  return <section className={`page report-page${designPreview ? ' report-design-preview' : ''}`} style={templateStyle(template)}>
    <style>{`@media print { @page { size: A4; margin: ${template.headerHeightMm + 6}mm 0 ${template.footerHeightMm + 6}mm; } }`}</style>
    {!designPreview && <div className="report-actions">
      <button className="secondary" onClick={onBack}>{!hasRole(user, 'ADMIN', 'TECHNICIAN', 'AUTHORIZER') ? 'Back to patient' : detailed.status !== 'AUTHORIZED' && hasRole(user, 'ADMIN', 'TECHNICIAN') ? 'Edit values' : 'Back to entry'}</button>
      {detailed.status === 'AUTHORIZED' && hasRole(user, 'ADMIN', 'AUTHORIZER') && <button className="secondary" disabled={busy} onClick={() => setShowAmendment(true)}>Amend &amp; edit values</button>}
      <span>{detailed.status === 'AUTHORIZED' ? amendmentNo ? `Authorized amended report - Revision ${amendmentNo}` : 'Authorized report' : amendmentNo ? `Amendment ${amendmentNo} is awaiting authorization.` : 'Preview only - authorization is required before printing.'}</span>
      {canDeliver && <button className="secondary" onClick={() => void deliver()} disabled={busy}>Mark delivered</button>}
      {canPrint && <><button className="secondary" onClick={() => void downloadPdf()} disabled={busy}>Download PDF</button><button onClick={() => void print()} disabled={busy}>{busy ? 'Opening PDF…' : 'Print report'}</button></>}
    </div>}
    {error && <p className="form-error">{error}</p>}

    {showAmendment && <form className="amendment-panel" onSubmit={(event) => { event.preventDefault(); void amendAndEdit(); }}><h2>Amend report to edit values</h2><p>The authorized version is preserved. Corrected results must be saved and authorized again.</p><label className="field"><span>Amendment reason *</span><textarea required minLength={5} maxLength={500} value={amendmentReason} onChange={(event) => setAmendmentReason(event.target.value)} /></label><div className="toolbar-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setShowAmendment(false)}>Cancel</button><button disabled={busy}>Begin amendment &amp; edit</button></div></form>}
    <article className={`report-sheet patient-layout-${template.patientLayout} patient-label-${template.patientLabelWeight} patient-value-${template.patientValueWeight}`}>
      <LetterheadHeader template={template} />
      <img className="letterhead-watermark" src="/letterhead/emblem.svg" alt="" />
      <div className="report-body">

      <div className="report-document-bar">
        <div><p>Laboratory report</p><strong>{detailed.accession_no}</strong></div>
        <span className={detailed.status === 'AUTHORIZED' ? 'report-issued' : 'report-preview'}>{detailed.status === 'AUTHORIZED' ? 'Authorized' : 'Preview'}</span>
      </div>

      {template.patientLayout === 'three-column' ? <section className="report-patient report-patient-three" aria-label="Patient and sample details">
        <dl className="report-patient-column">
          <PatientDetail label={labels.name} value={detailed.patient_name} primary />
          <PatientDetail label={labels.ageGender} value={[formatAge(detailed), detailed.gender].filter(Boolean).join(' / ') || '-'} />
          <PatientDetail label={labels.uhid} value={detailed.uhid || '-'} />
          <PatientDetail label={labels.mobile} value={detailed.mobile || '-'} />
        </dl>
        <dl className="report-patient-column">
          <PatientDetail label={labels.referringDoctor} value={detailed.referring_doctor || '-'} primary />
          <PatientDetail label={labels.patientType} value={detailed.patient_type || '-'} />
          {template.showSampleDates && <PatientDetail label={labels.collected} value="Not recorded" />}
        </dl>
        <dl className="report-patient-column">
          <PatientDetail label={labels.accession} value={detailed.accession_no} primary />
          <PatientDetail label={labels.registered} value={reportDate(detailed.sample_date, template)} />
          {template.showSampleDates && <PatientDetail label={labels.received} value={reportDate(detailed.sample_received_at, template)} />}
          <PatientDetail label={labels.reported} value={detailed.authorized_at ? reportDate(detailed.authorized_at, template) : 'Pending authorization'} />
        </dl>
      </section> : <section className="report-patient" aria-label="Patient and sample details">
        <dl className="report-patient-column">
          <PatientDetail label={labels.name} value={detailed.patient_name} primary />
          <PatientDetail label={labels.ageGender} value={[formatAge(detailed), detailed.gender].filter(Boolean).join(' / ') || '-'} />
          <PatientDetail label={labels.referringDoctor} value={detailed.referring_doctor || '-'} />
          <PatientDetail label={labels.mobile} value={detailed.mobile || '-'} />
          <PatientDetail label={labels.patientType} value={detailed.patient_type || '-'} />
          {template.showSampleDates && <PatientDetail label={labels.collected} value="Not recorded" />}
        </dl>
        <dl className="report-patient-column">
          <PatientDetail label={labels.uhid} value={detailed.uhid || '-'} />
          <PatientDetail label={labels.accession} value={detailed.accession_no} />
          <PatientDetail label={labels.registered} value={reportDate(detailed.sample_date, template)} />
          {/* sample_date is the registration form's date, not a collection event. */}
          <PatientDetail label={labels.reported} value={detailed.authorized_at ? reportDate(detailed.authorized_at, template) : 'Pending authorization'} />
          {template.showSampleDates && <PatientDetail label={labels.received} value={reportDate(detailed.sample_received_at, template)} />}
        </dl>
      </section>}

      {detailed.tests.map((test) => {
        const legacyRemarks = test.results.filter((result) => result.comments).map((result) => `${result.parameter_name}: ${result.comments}`).join(' · ');
        const remarks = test.remarks || legacyRemarks;
        return <section className="report-test" key={test.id}>
          <h3>{test.profile_name}</h3>
          <table>
            <thead><tr><th scope="col">Test name</th><th scope="col">Result</th><th scope="col">Unit</th><th scope="col">Reference range</th></tr></thead>
            <tbody>{test.results.map((result) => {
              const flag = result.abnormal_flag || 'Normal';
              const critical = Boolean(result.abnormal_flag?.startsWith('C'));
              return <Fragment key={result.id}><tr className={result.abnormal_flag ? `report-abnormal${critical ? ' report-critical' : ''}` : ''}>
                <td><strong>{result.parameter_name}</strong>{result.method && <small className="report-method">Method: {result.method}</small>}</td>
                <td><strong>{result.result_value || '-'}</strong>{result.abnormal_flag && <span className="report-flag report-flag-abnormal">{flag}</span>}</td>
                <td>{result.unit || '-'}</td>
                <td className="report-reference-range">{referenceText(result.reference_ranges, detailed)}{result.reference_note && <small className="report-reference-note">{result.reference_note}</small>}</td>
              </tr>{result.description && <tr className="report-description-row"><td colSpan={4}><div className="report-description">{result.description}</div></td></tr>}</Fragment>;
            })}</tbody>
          </table>
          {test.description && <div className="report-description report-panel-description"><strong>Clinical notes</strong><p>{test.description}</p></div>}
          {remarks && <div className="report-remarks"><strong>Remarks</strong><p>{remarks}</p></div>}
        </section>;
      })}


      <footer className="report-footer">
        <div className="report-support"><p>Report support</p><strong>{hospital.phone || 'Contact the laboratory'}</strong><span>For report queries, please quote the accession number.</span></div>
      </footer>
      {Boolean(detailed.clinical_notes?.length) && <section className="report-doctor-notes"><h3>Doctor clinical notes</h3><p className="muted">Independently authored clinical notes. Laboratory authorization applies to laboratory results; notes may be added later.</p><DoctorNotes notes={detailed.clinical_notes || []} /></section>}
      <p className="report-tracking">{detailed.accession_no}{designPreview ? ' · DESIGN PREVIEW — NOT A PATIENT REPORT' : ''}</p>
      </div>
      <LetterheadFooter template={template} />
    </article>
  </section>;
}
