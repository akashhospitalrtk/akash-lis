import { FormEvent, useMemo, useState } from 'react';
import { api } from '../api';
import type { Order, Profile } from '../types';

type PatientResult = { id: string; uhid?: string; name?: string; patientName?: string; age?: number; ageYears?: number; age_years?: number; age_value?: number; age_unit?: string; gender?: string; mobile?: string; referringDoctor?: string; referring_doctor?: string; patientType?: string; patient_type?: string };
const blank = () => ({ patientSource: 'MANUAL', externalPatientId: '', uhid: '', patientName: '', ageYears: '', ageUnit: 'years', gender: 'Male', mobile: '', referringDoctor: '', patientType: 'OPD', sampleDate: new Date().toISOString().slice(0, 16) });

function SearchIcon() {
  return <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2" /><path d="m15.4 15.4 4.4 4.4" /></svg>;
}

function SubmitIcon() {
  return <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5h11" /><path d="m11 7.5 5 5-5 5" /><path d="M5 5.5h3M5 19.5h3" /></svg>;
}

export function RegisterOrder({ profiles, onCreated }: { profiles: Profile[]; onCreated: (order: Order, enterValues?: boolean) => void }) {
  const [form, setForm] = useState(blank); const [selected, setSelected] = useState<string[]>([]); const [lookup, setLookup] = useState(''); const [matches, setMatches] = useState<PatientResult[]>([]); const [historyMatches, setHistoryMatches] = useState<PatientResult[]>([]); const [lookupMessage, setLookupMessage] = useState(''); const [searching, setSearching] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [testQuery, setTestQuery] = useState(''); const [quickProfileId, setQuickProfileId] = useState('');
  const groups = useMemo(() => profiles.filter((profile) => `${profile.name} ${profile.code} ${profile.department}`.toLowerCase().includes(testQuery.trim().toLowerCase())).reduce<Record<string, Profile[]>>((all, profile) => ({ ...all, [profile.department]: [...(all[profile.department] || []), profile] }), {}), [profiles, testQuery]);
  const quickGroups = useMemo(() => profiles.reduce<Record<string, Profile[]>>((all, profile) => ({ ...all, [profile.department]: [...(all[profile.department] || []), profile] }), {}), [profiles]);
  const selectedProfiles = useMemo(() => profiles.filter((profile) => selected.includes(profile.id)), [profiles, selected]);
  const change = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  function choosePatient(patient: PatientResult) { setForm({ ...form, patientSource: 'HOSPITAL', externalPatientId: patient.id, uhid: patient.uhid || '', patientName: patient.name || patient.patientName || '', ageYears: String(patient.age_value ?? patient.age ?? patient.ageYears ?? patient.age_years ?? ''), ageUnit: patient.age_unit || 'years', gender: patient.gender || '', mobile: patient.mobile || '', referringDoctor: patient.referringDoctor || patient.referring_doctor || '', patientType: patient.patientType || patient.patient_type || '' }); setLookup(''); setMatches([]); setHistoryMatches([]); setLookupMessage('Hospital patient record loaded. Confirm details before creating this order.'); }
  function choosePreviousPatient(patient: PatientResult) { setForm({ ...form, patientSource: 'MANUAL', externalPatientId: '', uhid: patient.uhid || '', patientName: patient.name || patient.patientName || '', ageYears: String(patient.age_value ?? patient.age ?? patient.ageYears ?? patient.age_years ?? ''), ageUnit: patient.age_unit || 'years', gender: patient.gender || '', mobile: patient.mobile || '', referringDoctor: patient.referringDoctor || patient.referring_doctor || '', patientType: patient.patientType || patient.patient_type || '' }); setLookup(''); setMatches([]); setHistoryMatches([]); setLookupMessage('Previous laboratory registration loaded. Confirm details before creating this order.'); }
  async function searchPatients() {
    const query = lookup.trim();
    setMatches([]); setHistoryMatches([]);
    if (query.length < 2) return setLookupMessage('Type at least two characters to search existing patients.');
    setSearching(true);
    setLookupMessage('');
    const [historyResult, hospitalResult] = await Promise.allSettled([
      api<PatientResult[]>(`/patient-history?query=${encodeURIComponent(query)}`),
      api<PatientResult[]>(`/external-patients?query=${encodeURIComponent(query)}`)
    ]);
    const history = historyResult.status === 'fulfilled' ? historyResult.value : [];
    const hospital = hospitalResult.status === 'fulfilled' ? hospitalResult.value : [];
    setHistoryMatches(history);
    setMatches(hospital);
    const total = history.length + hospital.length;
    if (total) {
      const unavailable = [historyResult, hospitalResult].find((result) => result.status === 'rejected');
      const warning = unavailable?.status === 'rejected' && unavailable.reason instanceof Error ? ` ${unavailable.reason.message}` : '';
      setLookupMessage(`Found ${total} existing patient record${total === 1 ? '' : 's'}. Choose one below.${warning}`);
    } else {
      const failures = [historyResult, hospitalResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason instanceof Error ? result.reason.message : 'Patient lookup is unavailable.');
      setLookupMessage(failures.length ? [...new Set(failures)].join(' ') : 'No existing patient found. You can register a new patient below.');
    }
    setSearching(false);
  }
  function searchPrevious() { return searchPatients(); }
  function searchHospital() { return searchPatients(); }
  async function submit(event: FormEvent) { event.preventDefault(); const enterValues = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-entry-mode') === 'RESULTS'; if (!selected.length) return setError('Select at least one investigation.'); setBusy(true); setError(''); try { const payload = { ...form, gender: form.gender || null, patientType: form.patientType || null, entryMode: enterValues ? 'RESULTS' : 'SAMPLE', ageYears: null, ageValue: form.ageYears === '' ? null : Number(form.ageYears), ageUnit: form.ageUnit, externalPatientId: form.externalPatientId || null, sampleDate: new Date(form.sampleDate).toISOString(), profileIds: selected }; const order = await api<Order>('/orders', { method: 'POST', body: JSON.stringify(payload) }); onCreated(order, enterValues); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create the order.'); } finally { setBusy(false); } }
  function toggleTest(id: string) { setSelected((current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]); }
  function quickAddInvestigation(id: string) { if (!id) return; setSelected((current) => current.includes(id) ? current : [...current, id]); setQuickProfileId(''); }
  return <section className="page"><div className="page-heading"><div><p className="eyebrow">Step 1 of 4: patient and order</p><h1>Find or register a patient</h1></div><p className="muted">Choose tests and create the order. Its sample is accepted in the next step.</p></div>
    <p className="hint">Submit &amp; enter values records sample acceptance and starts processing immediately. Use it when the sample is ready for testing.</p><form onSubmit={submit} className="registration-layout"><div className="card"><div className="section-title"><h2>Patient & sample</h2><span>Required fields marked *</span></div><div className="hospital-lookup"><div className="patient-typeahead"><input value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Start typing UHID, mobile number or patient name" aria-label="Search prior laboratory registrations" /><button type="button" className="search-icon-button" onClick={() => void searchPrevious()} aria-label="Search prior registrations" title="Search prior registrations"><SearchIcon /></button>{searching && <span className="lookup-spinner" aria-label="Searching" />}</div><button type="button" className="secondary hospital-master-button" onClick={() => void searchHospital()}>Hospital master</button></div>{lookupMessage && <p className="hint">{lookupMessage}</p>}{historyMatches.length > 0 && <div className="match-list patient-suggestions">{historyMatches.map((patient) => <button type="button" key={patient.id} onClick={() => choosePreviousPatient(patient)}><strong>{patient.name || patient.patientName}</strong><span>{patient.uhid || 'No UHID'} · {patient.age_value ?? patient.age ?? patient.ageYears ?? patient.age_years ?? '—'} {patient.age_unit || 'years'} · {patient.gender || '—'} · {patient.mobile || 'No mobile'}</span></button>)}</div>}{matches.length > 0 && <div className="match-list">{matches.map((patient) => <button type="button" key={patient.id} onClick={() => choosePatient(patient)}><strong>{patient.name || patient.patientName}</strong><span>{patient.uhid || 'No UHID'} · {patient.age_value ?? patient.age ?? patient.ageYears ?? '—'} {patient.age_unit || 'years'} · {patient.gender || '—'}</span></button>)}</div>}
      <div className="form-grid"><label>UHID / Registration no.<input value={form.uhid} onChange={(event) => change('uhid', event.target.value)} /></label><label>Patient name *<input autoFocus required value={form.patientName} onChange={(event) => change('patientName', event.target.value)} /></label><label>Age<input type="number" min="0" step="any" value={form.ageYears} onChange={(event) => change('ageYears', event.target.value)} /></label><label>Age unit<select aria-label="Age unit" value={form.ageUnit} onChange={(event) => change('ageUnit', event.target.value)}>{['days', 'weeks', 'months', 'years'].map((unit) => <option key={unit}>{unit}</option>)}</select></label><label>Gender<select value={form.gender} onChange={(event) => change('gender', event.target.value)}><option value="">Choose...</option><option>Male</option><option>Female</option><option>Other</option></select></label><label>Mobile no.<input inputMode="tel" value={form.mobile} onChange={(event) => change('mobile', event.target.value)} /></label><label>Referring doctor<input value={form.referringDoctor} onChange={(event) => change('referringDoctor', event.target.value)} /></label><label>Patient type<select value={form.patientType} onChange={(event) => change('patientType', event.target.value)}><option value="">Choose...</option><option>OPD</option><option>IPD</option><option>Emergency</option><option>Health check</option></select></label><label>Registration date & time *<input required type="datetime-local" value={form.sampleDate} onChange={(event) => change('sampleDate', event.target.value)} /></label></div></div>
      <div className="card profile-card">
        <div className="section-title"><h2>Investigations</h2><span aria-live="polite">{selected.length} selected</span></div>
        <label className="investigation-picker"><span>Quick add investigation</span><select value={quickProfileId} onChange={(event) => quickAddInvestigation(event.target.value)}><option value="">Select an investigation…</option>{Object.entries(quickGroups).map(([department, entries]) => <optgroup key={department} label={department}>{entries.map((profile) => <option key={profile.id} value={profile.id} disabled={selected.includes(profile.id)}>{profile.code} — {profile.name}{selected.includes(profile.id) ? ' (already selected)' : ''}</option>)}</optgroup>)}</select></label>
        <div className="test-search"><input aria-label="Search investigations" autoComplete="off" value={testQuery} onChange={(event) => setTestQuery(event.target.value)} placeholder="Search by test name, code or department…" />{selected.length > 0 && <button type="button" className="text-button" onClick={() => setSelected([])}>Clear</button>}</div>
        {selectedProfiles.length > 0 && <div className="selected-tests" role="region" aria-label="Selected investigations" tabIndex={0}>{selectedProfiles.map((profile) => <button type="button" key={profile.id} onClick={() => toggleTest(profile.id)} title="Remove test" aria-label={`Remove ${profile.name}`}><strong>{profile.code}</strong> {profile.name} ×</button>)}</div>}
        <p className="hint investigation-scroll-hint">Browse below or search to narrow the list. Selected tests stay in your order.</p>
        <div className="investigation-scroll" role="region" aria-label="Available investigations" tabIndex={0}>
          {Object.entries(groups).map(([department, entries]) => <fieldset key={department}><legend>{department} <span>({entries.length})</span></legend><div className="profile-options">{entries.map((profile) => <label key={profile.id} className={`profile-option ${selected.includes(profile.id) ? 'selected' : ''}`}><input type="checkbox" checked={selected.includes(profile.id)} onChange={() => toggleTest(profile.id)} /><span><strong>{profile.name}</strong><small>{[profile.specimen_type, `${profile.parameters.length} parameters`].filter(Boolean).join(' · ')}</small></span></label>)}</div></fieldset>)}
          {Object.keys(groups).length === 0 && <p className="muted">No active investigation matches this search. An administrator can add it in Investigations.</p>}
        </div>
      </div>
      <div className="form-actions registration-submit-bar">
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="registration-selection-summary"><strong>{selected.length} investigation{selected.length === 1 ? '' : 's'} selected</strong><small>Review patient details before submitting.</small></div>
        <div className="registration-submit-buttons"><button type="submit" data-entry-mode="RESULTS" className="secondary" disabled={busy}>Submit &amp; enter values</button><button type="submit" data-entry-mode="SAMPLE" className="button-with-icon" disabled={busy}><SubmitIcon /><span>{busy ? 'Submitting sample…' : 'Submit sample'}</span></button></div>
      </div>
    </form></section>;
}
