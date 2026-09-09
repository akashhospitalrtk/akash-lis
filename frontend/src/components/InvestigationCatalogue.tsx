import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { formatDate } from '../lib';
import type { Profile, ReferenceRange, ResultKind } from '../types';

type DraftParameter = {
  code: string; name: string; resultKind: ResultKind; unit: string; referenceRanges: ReferenceRange[];
  method: string; selectOptions: string[]; commonValues: string[]; calculationFormula: string; suggestedValue: string; numericStep: string; sliderMin: string; sliderMax: string; criticalLow: string; criticalHigh: string; sortOrder: number; active: boolean;
};
type DraftProfile = {
  code: string; name: string; department: string; specimenType: string; turnaroundTime: string; instructions: string; parameters: DraftParameter[];
};
type CatalogueAudit = { id: string; event_type: string; created_at: string; user_name?: string | null };

function emptyParameter(sortOrder: number): DraftParameter {
  return { code: '', name: '', resultKind: 'NUMERIC', unit: '', method: '', referenceRanges: [], selectOptions: [], commonValues: [], calculationFormula: '', suggestedValue: '', numericStep: '', sliderMin: '', sliderMax: '', criticalLow: '', criticalHigh: '', sortOrder, active: true };
}
function blankProfile(): DraftProfile {
  return { code: '', name: '', department: 'Laboratory', specimenType: '', turnaroundTime: '', instructions: '', parameters: [emptyParameter(10)] };
}
function profileDraft(profile: Profile): DraftProfile {
  return {
    code: profile.code, name: profile.name, department: profile.department, specimenType: profile.specimen_type || '', turnaroundTime: profile.turnaround_time || '', instructions: profile.instructions || '',
    parameters: [...profile.parameters].sort((a, b) => a.sort_order - b.sort_order).map((parameter) => ({
      code: parameter.code, name: parameter.name, resultKind: parameter.result_kind, unit: parameter.unit || '', method: parameter.method || '',
      referenceRanges: parameter.reference_ranges || [], selectOptions: parameter.select_options || [], commonValues: parameter.common_values || [], calculationFormula: parameter.calculation_formula || '', suggestedValue: parameter.suggested_value || '', numericStep: parameter.numeric_step === null || parameter.numeric_step === undefined ? '' : String(parameter.numeric_step), sliderMin: parameter.slider_min === null || parameter.slider_min === undefined ? '' : String(parameter.slider_min), sliderMax: parameter.slider_max === null || parameter.slider_max === undefined ? '' : String(parameter.slider_max), criticalLow: parameter.critical_low === null || parameter.critical_low === undefined ? '' : String(parameter.critical_low), criticalHigh: parameter.critical_high === null || parameter.critical_high === undefined ? '' : String(parameter.critical_high), sortOrder: parameter.sort_order, active: parameter.active !== false
    }))
  };
}
function numberOrEmpty(value: string) { return value === '' ? undefined : Number(value); }

