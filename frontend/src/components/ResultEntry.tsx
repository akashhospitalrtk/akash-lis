import { OrderActions } from './OrderActions';
import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { formatAge, formatDate, isDetailOrder, referenceText, resultFlag, userRoleLabel, type ResultTest, hasRole } from '../lib';
import type { Order, Result, User } from '../types';
import { Status } from './Worklist';

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function decimalStep(result: Result) {
  const configured = finiteNumber(result.numeric_step);
  if (configured !== null && configured > 0) return configured;
  const decimals = result.reference_ranges.flatMap((range) => [range.low, range.high]).map((value) => String(value ?? '').split('.')[1]?.length || 0);
  return 10 ** -Math.min(Math.max(...decimals, 0), 3);
}

function resultValidationMessage(result: Result, value: string | null | undefined) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Enter a result before saving.';
  if (result.result_kind === 'NUMERIC' && !Number.isFinite(Number(normalized))) return 'Enter a valid numeric result.';
  if ((result.result_kind === 'SELECT' || result.result_kind === 'POS_NEG') && !result.select_options.includes(normalized)) return 'Choose one of the approved result options.';
  return '';
}

function SuggestedValue({ result, value, locked, onChange }: { result: Result; value: string; locked: boolean; onChange: (value: string) => void }) {
  if (locked || !result.suggested_value || value) return null;
  return <button type="button" tabIndex={-1} className="suggestion-button" onClick={() => onChange(result.suggested_value || '')}>Use suggestion: {result.suggested_value}</button>;
}

function CommonValuePicker({ result, locked, onChange, inputId }: { result: Result; locked: boolean; onChange: (value: string) => void; inputId: string }) {
  const [choice, setChoice] = useState('');
  const commonValues = [...new Set(result.common_values || [])];
  if (locked || !commonValues.length) return null;
  function choose(value: string) {
    if (!value) return;
    onChange(value); setChoice('');
    window.requestAnimationFrame(() => document.getElementById(inputId)?.focus());
  }
  return <label className="common-value-control"><span>Common value</span><select tabIndex={-1} aria-label={`Use a common value for ${result.parameter_name}`} value={choice} onChange={(event) => choose(event.target.value)}><option value="">Use common value…</option>{commonValues.map((commonValue) => <option key={commonValue} value={commonValue}>{commonValue}</option>)}</select></label>;
}

