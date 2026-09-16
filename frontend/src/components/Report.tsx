import { Fragment } from 'react';
import { useState } from 'react';
import { api, download } from '../api';
import { flushSync } from 'react-dom';
import { DoctorNotes } from './DoctorNotes';
import { formatAge, formatDate, isDetailOrder, referenceText, hasRole } from '../lib';
import type { Hospital, Order, User } from '../types';

function BrandMark() {
  return <svg className="report-brand-mark" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" /><path d="M24 12v24M12 24h24" /><path d="M17 36 24 12l7 24" /></svg>;
}

function PhoneIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.3 3.8 9.6 3l1.9 4.7-1.7 1.5a15.3 15.3 0 0 0 5 5l1.5-1.7L21 14.4l-.8 2.3c-.4 1.1-1.6 1.8-2.8 1.6C10.3 17.2 6.8 13.7 5.7 6.6 5.5 5.4 6.2 4.2 7.3 3.8Z" /></svg>;
}

function LocationIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-6.1 6-11a6 6 0 1 0-12 0c0 4.9 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></svg>;
}

export function Report({ order, hospital, user, onUpdated, onBack }: { order: Order | null; hospital: Hospital; user: User; onUpdated: (order: Order) => void; onBack: () => void }) {
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
    setBusy(true); setError('');
    try {
      const updated = await api<Order>(`/clinical/orders/${detailed.id}/print`, { method: 'POST' });
      flushSync(() => onUpdated(updated));
      window.print();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not record printing.');
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

  return <section className="page report-page">
    <div className="report-actions">
      <button className="secondary" onClick={onBack}>{!hasRole(user, 'ADMIN', 'TECHNICIAN', 'AUTHORIZER') ? 'Back to patient' : detailed.status !== 'AUTHORIZED' && hasRole(user, 'ADMIN', 'TECHNICIAN') ? 'Edit values' : 'Back to entry'}</button>
      {detailed.status === 'AUTHORIZED' && hasRole(user, 'ADMIN', 'AUTHORIZER') && <button className="secondary" disabled={busy} onClick={() => setShowAmendment(true)}>Amend &amp; edit values</button>}
      <span>{detailed.status === 'AUTHORIZED' ? amendmentNo ? `Authorized amended report - Revision ${amendmentNo}` : 'Authorized report' : amendmentNo ? `Amendment ${amendmentNo} is awaiting authorization.` : 'Preview only - authorization is required before printing.'}</span>
      {canDeliver && <button className="secondary" onClick={() => void deliver()} disabled={busy}>Mark delivered</button>}
      {canPrint && <><button className="secondary" onClick={() => void downloadPdf()} disabled={busy}>Download PDF</button><button onClick={() => void print()} disabled={busy}>Print report</button></>}
    </div>
    {error && <p className="form-error">{error}</p>}

    {showAmendment && <form className="amendment-panel" onSubmit={(event) => { event.preventDefault(); void amendAndEdit(); }}><h2>Amend report to edit values</h2><p>The authorized version is preserved. Corrected results must be saved and authorized again.</p><label className="field"><span>Amendment reason *</span><textarea required minLength={5} maxLength={500} value={amendmentReason} onChange={(event) => setAmendmentReason(event.target.value)} /></label><div className="toolbar-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setShowAmendment(false)}>Cancel</button><button disabled={busy}>Begin amendment &amp; edit</button></div></form>}
    <article className="report-sheet">
      <header className="report-header">
        <div className="report-brand">
          <BrandMark />
          <div>
            <p className="report-brand-name">AKASH</p>
            <p className="report-brand-tagline">Diagnostic Center</p>
          </div>
        </div>
        <div className="report-contact">
          {hospital.phone && <p><PhoneIcon /> <span>{hospital.phone}</span></p>}
          {hospital.address && <p><LocationIcon /> <span>{hospital.address}</span></p>}
        </div>
      </header>

      <div className="report-document-bar">
        <div><p>{amendmentNo ? 'Amended laboratory report' : 'Laboratory report'}</p><strong>{detailed.accession_no}</strong></div>
        <span className={detailed.status === 'AUTHORIZED' ? 'report-issued' : 'report-preview'}>{detailed.status === 'AUTHORIZED' ? 'Authorized' : 'Preview'}</span>
      </div>

      <section className="report-patient" aria-label="Patient and sample details">
        <div className="report-patient-primary"><span>Patient name</span><strong>{detailed.patient_name}</strong></div>
        <div><span>UHID / Registration no.</span><strong>{detailed.uhid || '-'}</strong></div>
        <div><span>Age / Gender</span><strong>{[formatAge(detailed), detailed.gender].filter(Boolean).join(' / ') || '-'}</strong></div>
        <div><span>Referring doctor</span><strong>{detailed.referring_doctor || '-'}</strong></div>
        <div><span>Registered</span><strong>{formatDate(detailed.created_at, true)}</strong></div>
        <div><span>Sample collected</span><strong>{formatDate(detailed.sample_date, true)}</strong></div>
        <div><span>Sample received</span><strong>{detailed.sample_received_at ? formatDate(detailed.sample_received_at, true) : 'Not recorded'}</strong></div>
        <div><span>Report date / time</span><strong>{detailed.authorized_at ? formatDate(detailed.authorized_at, true) : 'Pending authorization'}</strong></div>
      </section>

      {detailed.tests.map((test) => {
        const legacyRemarks = test.results.filter((result) => result.comments).map((result) => `${result.parameter_name}: ${result.comments}`).join(' · ');
        const remarks = test.remarks || legacyRemarks;
        return <section className="report-test" key={test.id}>
          <h3>{test.profile_name}</h3>
          <table>
            <thead><tr><th scope="col">Test name</th><th scope="col">Value</th><th scope="col">Unit</th><th scope="col">Reference range</th><th scope="col">Flag</th></tr></thead>
            <tbody>{test.results.map((result) => {
              const flag = result.abnormal_flag || 'Normal';
              const critical = Boolean(result.abnormal_flag?.startsWith('C'));
              return <Fragment key={result.id}><tr className={result.abnormal_flag ? `report-abnormal${critical ? ' report-critical' : ''}` : ''}>
                <td><strong>{result.parameter_name}</strong>{result.method && <small className="report-method">Method: {result.method}</small>}</td>
                <td><strong>{result.result_value || '-'}</strong></td>
                <td>{result.unit || '-'}</td>
                <td>{referenceText(result.reference_ranges, detailed)}{result.reference_note && <small className="report-reference-note">{result.reference_note}</small>}</td>
                <td><span className={`report-flag ${result.abnormal_flag ? 'report-flag-abnormal' : ''}`}>{flag}</span></td>
              </tr>{result.description && <tr className="report-description-row"><td colSpan={5}><div className="report-description">{result.description}</div></td></tr>}</Fragment>;
            })}</tbody>
          </table>
          {test.description && <div className="report-description report-panel-description"><strong>Clinical notes</strong><p>{test.description}</p></div>}
          {remarks && <div className="report-remarks"><strong>Remarks</strong><p>{remarks}</p></div>}
        </section>;
      })}

      {amendmentNo > 0 && <section className="report-amendment-note"><strong>Correction note - Amendment #{amendmentNo}</strong><span>{detailed.amendment_reason || 'Corrected report issued after review.'}</span>{detailed.amended_at && <small>Amendment started {formatDate(detailed.amended_at, true)}{detailed.amended_by_name ? ` by ${detailed.amended_by_name}` : ''}.</small>}</section>}

      <footer className="report-footer">
        <div className="report-support"><p>Report support</p><strong>{hospital.phone || 'Contact the laboratory'}</strong><span>For report queries, please quote the accession number.</span></div>
        <div className="signature"><div className="signature-space">{detailed.authorized_signature_label || (detailed.status === 'AUTHORIZED' ? 'Digitally authorised' : '')}</div><div className="stamp-space" aria-label="Laboratory stamp area">LAB<br />STAMP</div><strong>{detailed.authorized_by_name || 'Authorised Signatory'}</strong>{detailed.authorized_by_designation && <span>{detailed.authorized_by_designation}</span>}</div>
      </footer>
      {Boolean(detailed.clinical_notes?.length) && <section className="report-doctor-notes"><h3>Doctor clinical notes</h3><p className="muted">Independently authored clinical notes. Laboratory authorization applies to laboratory results; notes may be added later.</p><DoctorNotes notes={detailed.clinical_notes || []} /></section>}
      <div className="report-footer-bar"><span>Computer-generated laboratory report</span><span>Accession: {detailed.accession_no}</span></div>
      <p className="report-note"><strong>Disclaimer:</strong> This laboratory report supports professional clinical opinion and is not, by itself, a diagnosis. Results and reference intervals are method- and laboratory-specific and must be interpreted by a qualified clinician with the patient's history, examination and other findings.</p>
    </article>
  </section>;
}