export function InvestigationCatalogue({ onChanged }: { onChanged: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftProfile>(blankProfile);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [audit, setAudit] = useState<CatalogueAudit[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = profiles.find((profile) => profile.id === selectedId) || null;

  async function loadProfiles() {
    const catalogue = await api<Profile[]>('/catalogue/profiles');
    setProfiles(catalogue);
    return catalogue;
  }
  async function loadAudit(id: string) {
    try { setAudit(await api<CatalogueAudit[]>(`/catalogue/profiles/${id}/audit`)); } catch { setAudit([]); }
  }
  useEffect(() => { void loadProfiles().catch((reason: Error) => setError(reason.message)); }, []);

  const listed = useMemo(() => profiles.filter((profile) => {
    const matches = `${profile.code} ${profile.name} ${profile.department}`.toLowerCase().includes(query.trim().toLowerCase());
    return matches && (showArchived || profile.active !== false);
  }), [profiles, query, showArchived]);

  function choose(profile: Profile) {
    setSelectedId(profile.id); setDraft(profileDraft(profile)); setMessage(''); setError(''); void loadAudit(profile.id);
  }
  function createNew() {
    setSelectedId(null); setDraft(blankProfile()); setAudit([]); setMessage(''); setError('');
  }
  function updateProfile(key: Exclude<keyof DraftProfile, 'parameters'>, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function updateParameter(index: number, patch: Partial<DraftParameter>) {
    setDraft((current) => ({ ...current, parameters: current.parameters.map((parameter, position) => position === index ? { ...parameter, ...patch } : parameter) }));
  }
  function changeResultKind(index: number, resultKind: ResultKind) {
    const parameter = draft.parameters[index];
    const selectOptions = resultKind === 'POS_NEG' && !parameter.selectOptions.length ? ['Negative', 'Positive'] : resultKind === 'NUMERIC' ? [] : parameter.selectOptions;
    updateParameter(index, { resultKind, selectOptions, commonValues: ['NUMERIC', 'TEXT'].includes(resultKind) ? parameter.commonValues : [], referenceRanges: resultKind === 'NUMERIC' ? parameter.referenceRanges : [], calculationFormula: resultKind === 'NUMERIC' ? parameter.calculationFormula : '', numericStep: resultKind === 'NUMERIC' ? parameter.numericStep : '', sliderMin: resultKind === 'NUMERIC' ? parameter.sliderMin : '', sliderMax: resultKind === 'NUMERIC' ? parameter.sliderMax : '', criticalLow: resultKind === 'NUMERIC' ? parameter.criticalLow : '', criticalHigh: resultKind === 'NUMERIC' ? parameter.criticalHigh : '' });
  }
  function updateRange(parameterIndex: number, rangeIndex: number, key: keyof ReferenceRange, value: string) {
    const parameter = draft.parameters[parameterIndex];
    const ranges = parameter.referenceRanges.map((range, position) => {
      if (position !== rangeIndex) return range;
      const next = { ...range };
      if (key === 'ageMin' || key === 'ageMax' || key === 'low' || key === 'high') next[key] = numberOrEmpty(value);
      else if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    updateParameter(parameterIndex, { referenceRanges: ranges });
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const path = selectedId ? `/catalogue/profiles/${selectedId}` : '/catalogue/profiles';
      const saved = await api<Profile>(path, { method: selectedId ? 'PUT' : 'POST', body: JSON.stringify(draft) });
      await loadProfiles();
      setSelectedId(saved.id); setDraft(profileDraft(saved)); await loadAudit(saved.id);
      setMessage(selectedId ? 'Investigation updated. New orders will use this configuration; older reports keep their original snapshot.' : 'Investigation created and ready for ordering.');
      onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the investigation.'); }
    finally { setBusy(false); }
  }
  async function archive() {
    if (!selected || !window.confirm(`Archive ${selected.name}? It will no longer be available for new orders, but past reports stay unchanged.`)) return;
    setBusy(true); setError('');
    try { await api(`/catalogue/profiles/${selected.id}`, { method: 'DELETE' }); await loadProfiles(); setMessage('Investigation archived.'); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not archive the investigation.'); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const restored = await api<Profile>(`/catalogue/profiles/${selected.id}/restore`, { method: 'POST' });
      await loadProfiles(); setDraft(profileDraft(restored)); await loadAudit(restored.id); setMessage('Investigation restored for new orders.'); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not restore the investigation.'); }
    finally { setBusy(false); }
  }

  return <section className="page catalogue-page">
    <div className="page-heading"><div><p className="eyebrow">Administrator only</p><h1>Investigation catalogue</h1><p className="muted">Configure the tests your laboratory performs. Changes affect only new orders; reported orders remain clinically traceable.</p></div><button type="button" onClick={createNew}>Add investigation</button></div>
    <div className="catalogue-layout">
      <aside className="card catalogue-list"><div className="section-title"><h2>Available tests</h2><span>{profiles.filter((profile) => profile.active !== false).length} active</span></div><input aria-label="Search investigations" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, code or department" /><label className="archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived</label><div className="catalogue-items">{listed.length ? listed.map((profile) => <button type="button" key={profile.id} className={`catalogue-item ${selectedId === profile.id ? 'selected' : ''}`} onClick={() => choose(profile)}><span><strong>{profile.name}</strong><small>{profile.code} · {profile.department}</small></span><em className={profile.active === false ? 'archived' : ''}>{profile.active === false ? 'Archived' : `${profile.parameters.filter((parameter) => parameter.active !== false).length} fields`}</em></button>) : <p className="muted">No investigations found.</p>}</div></aside>
      <form className="card catalogue-editor" onSubmit={save}>
        <div className="section-title"><div><h2>{selectedId ? 'Edit investigation' : 'New investigation'}</h2><span>{selectedId ? 'The test code is permanent to protect analyzer mappings and history.' : 'Use a short code that is unique in your laboratory.'}</span></div>{selected && <span className={`status ${selected.active === false ? 'status-pending' : 'status-authorized'}`}>{selected.active === false ? 'archived' : 'active'}</span>}</div>
        <div className="catalogue-basic-grid">
          <label className="field"><span>Test / panel name *</span><input required value={draft.name} onChange={(event) => updateProfile('name', event.target.value)} placeholder="e.g. Thyroid Profile" /></label>
          <label className="field"><span>Test code *</span><input required pattern="[A-Za-z][A-Za-z0-9_]{1,39}" disabled={Boolean(selectedId)} value={draft.code} onChange={(event) => updateProfile('code', event.target.value.toUpperCase())} placeholder="e.g. THYROID" /></label>
          <label className="field"><span>Department *</span><input required value={draft.department} onChange={(event) => updateProfile('department', event.target.value)} placeholder="e.g. Immunoassay" /></label>
          <label className="field"><span>Specimen type</span><input value={draft.specimenType} onChange={(event) => updateProfile('specimenType', event.target.value)} placeholder="e.g. Serum / EDTA blood" /></label>
          <label className="field"><span>Expected turnaround time</span><input value={draft.turnaroundTime} onChange={(event) => updateProfile('turnaroundTime', event.target.value)} placeholder="e.g. Same day" /></label>
          <label className="field"><span>Collection / reporting note</span><input value={draft.instructions} onChange={(event) => updateProfile('instructions', event.target.value)} placeholder="Optional laboratory instruction" /></label>
        </div>
        <div className="parameter-toolbar"><div><h2>Report fields</h2><span>Every field is copied into the order when it is created.</span></div><button type="button" className="secondary" onClick={() => setDraft((current) => ({ ...current, parameters: [...current.parameters, emptyParameter((current.parameters.length + 1) * 10)] }))}>Add field</button></div>
        <div className="parameter-stack">{draft.parameters.map((parameter, index) => <section className={`parameter-editor ${parameter.active ? '' : 'parameter-inactive'}`} key={`${parameter.code}-${index}`}>
          <div className="parameter-heading"><strong>Field {index + 1}</strong><div><label className="archive-toggle"><input type="checkbox" checked={parameter.active} onChange={(event) => updateParameter(index, { active: event.target.checked })} /> Active</label><button type="button" className="text-button danger-text" onClick={() => setDraft((current) => ({ ...current, parameters: current.parameters.filter((_, position) => position !== index) }))}>Remove</button></div></div>
          <div className="parameter-grid">
            <label className="field"><span>Parameter name *</span><input required value={parameter.name} onChange={(event) => updateParameter(index, { name: event.target.value })} placeholder="e.g. TSH" /></label>
            <label className="field"><span>Parameter code *</span><input required pattern="[A-Za-z][A-Za-z0-9_]{1,39}" value={parameter.code} onChange={(event) => updateParameter(index, { code: event.target.value.toUpperCase() })} placeholder="e.g. TSH" /></label>
            <label className="field"><span>Result type *</span><select value={parameter.resultKind} onChange={(event) => changeResultKind(index, event.target.value as ResultKind)}><option value="NUMERIC">Numeric</option><option value="TEXT">Free text</option><option value="POS_NEG">Positive / Negative</option><option value="SELECT">Select from list</option></select></label>
            <label className="field"><span>Unit</span><input value={parameter.unit} onChange={(event) => updateParameter(index, { unit: event.target.value })} placeholder="e.g. mIU/mL" /></label>
            <label className="field"><span>Method</span><input value={parameter.method} onChange={(event) => updateParameter(index, { method: event.target.value })} placeholder="e.g. Enzymatic colorimetric" /><small>Use the method validated by your laboratory for this analyzer/reagent system.</small></label>
            <label className="field"><span>Display order</span><input type="number" min="0" value={parameter.sortOrder} onChange={(event) => updateParameter(index, { sortOrder: Number(event.target.value) || 0 })} /></label>
            {!parameter.calculationFormula && <label className="field"><span>Suggested starting value</span><input value={parameter.suggestedValue} onChange={(event) => updateParameter(index, { suggestedValue: event.target.value })} placeholder={parameter.resultKind === 'POS_NEG' ? 'e.g. Negative' : 'Optional'} /><small>Shown as a suggestion only; it is never saved until the technician applies it.</small></label>}
            {parameter.resultKind === 'NUMERIC' && <label className="field formula-field"><span>Calculation formula</span><input value={parameter.calculationFormula} onChange={(event) => updateParameter(index, { calculationFormula: event.target.value.toUpperCase(), suggestedValue: '', commonValues: [] })} placeholder="e.g. ALB / GLOB" /><small>Use existing parameter codes and +, -, *, /, parentheses only.</small></label>}
          </div>
          {parameter.resultKind === 'NUMERIC' && <div className="critical-settings"><div><strong>Critical-value limits</strong><small>Optional panic thresholds. Configure only values approved by the laboratory’s qualified medical professional.</small></div><div className="quick-entry-grid"><label className="field"><span>Critical low</span><input type="number" step="any" value={parameter.criticalLow} onChange={(event) => updateParameter(index, { criticalLow: event.target.value })} placeholder="Optional" /></label><label className="field"><span>Critical high</span><input type="number" step="any" value={parameter.criticalHigh} onChange={(event) => updateParameter(index, { criticalHigh: event.target.value })} placeholder="Optional" /></label></div></div>}
          {(['NUMERIC', 'TEXT'].includes(parameter.resultKind) && !parameter.calculationFormula) && <label className="field options-field common-values-field"><span>Common quick values</span><textarea value={parameter.commonValues.join('\n')} onChange={(event) => updateParameter(index, { commonValues: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} placeholder={parameter.resultKind === 'NUMERIC' ? '12\n12.5\n13' : 'Negative\nNot detected'} /><small>One approved shortcut per line. Selecting one fills the result but does not save it automatically.</small></label>}
          {(parameter.resultKind === 'POS_NEG' || parameter.resultKind === 'SELECT') && <label className="field options-field"><span>Allowed result options *</span><textarea required value={parameter.selectOptions.join('\n')} onChange={(event) => updateParameter(index, { selectOptions: event.target.value.split('\n').map((value) => value.trim()).filter(Boolean) })} placeholder={'Negative\nPositive'} /><small>One option per line. The result entry screen permits only these values.</small></label>}
          {parameter.resultKind === 'NUMERIC' && <div className="reference-editor"><div className="parameter-heading"><div><strong>Reference ranges</strong><small>Add separate adult, child, male, female or pregnancy intervals as required by your laboratory SOP.</small></div><button type="button" className="text-button" onClick={() => updateParameter(index, { referenceRanges: [...parameter.referenceRanges, {}] })}>Add range</button></div>{parameter.referenceRanges.map((range, rangeIndex) => <div className="range-grid" key={rangeIndex}><label className="field"><span>Label</span><input value={range.label || ''} onChange={(event) => updateRange(index, rangeIndex, 'label', event.target.value)} placeholder="e.g. Adult female" /></label><label className="field"><span>Gender</span><select value={range.gender || ''} onChange={(event) => updateRange(index, rangeIndex, 'gender', event.target.value)}><option value="">Any</option><option>Male</option><option>Female</option><option>Other</option></select></label><label className="field"><span>Age from</span><input type="number" min="0" max="130" value={range.ageMin ?? ''} onChange={(event) => updateRange(index, rangeIndex, 'ageMin', event.target.value)} /></label><label className="field"><span>Age to</span><input type="number" min="0" max="130" value={range.ageMax ?? ''} onChange={(event) => updateRange(index, rangeIndex, 'ageMax', event.target.value)} /></label><label className="field"><span>Low limit</span><input type="number" step="any" value={range.low ?? ''} onChange={(event) => updateRange(index, rangeIndex, 'low', event.target.value)} /></label><label className="field"><span>High limit</span><input type="number" step="any" value={range.high ?? ''} onChange={(event) => updateRange(index, rangeIndex, 'high', event.target.value)} /></label><button type="button" className="text-button danger-text range-remove" onClick={() => updateParameter(index, { referenceRanges: parameter.referenceRanges.filter((_, position) => position !== rangeIndex) })}>Remove</button></div>)}</div>}
        </section>)}</div>
        {error && <p className="form-error">{error}</p>}{message && <p className="success-message">{message}</p>}
        <div className="form-actions catalogue-actions">{selected && selected.active === false && <button type="button" className="secondary" onClick={() => void restore()} disabled={busy}>Restore investigation</button>}{selected && selected.active !== false && <button type="button" className="secondary danger-action" onClick={() => void archive()} disabled={busy}>Archive investigation</button>}<button disabled={busy}>{busy ? 'Saving…' : selectedId ? 'Save investigation' : 'Create investigation'}</button></div>
        {selectedId && <section className="catalogue-audit"><h3>Catalogue history</h3>{audit.length ? audit.map((event) => <p key={event.id}><strong>{event.event_type.replaceAll('_', ' ')}</strong><span>{event.user_name || 'System'} · {formatDate(event.created_at, true)}</span></p>) : <p className="muted">No catalogue events recorded yet.</p>}</section>}
      </form>
    </div>
  </section>;
}
