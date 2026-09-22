import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { catalogueTemplates, methodSuggestions } from '../catalogueTemplates';
import catalogueGuide from '../../../docs/catalogue-setup.md?raw';
import { formatDate } from '../lib';
import type { Profile, ResultKind } from '../types';
import { availableCode, blankProfile, emptyParameter, newParameterKey, profileDraft, rangeSummary, type DraftProfile, type DraftParameter } from '../catalogueDraft';
import { ClinicalNotesEditor, type ClinicalNoteSuggestion } from './ClinicalNotesEditor';
import { CustomSelect } from './CustomSelect';
import { departmentSuggestions, specimenOptions } from '../catalogueOptions';
import { ParameterEditor } from './ParameterEditor';

type CatalogueAudit = { id: string; event_type: string; created_at: string; user_name?: string | null };
const cataloguePageSize = 6;

export function InvestigationCatalogue({ onChanged }: { onChanged: () => void }) {
  const [descriptions, setDescriptions] = useState<{ profiles: Record<string, ClinicalNoteSuggestion>; parameters: Record<string, ClinicalNoteSuggestion> }>({ profiles: {}, parameters: {} });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftProfile>(blankProfile);
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [expandedKey, setExpandedKey] = useState<string | null>(draft.parameters[0].clientKey);
  const [parameterQuery, setParameterQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [reuseQuery, setReuseQuery] = useState('');
  const [showReuse, setShowReuse] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const profileCodeEdited = useRef(false);
  const dirty = JSON.stringify(draft) !== baseline;
  const [query, setQuery] = useState('');
  const [cataloguePage, setCataloguePage] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [audit, setAudit] = useState<CatalogueAudit[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPermanentDelete, setShowPermanentDelete] = useState(false);
  const [deleteConfirmationCode, setDeleteConfirmationCode] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [templateKey, setTemplateKey] = useState('h360');
  const [includeSourceRanges, setIncludeSourceRanges] = useState(false);
  const template = catalogueTemplates.find((item) => item.key === templateKey)!;
  const selected = profiles.find((profile) => profile.id === selectedId) || null;

  const reusable = useMemo(() => profiles.filter((profile) => profile.active !== false).flatMap((profile) =>
    profileDraft(profile).parameters.filter((parameter) => parameter.active && !parameter.calculationFormula).map((parameter) => ({ profile, parameter }))
  ).filter(({ profile, parameter }) => `${profile.name} ${parameter.name} ${parameter.code}`.toLowerCase().includes(reuseQuery.toLowerCase().trim())).slice(0, 8), [profiles, reuseQuery]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function canDiscard() { return !dirty || window.confirm('Discard your unsaved catalogue changes?'); }
  function resetEditor(next: DraftProfile, id: string | null) {
    setDraft(next); setBaseline(JSON.stringify(next)); setExpandedKey(id ? null : next.parameters[0]?.clientKey || null);
    setParameterQuery(''); setShowInactive(false); setShowReuse(false); setShowPermanentDelete(false); setDeleteConfirmationCode(''); setDeleteReason(''); profileCodeEdited.current = Boolean(id);
  }
  function discardChanges() {
    if (!canDiscard()) return;
    resetEditor(selected ? profileDraft(selected) : blankProfile(), selectedId); setError(''); setMessage('');
  }
  function focusParameter(clientKey: string) {
    setExpandedKey(clientKey); setParameterQuery(''); setShowInactive(draft.parameters.find((parameter) => parameter.clientKey === clientKey)?.active === false);
    window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>(`[data-parameter-key="${clientKey}"]`);
      element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      element?.querySelector<HTMLInputElement>('[data-parameter-name]')?.focus({ preventScroll: true });
    }, 0);
  }
  function addParameter(source?: DraftParameter) {
    const parameter = source ? { ...structuredClone(source), id: undefined, clientKey: newParameterKey(), active: true, codeEdited: true,
      code: availableCode(source.code, draft.parameters.map((item) => item.code)), sortOrder: (draft.parameters.length + 1) * 10 } : { ...emptyParameter((draft.parameters.length + 1) * 10), resultKind: departmentSuggestions[draft.department]?.resultKind || 'NUMERIC', method: departmentSuggestions[draft.department]?.method || '', selectOptions: departmentSuggestions[draft.department]?.resultKind === 'POS_NEG' ? ['Negative', 'Positive'] : [] };
    setDraft((current) => ({ ...current, parameters: current.parameters.length === 1 && !current.parameters[0].id && !current.parameters[0].name && !current.parameters[0].code && !current.parameters[0].method && !current.parameters[0].unit ? [parameter] : [...current.parameters, parameter] }));
    setShowReuse(false); setReuseQuery(''); setMessage(''); focusParameter(parameter.clientKey);
  }
  function duplicateParameter(index: number) { addParameter({ ...draft.parameters[index], name: `${draft.parameters[index].name} (copy)` }); }
  function moveParameter(index: number, direction: number) {
    setDraft((current) => {
      const parameters = [...current.parameters];
      [parameters[index], parameters[index + direction]] = [parameters[index + direction], parameters[index]];
      return { ...current, parameters: parameters.map((parameter, position) => ({ ...parameter, sortOrder: (position + 1) * 10 })) };
    });
  }
  function removeParameter(index: number) {
    setDraft((current) => ({ ...current, parameters: current.parameters[index].id
      ? current.parameters.map((parameter, at) => at === index ? { ...parameter, active: false } : parameter)
      : current.parameters.filter((_, at) => at !== index) }));
    setExpandedKey(null); setShowInactive(false); setMessage('Parameter removed from the draft. You can discard changes to undo. Saved fields remain available under Show inactive.');
  }
  function duplicateInvestigation() {
    if (!canDiscard()) return;
    const copy = structuredClone(draft);
    copy.name = `${copy.name} (copy)`; copy.code = availableCode(`${copy.code}_COPY`, profiles.map((profile) => profile.code));
    copy.parameters = copy.parameters.filter((parameter) => parameter.active).map((parameter) => ({ ...parameter, id: undefined, clientKey: newParameterKey() }));
    setSelectedId(null); setDraft(copy); setBaseline(JSON.stringify(blankProfile())); setAudit([]); setError(''); setExpandedKey(null);
    profileCodeEdited.current = true; setMessage('Investigation copied into a new draft. Review the name and code, then create it.');
  }
  function validateDraft() {
    const fail = (message: string, parameter?: DraftParameter) => {
      setError(message); setMessage('');
      if (parameter) focusParameter(parameter.clientKey);
      else formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
      return false;
    };
    const validCode = /^[A-Z][A-Z0-9_]{0,39}$/;
    if (draft.name.trim().length < 2 || !validCode.test(draft.code)) return fail('Enter an investigation name and a code starting with a letter.');
    if (!draft.parameters.some((parameter) => parameter.active)) return fail('Add at least one active parameter.');
    const codes = new Set<string>();
    for (const parameter of draft.parameters) {
      const name = parameter.name.trim() || 'New parameter';
      if (name.length < 2 || !parameter.name.trim() || !validCode.test(parameter.code)) return fail(`${name}: enter a name and a valid parameter code.`, parameter);
      if (codes.has(parameter.code)) return fail(`${name}: code ${parameter.code} is already used. Choose another code.`, parameter);
      codes.add(parameter.code);
      if (['SELECT', 'POS_NEG'].includes(parameter.resultKind) && !parameter.selectOptions.some((option) => option.trim())) return fail(`${name}: add at least one allowed result option.`, parameter);
      for (const range of parameter.referenceRanges) {
        if (range.low === undefined && range.high === undefined) return fail(`${name}: enter a reference limit or remove the empty range.`, parameter);
        if (range.low !== undefined && range.high !== undefined && range.low > range.high) return fail(`${name}: the low reference limit cannot exceed the high limit.`, parameter);
        if (range.ageMin !== undefined && range.ageMax !== undefined && range.ageMin > range.ageMax) return fail(`${name}: age from cannot exceed age to.`, parameter);
      }
    }
    if (!formRef.current?.checkValidity()) { formRef.current?.reportValidity(); return false; }
    return true;
  }

  async function loadProfiles() {
    const catalogue = await api<Profile[]>('/catalogue/profiles');
    setProfiles(catalogue);
    return catalogue;
  }
  async function loadAudit(id: string) {
    try { setAudit(await api<CatalogueAudit[]>(`/catalogue/profiles/${id}/audit`)); } catch { setAudit([]); }
  }
  useEffect(() => { void api<typeof descriptions>('/catalogue/descriptions').then(setDescriptions).catch(() => undefined); }, []);
  useEffect(() => { void loadProfiles().catch((reason: Error) => setError(reason.message)); }, []);

  const listed = useMemo(() => profiles.filter((profile) => {
    const matches = `${profile.code} ${profile.name} ${profile.department}`.toLowerCase().includes(query.trim().toLowerCase());
    return matches && (showArchived || profile.active !== false);
  }), [profiles, query, showArchived]);
  const pageCount = Math.max(1, Math.ceil(listed.length / cataloguePageSize));
  const currentPage = Math.min(cataloguePage, pageCount - 1);
  const firstListed = currentPage * cataloguePageSize;
  const visibleProfiles = listed.slice(firstListed, firstListed + cataloguePageSize);

  function choose(profile: Profile) {
    if (busy || !canDiscard()) return;
    resetEditor(profileDraft(profile), profile.id);
    setSelectedId(profile.id); setMessage(''); setError(''); void loadAudit(profile.id);
  }
  function createNew() {
    if (busy || !canDiscard()) return;
    resetEditor(blankProfile(), null);
    setSelectedId(null); setAudit([]); setMessage(''); setError('');
  }
  function changeDepartment(department: string) {
    const suggestion = departmentSuggestions[department];
    setDraft((current) => ({ ...current, department, ...(suggestion && (!current.specimenType || current.specimenType === departmentSuggestions[current.department]?.specimenType) ? { specimenType: suggestion.specimenType } : {}),
      parameters: current.parameters.map((p) => suggestion && !p.id && !p.name ? { ...p, resultKind: suggestion.resultKind, method: !p.method || p.method === departmentSuggestions[current.department]?.method ? suggestion.method : p.method, selectOptions: suggestion.resultKind === 'POS_NEG' ? ['Negative', 'Positive'] : [] } : p) }));
  }
  function updateProfile(key: Exclude<keyof DraftProfile, 'parameters'>, value: string) {
    if (key === 'code') profileCodeEdited.current = true;
    setDraft((current) => ({ ...current, [key]: value, ...(key === 'name' && !selectedId && !profileCodeEdited.current ? { code: availableCode(value, profiles.map((profile) => profile.code)) } : {}) }));
  }
  function updateParameter(index: number, patch: Partial<DraftParameter>) {
    setDraft((current) => ({ ...current, parameters: current.parameters.map((parameter, position) => position === index ? { ...parameter, ...patch, ...(patch.name !== undefined && !parameter.id && !parameter.codeEdited ? { code: availableCode(patch.name, current.parameters.filter((_, at) => at !== index).map((item) => item.code)) } : {}) } : parameter) }));
  }
  function changeResultKind(index: number, resultKind: ResultKind) {
    const parameter = draft.parameters[index];
    const selectOptions = resultKind === 'POS_NEG' && !parameter.selectOptions.length ? ['Negative', 'Positive'] : resultKind === 'NUMERIC' ? [] : parameter.selectOptions;
    updateParameter(index, { resultKind, selectOptions, suggestedValue: '', commonValues: ['NUMERIC', 'TEXT'].includes(resultKind) ? parameter.commonValues : [], referenceRanges: resultKind === 'NUMERIC' ? parameter.referenceRanges : [], calculationFormula: resultKind === 'NUMERIC' ? parameter.calculationFormula : '', numericStep: resultKind === 'NUMERIC' ? parameter.numericStep : '', sliderMin: resultKind === 'NUMERIC' ? parameter.sliderMin : '', sliderMax: resultKind === 'NUMERIC' ? parameter.sliderMax : '', criticalLow: resultKind === 'NUMERIC' ? parameter.criticalLow : '', criticalHigh: resultKind === 'NUMERIC' ? parameter.criticalHigh : '' });
  }
  function useTemplate() {
    if (busy || !canDiscard()) return;
    const target = profiles.find((profile) => profile.code === template.code);
    const current = target ? profileDraft(target) : blankProfile();
    const parameters = template.parameters.map((parameter, index) => {
      const existing = current.parameters.find((item) => item.code === parameter.code);
      return { ...emptyParameter((index + 1) * 10), ...parameter,
        ...(existing?.id ? { id: existing.id, clientKey: existing.id } : {}),
        description: existing?.description ?? descriptions.parameters[`${template.code}:${parameter.code}`]?.text ?? '',
        loincCode: parameter.loincCode || '', calculationFormula: parameter.calculationFormula || '',
        referenceRanges: includeSourceRanges ? parameter.referenceRanges || [] : [],
        referenceNote: includeSourceRanges ? parameter.referenceNote || '' : ''
      };
    });
    setBaseline(JSON.stringify(current)); profileCodeEdited.current = true;
    setParameterQuery(''); setShowInactive(false); setExpandedKey(null);
    setSelectedId(target?.id || null);
    setDraft({ ...current, code: template.code, name: template.name, department: template.department, specimenType: template.specimenType, description: target ? current.description : descriptions.profiles[template.code]?.text || '', parameters });
    setAudit([]); setError('');
    setMessage('Template loaded for review. Only these fields will stay active after saving. Check units, methods and reference values before saving; patient results remain empty.');
  }

  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !validateDraft()) return; setBusy(true); setError(''); setMessage('');
    try {
      const path = selectedId ? `/catalogue/profiles/${selectedId}` : '/catalogue/profiles';
      const saved = await api<Profile>(path, { method: selectedId ? 'PUT' : 'POST', body: JSON.stringify({ ...draft, parameters: draft.parameters.map((parameter) => ({ ...parameter, selectOptions: parameter.selectOptions.map((value) => value.trim()).filter(Boolean), commonValues: parameter.commonValues.map((value) => value.trim()).filter(Boolean) })) }) });
      await loadProfiles();
      setSelectedId(saved.id); resetEditor(profileDraft(saved), saved.id); await loadAudit(saved.id);
      setMessage(selectedId ? 'Investigation updated. New orders will use this configuration; older reports keep their original snapshot.' : 'Investigation created and ready for ordering.');
      onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the investigation.'); }
    finally { setBusy(false); }
  }
  async function archive() {
    if (!selected || busy || !canDiscard() || !window.confirm(`Archive ${selected.name}? It will no longer be available for new orders, but past reports stay unchanged.`)) return;
    setBusy(true); setError('');
    try { await api(`/catalogue/profiles/${selected.id}`, { method: 'DELETE' }); await loadProfiles(); setMessage('Investigation archived.'); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not archive the investigation.'); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!selected || busy || !canDiscard()) return;
    setBusy(true); setError('');
    try {
      const restored = await api<Profile>(`/catalogue/profiles/${selected.id}/restore`, { method: 'POST' });
      await loadProfiles(); resetEditor(profileDraft(restored), restored.id); await loadAudit(restored.id); setMessage('Investigation restored for new orders.'); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not restore the investigation.'); }
    finally { setBusy(false); }
  }
  async function permanentlyDelete() {
    if (!selected || busy) return;
    if (deleteConfirmationCode.trim().toUpperCase() !== selected.code) { setError(`Type ${selected.code} exactly to confirm permanent deletion.`); return; }
    if (deleteReason.trim().length < 5) { setError('Enter a deletion reason of at least 5 characters.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const deletedName = selected.name;
      await api(`/catalogue/profiles/${selected.id}/permanent`, { method: 'DELETE', body: JSON.stringify({ confirmationCode: deleteConfirmationCode.trim().toUpperCase(), reason: deleteReason }) });
      await loadProfiles(); resetEditor(blankProfile(), null); setSelectedId(null); setAudit([]);
      setMessage(`${deletedName} was permanently deleted because it had no patient-order history.`); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not permanently delete the investigation.'); }
    finally { setBusy(false); }
  }

  return <section className="page catalogue-page" onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); formRef.current?.requestSubmit(); } }}>
    <div className="page-heading"><div><p className="eyebrow">Authorized catalogue access</p><h1>Investigation catalogue</h1><p className="muted">Configure the tests your laboratory performs. Changes affect only new orders; reported orders remain clinically traceable.</p></div><button type="button" onClick={createNew}>Add investigation</button></div>
    <details className="card catalogue-help"><summary>Analyzer / report templates and setup guide</summary>
      <p>H360 uses a 3-part differential. Chem 7 is a photometer; chemistry methods depend on the reagent kit. Report templates reproduce another lab's method labels for review.</p>
      <div className="catalogue-basic-grid"><label className="field"><span>Setup template</span><select value={templateKey} onChange={(event) => { setTemplateKey(event.target.value); setIncludeSourceRanges(false); }}>{catalogueTemplates.map((item) => <option key={item.key} value={item.key}>{item.name} /  {item.key === 'h360' ? 'your analyzer' : 'sample report'}</option>)}</select></label></div>
      <p><strong>{template.source}</strong></p><p className="muted">{template.guidance}</p>
      {template.key !== 'h360' && <label className="archive-toggle"><input type="checkbox" checked={includeSourceRanges} onChange={(event) => setIncludeSourceRanges(event.target.checked)} /> Include source report intervals / notes for review (adult female only)</label>}
      <button type="button" className="secondary" onClick={useTemplate} disabled={busy}>Replace draft with template</button>
      <p>Local codes identify your test or parameter, for example CBC and HB. LOINC is an optional separate standard observation code. Reference limits flag low/high results; reference notes only display explanatory text. Suggested values are shortcuts, never actual patient results.</p>
      <p><a download="laboratory-catalogue-guide.md" href={`data:text/markdown;charset=utf-8,${encodeURIComponent(catalogueGuide)}`}>Download full setup guide</a> | <a href="https://www.erbalachema.com/en/products-and-solutions/hematology/h-360/" target="_blank" rel="noreferrer">H360 documentation</a> | <a href="https://www.erbalachema.com/en/products-and-solutions/clinical-chemistry/photometer-chem-7/" target="_blank" rel="noreferrer">Chem 7 documentation</a> | <a href="https://loinc.org/kb/users-guide/major-parts-of-a-loinc-term" target="_blank" rel="noreferrer">LOINC guide</a> | <a href="https://clsi.org/shop/standards/ep28ig/" target="_blank" rel="noreferrer">Reference interval verification</a></p>
    </details>
    <datalist id="catalogue-methods">{methodSuggestions.map((method) => <option key={method} value={method} />)}</datalist>
    <div className="catalogue-layout">
      <aside className="card catalogue-list">
        <div className="section-title"><h2>Available tests</h2><span>{profiles.filter((profile) => profile.active !== false).length} active</span></div>
        <input aria-label="Search investigations" value={query} onChange={(event) => { setQuery(event.target.value); setCataloguePage(0); }} placeholder="Search name, code or department" />
        <label className="archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => { setShowArchived(event.target.checked); setCataloguePage(0); }} /> Show archived</label>
        <p className="catalogue-result-count" role="status">{listed.length ? `${firstListed + 1}–${Math.min(firstListed + cataloguePageSize, listed.length)} of ${listed.length}${query.trim() ? ' matches' : ' tests'}` : 'No matching tests'}</p>
        <div className="catalogue-items">{visibleProfiles.length ? visibleProfiles.map((profile) => <button type="button" key={profile.id} className={`catalogue-item ${selectedId === profile.id ? 'selected' : ''}`} onClick={() => choose(profile)}><span><strong>{profile.name}</strong><small>{profile.code} · {profile.department}</small></span><em className={profile.active === false ? 'archived' : ''}>{profile.active === false ? 'Archived' : `${profile.parameters.filter((parameter) => parameter.active !== false).length} fields`}</em></button>) : <p className="muted">Try a different name, code or department.</p>}</div>
        <nav className="catalogue-pagination" aria-label="Investigation pages">
          <button type="button" className="secondary" aria-label="Previous tests" disabled={currentPage === 0} onClick={() => setCataloguePage(currentPage - 1)}>Previous</button>
          <span>{currentPage + 1} / {pageCount}</span>
          <button type="button" className="secondary" aria-label="Next tests" disabled={currentPage >= pageCount - 1} onClick={() => setCataloguePage(currentPage + 1)}>Next</button>
        </nav>
      </aside>
      <form ref={formRef} className="card catalogue-editor" onSubmit={save} noValidate>
        <fieldset className="catalogue-form-fields" disabled={busy}>
        <div className="section-title"><div><h2>{selectedId ? 'Edit investigation' : 'New investigation'}</h2><span>{selectedId ? 'Codes are editable. Update analyzer / CSV mappings when you rename a code; existing orders retain their snapshot.' : 'Use a short code that is unique in your laboratory.'}</span></div>{selected && <span className={`status ${selected.active === false ? 'status-pending' : 'status-authorized'}`}>{selected.active === false ? 'archived' : 'active'}</span>}</div>
        <div className="catalogue-basic-grid">
          <label className="field"><span>Test / panel name *</span><input required minLength={2} maxLength={160} value={draft.name} onChange={(event) => updateProfile('name', event.target.value)} placeholder="e.g. Thyroid Profile" /></label>
          <label className="field"><span>Test code *</span><input required pattern="[A-Za-z][A-Za-z0-9_]{0,39}" value={draft.code} onChange={(event) => updateProfile('code', event.target.value.toUpperCase())} placeholder="e.g. THYROID" /></label>
          <CustomSelect label="Department" value={draft.department} options={[...Object.keys(departmentSuggestions), ...profiles.map((p) => p.department)]} onChange={changeDepartment} />
          <CustomSelect label="Specimen type" value={draft.specimenType} options={[...specimenOptions, ...profiles.map((p) => p.specimen_type || '')]} onChange={(value) => updateProfile('specimenType', value)} />
        </div><details className="catalogue-optional"><summary>Optional collection and reporting details</summary><div className="catalogue-basic-grid">
          <label className="field"><span>Expected turnaround time</span><input value={draft.turnaroundTime} onChange={(event) => updateProfile('turnaroundTime', event.target.value)} placeholder="e.g. Same day" /></label>
          <label className="field"><span>Collection / reporting note</span><input value={draft.instructions} onChange={(event) => updateProfile('instructions', event.target.value)} placeholder="Optional laboratory instruction" /></label>
        </div>
        </details>
        <ClinicalNotesEditor label="Investigation clinical notes" value={draft.description} onChange={(value) => updateProfile('description', value)} suggestion={descriptions.profiles[selected?.code || draft.code]} />
        <div className="parameter-toolbar"><div><h2>Parameters</h2><span>{draft.parameters.filter((parameter) => parameter.active).length} active | Select a row to edit its details and reference values.</span></div><div className="catalogue-button-group"><button type="button" className="secondary" onClick={() => setShowReuse((value) => !value)}>Reuse parameter</button><button type="button" onClick={() => addParameter()}>Add parameter</button></div></div>
        {showReuse && <section className="parameter-reuse"><label className="field"><span>Find an existing parameter</span><input autoFocus value={reuseQuery} onChange={(event) => setReuseQuery(event.target.value)} placeholder="Search name, code or investigation" /></label><small>Copies a measured field's configuration. Review its method, unit and reference ranges for this investigation.</small><div className="reuse-results">{reusable.map(({ profile, parameter }) => <button type="button" className="secondary" key={parameter.id} onClick={() => addParameter(parameter)}><strong>{parameter.name}</strong><small>{parameter.code} | {profile.name}</small></button>)}{!reusable.length && <p className="muted">No matching measured parameters.</p>}</div></section>}
        <div className="parameter-filters"><input aria-label="Search parameters" value={parameterQuery} onChange={(event) => setParameterQuery(event.target.value)} placeholder="Find a parameter by name, code or method" /><label className="archive-toggle"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Show inactive ({draft.parameters.filter((parameter) => !parameter.active).length})</label></div>
        <div className="parameter-stack">{draft.parameters.map((parameter, index) => {
          if ((!parameter.active && !showInactive) || !`${parameter.name} ${parameter.code} ${parameter.method}`.toLowerCase().includes(parameterQuery.toLowerCase().trim())) return null;
          const expanded = parameter.clientKey === expandedKey;
          return <section className={`parameter-editor compact-parameter ${expanded ? 'expanded' : ''} ${parameter.active ? '' : 'parameter-inactive'}`} key={parameter.clientKey} data-parameter-key={parameter.clientKey}>
            <div className="parameter-overview"><button type="button" className="parameter-summary" aria-expanded={expanded} aria-controls={`parameter-${parameter.clientKey}`} onClick={() => setExpandedKey(expanded ? null : parameter.clientKey)}><span className="parameter-number">{index + 1}</span><span><strong>{parameter.name || 'New parameter'}</strong><small>{parameter.code || 'Code generated from name'} | {parameter.unit || parameter.resultKind} {parameter.calculationFormula ? ' | Calculated' : ''}</small></span><span className="parameter-summary-method">{parameter.method || 'Method not set'}</span><span className="parameter-summary-range">{rangeSummary(parameter)}</span><span className="parameter-edit-label">{expanded ? 'Close' : 'Edit'}</span></button></div>
            {expanded && <div className="parameter-detail" id={`parameter-${parameter.clientKey}`}>
              <div className="parameter-detail-toolbar"><label className="archive-toggle"><input type="checkbox" checked={parameter.active} onChange={(event) => updateParameter(index, { active: event.target.checked })} /> Active</label><div className="catalogue-button-group"><button type="button" className="text-button" disabled={index === 0} onClick={() => moveParameter(index, -1)}>Move up</button><button type="button" className="text-button" disabled={index === draft.parameters.length - 1} onClick={() => moveParameter(index, 1)}>Move down</button><button type="button" className="text-button" onClick={() => duplicateParameter(index)}>Duplicate</button><button type="button" className="text-button danger-text" onClick={() => removeParameter(index)}>Remove</button></div></div>
              <ParameterEditor units={profiles.flatMap((p) => p.parameters.map((r) => r.unit || ''))} methods={profiles.flatMap((p) => p.parameters.map((r) => r.method || ''))} parameter={parameter} noteSuggestion={descriptions.parameters[`${selected?.code || draft.code}:${selected?.parameters.find((item) => item.id === parameter.id)?.code || parameter.code}`]} onChange={(patch) => updateParameter(index, patch)} onKindChange={(kind) => changeResultKind(index, kind)} />
              <div className="parameter-detail-actions"><button type="button" className="secondary" onClick={() => setExpandedKey(null)}>Done editing</button><button type="button" className="text-button" onClick={() => addParameter()}>Add next parameter</button></div>
            </div>}
          </section>;
        })}</div>
        {!draft.parameters.some((parameter) => (parameter.active || showInactive) && `${parameter.name} ${parameter.code} ${parameter.method}`.toLowerCase().includes(parameterQuery.toLowerCase().trim())) && <div className="catalogue-empty"><p>No parameters to show.</p><button type="button" className="secondary" onClick={() => { setParameterQuery(''); addParameter(); }}>Add a parameter</button></div>}
        </fieldset>
        <div className="catalogue-save-bar">
          {error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status" className="success-message">{message}</p>}
          <div className="catalogue-save-line"><span className={dirty ? 'unsaved-label' : 'muted'}>{dirty ? 'Unsaved changes' : selectedId ? 'All changes saved' : 'Start with a name; codes are generated for you'}<small>Ctrl+S to save | Changes apply to new orders</small></span><div className="catalogue-button-group">{dirty && <button type="button" className="secondary" disabled={busy} onClick={discardChanges}>Discard changes</button>}<button disabled={busy}>{busy ? 'Saving...' : selectedId ? 'Save investigation' : 'Create investigation'}</button></div></div>
        </div>
        {selected && <details className="catalogue-optional"><summary>Investigation actions and history</summary><div className="catalogue-button-group"><button type="button" className="secondary" onClick={duplicateInvestigation} disabled={busy}>Duplicate investigation</button>{selected.active === false ? <button type="button" className="secondary" onClick={() => void restore()} disabled={busy}>Restore investigation</button> : <button type="button" className="text-button danger-text" onClick={() => void archive()} disabled={busy}>Archive investigation</button>}<button type="button" className="text-button danger-text" onClick={() => { if (canDiscard()) { setShowPermanentDelete(true); setDeleteConfirmationCode(''); setDeleteReason(''); setError(''); } }} disabled={busy}>Delete permanently</button></div>
        {showPermanentDelete && <section className="order-action-panel danger-action"><h3>Delete unused investigation permanently</h3><p>This is only allowed when the investigation has never been used in a patient order. Otherwise, archive it so historical reports remain traceable.</p><label className="field"><span>Type investigation code {selected.code}</span><input aria-label="Confirm investigation code" autoComplete="off" value={deleteConfirmationCode} onChange={(event) => setDeleteConfirmationCode(event.target.value.toUpperCase())} /></label><label className="field"><span>Deletion reason</span><textarea aria-label="Permanent deletion reason" minLength={5} maxLength={500} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} /></label><div className="catalogue-button-group"><button type="button" className="secondary" disabled={busy} onClick={() => { setShowPermanentDelete(false); setDeleteConfirmationCode(''); setDeleteReason(''); }}>Cancel</button><button type="button" className="danger-action" disabled={busy || deleteConfirmationCode !== selected.code || deleteReason.trim().length < 5} onClick={() => void permanentlyDelete()}>{busy ? 'Deleting...' : 'Confirm permanent deletion'}</button></div></section>}
        {selectedId && <section className="catalogue-audit"><h3>Catalogue history</h3>{audit.length ? audit.map((event) => <p key={event.id}><strong>{event.event_type.replaceAll('_', ' ')}</strong><span>{event.user_name || 'System'} · {formatDate(event.created_at, true)}</span></p>) : <p className="muted">No catalogue events recorded yet.</p>}</section>}
        </details>}
      </form>
    </div>
  </section>;
}
