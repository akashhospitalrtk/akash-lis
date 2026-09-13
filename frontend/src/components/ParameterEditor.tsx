import { CustomSelect } from './CustomSelect';
import { unitOptions, methodOptions } from '../catalogueOptions';
import { ClinicalNotesEditor, type ClinicalNoteSuggestion } from './ClinicalNotesEditor';
import type { DraftParameter } from '../catalogueDraft';
import type { ReferenceRange, ResultKind } from '../types';

type Props = { units?: string[]; methods?: string[]; noteSuggestion?: ClinicalNoteSuggestion; parameter: DraftParameter; onChange: (patch: Partial<DraftParameter>) => void; onKindChange: (kind: ResultKind) => void };

export function ParameterEditor({ parameter, onChange, onKindChange, noteSuggestion, units = [], methods = [] }: Props) {
  function updateRange(rangeIndex: number, key: keyof ReferenceRange, value: string) {
    const referenceRanges = parameter.referenceRanges.map((range, index) => {
      if (index !== rangeIndex) return range;
      const next = { ...range };
      if (key === 'ageMin' || key === 'ageMax' || key === 'low' || key === 'high') next[key] = value === '' ? undefined : Number(value);
      else if (key === 'ageUnit') next.ageUnit = value as ReferenceRange['ageUnit'];
      else if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    onChange({ referenceRanges });
  }
  return <div className="parameter-detail-fields">
          <div className="parameter-grid">
            <label className="field"><span>Parameter name *</span><input data-parameter-name required minLength={2} maxLength={160} value={parameter.name} onChange={(event) => onChange({ name: event.target.value })} placeholder="e.g. TSH" /></label>
            <label className="field"><span>Parameter code *</span><input required pattern="[A-Za-z][A-Za-z0-9_]{0,39}" value={parameter.code} onChange={(event) => onChange({ code: event.target.value.toUpperCase(), codeEdited: true })} placeholder="e.g. TSH" /></label>
            <label className="field"><span>Result type *</span><select value={parameter.resultKind} onChange={(event) => onKindChange(event.target.value as ResultKind)}><option value="NUMERIC">Numeric</option><option value="TEXT">Free text</option><option value="POS_NEG">Positive / Negative</option><option value="SELECT">Select from list</option></select></label>
            <CustomSelect label="Unit" value={parameter.unit} options={[...unitOptions, ...units]} onChange={(unit) => onChange({ unit })} />
            <CustomSelect label="Method" value={parameter.method} options={[...methodOptions, ...methods]} onChange={(method) => onChange({ method })} />
            <small>Choose the unit and method validated for this analyte and analyzer.</small>
          </div>
          {(parameter.resultKind === 'POS_NEG' || parameter.resultKind === 'SELECT') && <label className="field options-field"><span>Allowed result options *</span><textarea required value={parameter.selectOptions.join('\n')} onChange={(event) => onChange({ selectOptions: event.target.value.split('\n') })} placeholder={'Negative\nPositive'} /><small>One option per line. The result entry screen permits only these values.</small></label>}
          <details className="catalogue-optional" open><summary>Reference values and interpretation</summary>
          <label className="field options-field"><span>Reference / interpretation note</span><textarea disabled={parameter.resultKind === 'NUMERIC'} maxLength={2000} value={parameter.referenceNote} onChange={(event) => onChange({ referenceNote: event.target.value })} placeholder="Optional categories or explanatory reference text" /><small>{parameter.resultKind === 'NUMERIC' ? 'Note editing is disabled for numeric results. Enter numeric reference ranges below; existing notes are preserved.' : 'Printed as text. Does not set automatic low/high flags.'}</small></label>
          {parameter.resultKind === 'NUMERIC' && <div className="reference-editor"><div className="parameter-heading"><div><strong>Reference ranges</strong><small>Enter validated age bounds and select days, weeks, months or years. Labels alone do not restrict ages. Bounds are inclusive; avoid overlapping intervals.</small></div><button type="button" className="text-button" onClick={() => onChange({ referenceRanges: [...parameter.referenceRanges, {}] })}>Add range</button></div>{parameter.referenceRanges.map((range, rangeIndex) => <div className="range-grid" key={rangeIndex}><label className="field"><span>Label</span><input value={range.label || ''} onChange={(event) => updateRange(rangeIndex, 'label', event.target.value)} placeholder="e.g. Adult female" /></label><label className="field"><span>Gender</span><select value={range.gender || ''} onChange={(event) => updateRange(rangeIndex, 'gender', event.target.value)}><option value="">Any</option><option>Male</option><option>Female</option><option>Other</option></select></label><label className="field"><span>Age from</span><input type="number" min="0" step="any" value={range.ageMin ?? ''} onChange={(event) => updateRange(rangeIndex, 'ageMin', event.target.value)} /></label><label className="field"><span>Age to</span><input type="number" min="0" step="any" value={range.ageMax ?? ''} onChange={(event) => updateRange(rangeIndex, 'ageMax', event.target.value)} /></label><label className="field"><span>Age unit</span><select aria-label="Age unit" value={range.ageUnit || 'years'} onChange={(event) => updateRange(rangeIndex, 'ageUnit', event.target.value)}>{['days', 'weeks', 'months', 'years'].map((unit) => <option key={unit}>{unit}</option>)}</select></label><label className="field"><span>Low limit</span><input type="number" step="any" value={range.low ?? ''} onChange={(event) => updateRange(rangeIndex, 'low', event.target.value)} /></label><label className="field"><span>High limit</span><input type="number" step="any" value={range.high ?? ''} onChange={(event) => updateRange(rangeIndex, 'high', event.target.value)} /></label><button type="button" className="text-button danger-text range-remove" onClick={() => onChange({ referenceRanges: parameter.referenceRanges.filter((_, position) => position !== rangeIndex) })}>Remove</button></div>)}</div>}
          </details>
<details className="catalogue-optional"><summary>Optional codes, calculations and entry shortcuts</summary><div className="parameter-grid">
            <label className="field"><span>LOINC code (optional)</span><input value={parameter.loincCode} onChange={(event) => onChange({ loincCode: event.target.value })} placeholder="e.g. 2160-0" /><small>Match analyte, specimen, units and method in the LOINC directory. Format is checked; clinical mapping must be verified.</small></label>
            {!parameter.calculationFormula && <label className="field"><span>Suggested starting value</span><input value={parameter.suggestedValue} onChange={(event) => onChange({ suggestedValue: event.target.value })} placeholder={parameter.resultKind === 'POS_NEG' ? 'e.g. Negative' : 'Optional'} /><small>Shown as a suggestion only; it is never saved until the technician applies it.</small></label>}
            {parameter.resultKind === 'NUMERIC' && <label className="field formula-field"><span>Calculation formula</span><input value={parameter.calculationFormula} onChange={(event) => onChange({ calculationFormula: event.target.value.toUpperCase(), suggestedValue: '', commonValues: [] })} placeholder="e.g. ALB / GLOB" /><small>Use existing parameter codes and +, -, *, /, parentheses only.</small></label>}
          </div>
          {parameter.resultKind === 'NUMERIC' && <div className="critical-settings"><div><strong>Critical-value limits</strong><small>Optional panic thresholds. Configure only values approved by the laboratory’s qualified medical professional.</small></div><div className="quick-entry-grid"><label className="field"><span>Critical low</span><input type="number" step="any" value={parameter.criticalLow} onChange={(event) => onChange({ criticalLow: event.target.value })} placeholder="Optional" /></label><label className="field"><span>Critical high</span><input type="number" step="any" value={parameter.criticalHigh} onChange={(event) => onChange({ criticalHigh: event.target.value })} placeholder="Optional" /></label></div></div>}
          {(['NUMERIC', 'TEXT'].includes(parameter.resultKind) && !parameter.calculationFormula) && <label className="field options-field common-values-field"><span>Common quick values</span><textarea value={parameter.commonValues.join('\n')} onChange={(event) => onChange({ commonValues: event.target.value.split('\n') })} placeholder={parameter.resultKind === 'NUMERIC' ? '12\n12.5\n13' : 'Negative\nNot detected'} /><small>One approved shortcut per line. Selecting one fills the result but does not save it automatically.</small></label>}
          </details>
    <ClinicalNotesEditor label="Parameter clinical notes" value={parameter.description} onChange={(description) => onChange({ description })} suggestion={noteSuggestion} />
  </div>;
}
