import { useState } from 'react';
import { api } from '../api';
import type { Order } from '../types';

function fields(order: Order) {
  return {
    patientName: order.patient_name, uhid: order.uhid || '',
    ageValue: String(order.age_value ?? order.age_years ?? ''),
    ageUnit: order.age_value != null ? order.age_unit || 'years' : 'years',
    gender: order.gender || '', mobile: order.mobile || '',
    referringDoctor: order.referring_doctor || '', patientType: order.patient_type || ''
  };
}

export function PatientDetailsEditor({ order, onUpdated, hasUnsaved }: { order: Order; onUpdated: (order: Order) => void; hasUnsaved: boolean }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => fields(order));
  const [version, setVersion] = useState(order.updated_at);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  function open() {
    if (hasUnsaved && !window.confirm('Saving patient details will discard unsaved result edits. Continue?')) return;
    setForm(fields(order)); setVersion(order.updated_at); setReason(''); setError(''); setMessage(''); setEditing(true);
  }
  async function save() {
    setBusy(true); setError('');
    try {
      if (!version) throw new Error('Refresh this order before editing patient details.');
      const updated = await api<Order>(`/orders/${order.id}/patient`, { method: 'PUT', body: JSON.stringify({
        ...form, ageValue: form.ageValue === '' ? null : Number(form.ageValue), gender: form.gender || null,
        reason, expectedUpdatedAt: version
      }) });
      onUpdated(updated); setEditing(false); setMessage('Patient details updated for this registration.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update patient details.'); }
    finally { setBusy(false); }
  }
  return <div className="patient-details-editor">
    {!editing && <button className="secondary" disabled={order.status === 'AUTHORIZED'} onClick={open}>Edit patient details</button>}
    {order.status === 'AUTHORIZED' && <p className="hint">To correct patient details on a published report, open the report and start an amendment first.</p>}
    {message && <p className="success-message" role="status">{message}</p>}
    {editing && <form className="card order-action-panel" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <h2>Edit patient details</h2>
      <p>Changes apply only to registration {order.accession_no}. Other registrations and the hospital master record stay unchanged. Age or sex changes update result flags using this order's saved ranges.</p>
      <fieldset disabled={busy} className="form-grid">
        <label>Patient name *<input required minLength={2} maxLength={160} value={form.patientName} onChange={(e) => change('patientName', e.target.value)} /></label>
        <label>UHID / Registration no.<input maxLength={80} value={form.uhid} onChange={(e) => change('uhid', e.target.value)} /></label>
        <label>Age<input type="number" min="0" step="any" value={form.ageValue} onChange={(e) => change('ageValue', e.target.value)} /></label>
        <label>Age unit<select aria-label="Age unit" value={form.ageUnit} onChange={(e) => change('ageUnit', e.target.value)}>{['days', 'weeks', 'months', 'years'].map((unit) => <option key={unit}>{unit}</option>)}</select></label>
        <label>Sex<select aria-label="Sex" value={form.gender} onChange={(e) => change('gender', e.target.value)}><option value="">Not recorded</option><option>Male</option><option>Female</option><option>Other</option></select></label>
        <label>Mobile no.<input type="tel" maxLength={30} value={form.mobile} onChange={(e) => change('mobile', e.target.value)} /></label>
        <label>Referring doctor<input maxLength={160} value={form.referringDoctor} onChange={(e) => change('referringDoctor', e.target.value)} /></label>
        <label>Patient type<input maxLength={60} value={form.patientType} onChange={(e) => change('patientType', e.target.value)} placeholder="OPD, IPD, Emergency..." /></label>
      </fieldset>
      <label className="field"><span>Reason for correction *</span><textarea required minLength={5} maxLength={500} disabled={busy} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="toolbar-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel</button><button disabled={busy || order.status === 'AUTHORIZED'}>{busy ? 'Saving...' : 'Save patient details'}</button></div>
    </form>}
  </div>;
}
