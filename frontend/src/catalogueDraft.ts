import type { Profile, ReferenceRange, ResultKind } from './types';

export type DraftParameter = {
  codeEdited?: boolean; id?: string; clientKey: string; loincCode: string; referenceNote: string;
  description: string; code: string; name: string; resultKind: ResultKind; unit: string; referenceRanges: ReferenceRange[];
  method: string; selectOptions: string[]; commonValues: string[]; calculationFormula: string; suggestedValue: string; numericStep: string; sliderMin: string; sliderMax: string; criticalLow: string; criticalHigh: string; sortOrder: number; active: boolean;
};
export type DraftProfile = {
  description: string; code: string; name: string; department: string; specimenType: string; turnaroundTime: string; instructions: string; parameters: DraftParameter[];
};

export function emptyParameter(sortOrder: number): DraftParameter {
  return { description: '', clientKey: crypto.randomUUID(), loincCode: '', referenceNote: '', code: '', name: '', resultKind: 'NUMERIC', unit: '', method: '', referenceRanges: [], selectOptions: [], commonValues: [], calculationFormula: '', suggestedValue: '', numericStep: '', sliderMin: '', sliderMax: '', criticalLow: '', criticalHigh: '', sortOrder, active: true };
}
export function blankProfile(): DraftProfile {
  return { description: '', code: '', name: '', department: 'Laboratory', specimenType: '', turnaroundTime: '', instructions: '', parameters: [emptyParameter(10)] };
}
export function profileDraft(profile: Profile): DraftProfile {
  return {
    description: profile.description || '', code: profile.code, name: profile.name, department: profile.department, specimenType: profile.specimen_type || '', turnaroundTime: profile.turnaround_time || '', instructions: profile.instructions || '',
    parameters: [...profile.parameters].sort((a, b) => a.sort_order - b.sort_order).map((parameter) => ({
      description: parameter.description || '', codeEdited: true, id: parameter.id, clientKey: parameter.id, loincCode: parameter.loinc_code || '', referenceNote: parameter.reference_note || '', code: parameter.code, name: parameter.name, resultKind: parameter.result_kind, unit: parameter.unit || '', method: parameter.method || '',
      referenceRanges: parameter.reference_ranges || [], selectOptions: parameter.select_options || [], commonValues: parameter.common_values || [], calculationFormula: parameter.calculation_formula || '', suggestedValue: parameter.suggested_value || '', numericStep: parameter.numeric_step === null || parameter.numeric_step === undefined ? '' : String(parameter.numeric_step), sliderMin: parameter.slider_min === null || parameter.slider_min === undefined ? '' : String(parameter.slider_min), sliderMax: parameter.slider_max === null || parameter.slider_max === undefined ? '' : String(parameter.slider_max), criticalLow: parameter.critical_low === null || parameter.critical_low === undefined ? '' : String(parameter.critical_low), criticalHigh: parameter.critical_high === null || parameter.critical_high === undefined ? '' : String(parameter.critical_high), sortOrder: parameter.sort_order, active: parameter.active !== false
    }))
  };
}

export function availableCode(name: string, taken: string[]) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^[^A-Z]+/, '').replace(/_+$/, '').slice(0, 34) || 'TEST';
  let code = base;
  for (let suffix = 2; taken.includes(code); suffix++) code = `${base}_${suffix}`;
  return code;
}

export function rangeSummary(parameter: DraftParameter) {
  if (parameter.resultKind !== 'NUMERIC') return parameter.selectOptions.filter(Boolean).join(' / ') || 'Text result';
  if (!parameter.referenceRanges.length) return parameter.referenceNote ? 'Interpretation note' : 'No reference range';
  return parameter.referenceRanges.map((range) => {
    const scope = [range.label || range.gender, range.ageMin !== undefined || range.ageMax !== undefined ? `${range.ageMin ?? 0}-${range.ageMax ?? 'any'} ${range.ageUnit || 'years'}` : ''].filter(Boolean).join(', ');
    return `${scope ? `${scope}: ` : ''}${range.low ?? 'any'} to ${range.high ?? 'any'}`;
  }).join(' | ');
}