function NumericInput({ result, value, locked, onChange, autoFocus }: { result: Result; value: string; locked: boolean; onChange: (value: string) => void; autoFocus: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `result-value-${result.id}`;
  const step = decimalStep(result);
  const sliderMin = finiteNumber(result.slider_min);
  const sliderMax = finiteNumber(result.slider_max);
  const hasSlider = sliderMin !== null && sliderMax !== null && sliderMin < sliderMax;
  const numericValue = finiteNumber(value);
  const suggested = finiteNumber(result.suggested_value);
  const sliderValue = hasSlider ? Math.min(Math.max(numericValue ?? suggested ?? sliderMin, sliderMin), sliderMax) : 0;
  useEffect(() => {
    const input = inputRef.current;
    if (!input || locked) return;
    const handleWheel = (event: WheelEvent) => {
      if (document.activeElement !== input || !event.deltaY || event.ctrlKey || event.metaKey || event.altKey) return;
      const current = finiteNumber(input.value);
      if (current === null && input.value.trim()) return;
      // A non-passive listener keeps the page still while adjusting the focused result.
      event.preventDefault();
      const next = (current ?? suggested ?? 0) + (event.deltaY < 0 ? step : -step);
      onChange(String(Number(next.toFixed(6))));
    };
    input.addEventListener('wheel', handleWheel, { passive: false });
    return () => input.removeEventListener('wheel', handleWheel);
  }, [locked, onChange, step, suggested]);
  return <div className="numeric-result-control">
    <div className="numeric-input-line">
      <input ref={inputRef} id={inputId} data-result-input type="text" inputMode="decimal" value={value} disabled={locked} autoFocus={autoFocus} title="Click this field, then scroll up to increase or down to decrease the value" onChange={(event) => onChange(event.target.value)} placeholder={result.suggested_value ? `Suggested: ${result.suggested_value}` : 'Enter value'} />
    </div>
    {hasSlider && <input className="result-slider" aria-label={`${result.parameter_name} quick slider`} tabIndex={-1} type="range" min={sliderMin} max={sliderMax} step={step} value={sliderValue} disabled={locked} onChange={(event) => onChange(event.target.value)} />}
    <CommonValuePicker result={result} locked={locked} onChange={onChange} inputId={inputId} />
    <SuggestedValue result={result} value={value} locked={locked} onChange={onChange} />
  </div>;
}

function InputForResult({ result, value, locked, onChange, autoFocus }: { result: Result; value: string; locked: boolean; onChange: (value: string) => void; autoFocus: boolean }) {
  if (result.result_kind === 'NUMERIC') return <NumericInput result={result} value={value} locked={locked || Boolean(result.calculation_formula)} autoFocus={autoFocus} onChange={onChange} />;
  const disabled = locked || Boolean(result.calculation_formula);
  const inputId = `result-value-${result.id}`;
  const props = { id: inputId, 'data-result-input': true, value, disabled, autoFocus, onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(event.target.value) };
  if (result.result_kind === 'POS_NEG' || result.result_kind === 'SELECT') return <div className="select-result-control"><select {...props}><option value="">— Select —</option>{result.select_options.map((option) => <option key={option}>{option}</option>)}</select><SuggestedValue result={result} value={value} locked={disabled} onChange={onChange} /></div>;
  return <div className="text-result-control"><input {...props} inputMode="text" placeholder={result.calculation_formula ? 'Calculated' : result.suggested_value ? `Suggested: ${result.suggested_value}` : 'Enter result'} /><CommonValuePicker result={result} locked={disabled} onChange={onChange} inputId={inputId} /><SuggestedValue result={result} value={value} locked={disabled} onChange={onChange} /></div>;
}

function Header({ order }: { order: Order }) {
  return <div className="order-header"><div><p className="eyebrow">Accession {order.accession_no}</p><h1>{order.patient_name}</h1><p>{[order.uhid && `UHID ${order.uhid}`, formatAge(order), order.gender, order.mobile].filter(Boolean).join(' · ')}</p></div><div className="order-meta"><Status value={order.sample_status || 'REGISTERED'} /><Status value={order.status} /><span>Sample: {formatDate(order.sample_date, true)}</span><span>{order.referring_doctor || 'No referring doctor'}</span></div></div>;
}

export function ResultEntry({ order, user, onUpdated, onReport, onDeleted }: { order: Order | null; user: User; onUpdated: (order: Order) => void; onReport: () => void; onDeleted: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [valueErrors, setValueErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showAmendment, setShowAmendment] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const detailed = isDetailOrder(order) ? order : null;
  const [jumpTestId, setJumpTestId] = useState('');

  useEffect(() => {
    if (!detailed) return;
    setValues(Object.fromEntries(detailed.tests.flatMap((test) => test.results.map((result) => [result.id, result.result_value || '']))));
    setComments(Object.fromEntries(detailed.tests.flatMap((test) => test.results.map((result) => [result.id, result.comments || '']))));
    setValueErrors({});
  }, [detailed]);
  useEffect(() => { setJumpTestId(''); }, [detailed?.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => document.querySelector<HTMLElement>('[data-result-input]:not([disabled])')?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [detailed?.id]);

  const editableResults = useMemo(() => detailed?.tests.flatMap((test) => test.results.filter((result) => !result.calculation_formula)) || [], [detailed]);
  function validateResults() {
    const nextErrors = Object.fromEntries(editableResults.map((result) => [result.id, resultValidationMessage(result, values[result.id] ?? result.result_value)]).filter(([, problem]) => problem));
    setValueErrors(nextErrors);
    const firstId = Object.keys(nextErrors)[0];
    if (!firstId) return true;
    setError(`Please fill the required result values. ${Object.keys(nextErrors).length} field${Object.keys(nextErrors).length === 1 ? '' : 's'} need attention.`);
    window.requestAnimationFrame(() => document.getElementById(`result-value-${firstId}`)?.focus());
    return false;
  }
  function changeResult(id: string, value: string) {
    setValues((current) => ({ ...current, [id]: value }));
    setValueErrors((current) => { const next = { ...current }; delete next[id]; return next; });
  }
  const criticalResults = useMemo(() => detailed?.tests.flatMap((test) => test.results.map((result) => {
    const value = values[result.id] ?? result.result_value ?? '';
    const flag = result.calculation_formula ? result.abnormal_flag : resultFlag(value, result, detailed);
    return flag === 'CL' || flag === 'CH' ? { name: result.parameter_name, value, unit: result.unit, flag } : null;
  }).filter((result): result is { name: string; value: string; unit: string | null | undefined; flag: string } => result !== null)) || [], [detailed, values]);
  async function save() {
    if (!detailed || !editableResults.length) return;
    setError(''); setMessage('');
    if (!validateResults()) return;
    setBusy(true);
    try {
      const updated = await api<Order>(`/orders/${detailed.id}/results`, { method: 'PUT', body: JSON.stringify({ results: editableResults.map((result) => ({ id: result.id, value: values[result.id] || null, comments: comments[result.id] || null })) }) });
      onUpdated(updated); setMessage('Results saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save results.'); }
    finally { setBusy(false); }
  }
  async function authorize() {
    if (!detailed) return;
    setError(''); setMessage('');
    if (!validateResults()) return;
    setBusy(true);
    try { const updated = await api<Order>(`/orders/${detailed.id}/authorize`, { method: 'POST' }); onUpdated(updated); setMessage('Report authorized.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not authorize the report.'); }
    finally { setBusy(false); }
  }
  async function startProcessing() {
    if (!detailed) return;
    setBusy(true); setError(''); setMessage('');
    try { const updated = await api<Order>(`/orders/${detailed.id}/prepare-entry`, { method: 'POST' }); onUpdated(updated); setMessage('Sample accepted and ready for result entry.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start processing.'); }
    finally { setBusy(false); }
  }
  async function amend() {
    if (!detailed) return;
    if (amendmentReason.trim().length < 5) { setError('Enter a clear amendment reason (at least 5 characters).'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const updated = await api<Order>(`/orders/${detailed.id}/amend`, { method: 'POST', body: JSON.stringify({ reason: amendmentReason.trim() }) });
      onUpdated(updated); setShowAmendment(false); setAmendmentReason('');
      setMessage('Amendment opened. Correct the results, save, then authorize and print the amended report.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start the amendment.'); }
    finally { setBusy(false); }
  }
  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file || !detailed) return;
    setBusy(true); setError('');
    try {
      const response = await api<{ imported: number; order: Order }>(`/orders/${detailed.id}/import-csv`, { method: 'POST', body: JSON.stringify({ csv: await file.text() }) });
      onUpdated(response.order); setMessage(`${response.imported} result${response.imported === 1 ? '' : 's'} imported from CSV.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import the CSV.'); }
    finally { setBusy(false); event.target.value = ''; }
  }
  function moveBetweenResults(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const direction = event.key === 'ArrowDown' || (event.key === 'Enter' && !event.shiftKey) ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!direction) return;
    const controls = Array.from(document.querySelectorAll<HTMLElement>('[data-result-input]:not([disabled])'));
    const current = controls.indexOf(event.target as HTMLElement);
    const next = controls[current + direction];
    if (current < 0) return;
    event.preventDefault();
    next?.focus();
  }
  function jumpToInvestigation(testId: string) {
    setJumpTestId(testId);
    window.requestAnimationFrame(() => document.getElementById(`order-test-${testId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); } };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  });

  if (!detailed) return <section className="page empty-state"><h1>Select an order</h1><p>Choose a report from the worklist, or create a new laboratory order.</p></section>;
  const canAuthorize = hasRole(user, 'ADMIN', 'AUTHORIZER');
  const canEdit = hasRole(user, 'ADMIN', 'TECHNICIAN');
  const locked = detailed.status === 'AUTHORIZED';
  const sampleNotAccepted = detailed.sample_status === 'REGISTERED';
  const sampleNeedsProcessing = detailed.sample_status === 'COLLECTED';
  const editingLocked = locked || !canEdit || sampleNotAccepted || sampleNeedsProcessing;
  return <section className="page result-page">
    <Header order={detailed} />
    <OrderActions key={detailed.id} order={detailed} user={user} onUpdated={onUpdated} onDeleted={onDeleted} hasUnsaved={detailed.tests.some((test) => test.results.some((r) => (values[r.id] ?? r.result_value ?? '') !== (r.result_value || '') || (comments[r.id] ?? r.comments ?? '') !== (r.comments || '')))} />
    {detailed.tests.length > 1 && <label className="investigation-jump"><span>Go to investigation</span><select value={jumpTestId} onChange={(event) => jumpToInvestigation(event.target.value)}><option value="">Choose a test panel…</option>{detailed.tests.map((test) => <option key={test.id} value={test.id}>{test.profile_code} — {test.profile_name} ({test.status.toLowerCase()})</option>)}</select></label>}
    <div className="entry-toolbar"><div><strong>Rapid entry</strong><span>Type a value, press ↓ or Enter for the next field, ↑ for the previous field · Ctrl+S saves</span></div><div className="toolbar-actions">{canEdit && ['REGISTERED', 'COLLECTED'].includes(detailed.sample_status || '') && <button className="secondary" onClick={() => void startProcessing()} disabled={busy}>{detailed.sample_status === 'REGISTERED' ? 'Accept sample & enter values' : 'Start processing'}</button>}{!editingLocked && <label className="file-button">Import analyzer CSV<input type="file" accept=".csv,.txt" onChange={importCsv} /></label>}<button className="secondary" onClick={onReport}>Report preview</button>{!editingLocked && <button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save results'}</button>}{canAuthorize && detailed.status === 'COMPLETED' && <button className="authorize" onClick={() => void authorize()} disabled={busy}>Authorize report</button>}{canAuthorize && locked && <button className="secondary" onClick={() => setShowAmendment((visible) => !visible)} disabled={busy}>Amend report</button>}</div></div>
    {message && <p className="success-message">{message}</p>}{error && <p className="form-error">{error}</p>}
    {sampleNotAccepted && <p className="notice">Choose Accept sample & enter values above to record sample acceptance and unlock result entry.</p>}
    {sampleNeedsProcessing && <p className="notice workflow-notice"><strong>Next step:</strong> confirm that testing has started, then choose <strong>Start processing</strong> to unlock manual entry and analyzer import.</p>}
    {criticalResults.length > 0 && <section className="critical-alert" role="alert"><strong>Critical value alert</strong><span>{criticalResults.map((result) => `${result.name}: ${result.value}${result.unit ? ` ${result.unit}` : ''} (${result.flag === 'CL' ? 'critical low' : 'critical high'})`).join(' · ')}</span><small>Follow your laboratory’s approved critical-result notification SOP before authorization.</small></section>}
    {locked && <p className="notice">This report was authorized by {detailed.authorized_by_name || 'an authorizer'} and is now read-only. Use Amend report to create a controlled correction.</p>}
    {!locked && !canEdit && <p className="notice">This amendment is awaiting correction by a laboratory technician or administrator. You can authorize it after the corrected results are saved.</p>}
    {showAmendment && <section className="amendment-panel"><h2>Start controlled amendment</h2><p>The current authorized report will be preserved as a prior version. Enter why the correction is needed; after correction, the report must be authorized and printed again.</p><label className="field"><span>Amendment reason *</span><textarea autoFocus maxLength={500} value={amendmentReason} onChange={(event) => setAmendmentReason(event.target.value)} placeholder="e.g. Corrected Hb result after analyzer repeat" /></label><div><button type="button" className="secondary" onClick={() => { setShowAmendment(false); setAmendmentReason(''); }}>Cancel</button><button type="button" className="amend-button" onClick={() => void amend()} disabled={busy}>Begin amendment</button></div></section>}
    <div className="test-entry-stack">{detailed.tests.map((test) => <TestEntry key={test.id} test={test} order={detailed} values={values} comments={comments} valueErrors={valueErrors} locked={editingLocked} onChange={changeResult} onCommentChange={(id, value) => setComments((current) => ({ ...current, [id]: value }))} onEnter={moveBetweenResults} />)}</div>
    {detailed.amendments?.length ? <section className="amendment-history card"><h2>Amendment history</h2>{detailed.amendments.map((amendment) => <p key={amendment.id}><strong>Amendment #{amendment.amendment_no}</strong><span>{amendment.reason}</span><small>Started by {amendment.started_by_name || 'Unknown'} · {formatDate(amendment.created_at, true)}{amendment.reauthorized_at ? ` · Re-authorized ${formatDate(amendment.reauthorized_at, true)}` : ' · Correction in progress'}</small></p>)}</section> : null}
    <section className="audit card"><h2>Audit history</h2><div>{detailed.audit?.length ? detailed.audit.map((event) => <p key={event.id}><strong>{event.event_type.replaceAll('_', ' ')}</strong><span>{event.user_name || 'System'} · {formatDate(event.created_at, true)}</span></p>) : <p className="muted">No audit activity yet.</p>}</div><p className="muted">Current user: {user.fullName} ({userRoleLabel(user)})</p></section>
  </section>;
}

function TestEntry({ test, order, values, comments, valueErrors, locked, onChange, onCommentChange, onEnter }: { test: ResultTest; order: Order; values: Record<string, string>; comments: Record<string, string>; valueErrors: Record<string, string>; locked: boolean; onChange: (id: string, value: string) => void; onCommentChange: (id: string, value: string) => void; onEnter: (event: KeyboardEvent<HTMLElement>) => void }) {
  return <section id={`order-test-${test.id}`} className="card test-entry"><div className="test-entry-title"><h2>{test.profile_name}</h2><Status value={test.status} /></div><div className="result-grid result-grid-head"><span>Parameter</span><span>Result</span><span>Unit</span><span>Reference range</span><span>Remarks</span><span>Flag</span></div>{test.results.map((result, index) => {
    const value = values[result.id] ?? result.result_value ?? '';
    const flag = result.calculation_formula ? result.abnormal_flag : resultFlag(value, result, order);
    const flagLabel = flag === 'CH' ? 'CRIT HIGH' : flag === 'CL' ? 'CRIT LOW' : flag === 'H' ? 'HIGH' : flag === 'L' ? 'LOW' : '—';
    const validationError = valueErrors[result.id];
    return <div className={`result-grid result-row ${validationError ? 'invalid' : ''} ${flag === 'CL' || flag === 'CH' ? 'critical' : flag ? 'abnormal' : ''}`} key={result.id}><label><strong>{result.parameter_name}</strong><small>{result.calculation_formula ? `Calculated: ${result.calculation_formula}` : result.parameter_code}</small></label><div onKeyDown={onEnter}><InputForResult result={result} value={value} locked={locked} autoFocus={index === 0} onChange={(next) => onChange(result.id, next)} />{validationError && <small className="result-validation" role="alert">{validationError}</small>}</div><span>{result.unit || '—'}</span><span className="entry-reference">{referenceText(result.reference_ranges, order)}{result.reference_note && <small>{result.reference_note}</small>}</span><input aria-label={`${result.parameter_name} remarks`} disabled={locked || Boolean(result.calculation_formula)} maxLength={400} value={comments[result.id] || ''} onChange={(event) => onCommentChange(result.id, event.target.value)} placeholder="Optional" /><span className={`flag flag-${flag || 'normal'}`}>{flag ? <strong>{flagLabel}</strong> : '—'}</span></div>;
  })}</section>;
}
