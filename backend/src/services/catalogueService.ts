import type { DbClient } from '../database/pool.js';
import type { ParameterInput } from '../schemas/profileSchemas.js';
import type { ParameterRow } from '../types/database.js';
import { AppError } from '../core/AppError.js';
import { randomUUID } from 'node:crypto';

const invalid = (message: string) => new AppError(message, 400);

// IDs identify fields; codes are editable labels used by formulas and import mappings.
export function planParameters(existingRows: Pick<ParameterRow, 'id' | 'code'>[], parameters: ParameterInput[]) {
  const byId = new Map(existingRows.map((row) => [row.id, row]));
  const byCode = new Map(existingRows.map((row) => [row.code, row]));
  const used = new Set();
  const renames = new Map<string, string>();
  const planned = parameters.map((parameter) => {
    const existing = parameter.id ? byId.get(parameter.id) : byCode.get(parameter.code);
    if (parameter.id && !existing) throw invalid('A parameter does not belong to this investigation. Reload the catalogue.');
    if (existing && used.has(existing.id)) throw invalid('The same parameter cannot appear twice.');
    if (existing) used.add(existing.id);
    if (existing && existing.code !== parameter.code) renames.set(existing.code, parameter.code);
    return { ...parameter, id: existing?.id || randomUUID(), existing: Boolean(existing) };
  });
  for (const parameter of planned) {
    const owner = byCode.get(parameter.code);
    if (owner && !used.has(owner.id)) throw invalid(`Code ${parameter.code} belongs to an existing or archived field. Edit that field or choose another code.`);
  }
  return {
    parameters: planned.map((parameter) => ({ ...parameter, calculationFormula: parameter.calculationFormula?.replace(/\b[A-Z][A-Z0-9_]*\b/g, (code) => renames.get(code) || code) })),
    removedIds: existingRows.filter((row) => !used.has(row.id)).map((row) => row.id),
    codeChanges: [...renames].map(([from, to]) => ({ from, to }))
  };
}

export async function writeParameters(client: DbClient, profileId: string, plan: ReturnType<typeof planParameters>) {
  // Vacate codes first so atomic swaps work without violating the unique constraint.
  for (const parameter of plan.parameters.filter((item) => item.existing)) {
    await client.query('UPDATE profile_parameters SET code = $1 WHERE id = $2 AND profile_id = $3', [`_${parameter.id}`, parameter.id, profileId]);
  }
  for (const parameter of plan.parameters) {
    await client.query(`INSERT INTO profile_parameters
      (id, profile_id, code, name, result_kind, unit, method, reference_ranges, select_options, common_values,
       calculation_formula, suggested_value, numeric_step, slider_min, slider_max, critical_low, critical_high, sort_order, active, loinc_code, reference_note, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, result_kind = EXCLUDED.result_kind,
       unit = EXCLUDED.unit, method = EXCLUDED.method, reference_ranges = EXCLUDED.reference_ranges,
       select_options = EXCLUDED.select_options, common_values = EXCLUDED.common_values, calculation_formula = EXCLUDED.calculation_formula,
       suggested_value = EXCLUDED.suggested_value, numeric_step = EXCLUDED.numeric_step, slider_min = EXCLUDED.slider_min,
       slider_max = EXCLUDED.slider_max, critical_low = EXCLUDED.critical_low, critical_high = EXCLUDED.critical_high,
       sort_order = EXCLUDED.sort_order, active = EXCLUDED.active, loinc_code = EXCLUDED.loinc_code, reference_note = EXCLUDED.reference_note, description = COALESCE(EXCLUDED.description, profile_parameters.description)`,
    [parameter.id, profileId, parameter.code, parameter.name, parameter.resultKind, parameter.unit || null, parameter.method || null,
      JSON.stringify(parameter.referenceRanges), JSON.stringify(parameter.selectOptions), JSON.stringify(parameter.commonValues),
      parameter.calculationFormula || null, parameter.suggestedValue || null, parameter.numericStep ?? null,
      parameter.sliderMin ?? null, parameter.sliderMax ?? null, parameter.criticalLow ?? null, parameter.criticalHigh ?? null,
      parameter.sortOrder, parameter.active, parameter.loincCode || null, parameter.referenceNote || null, parameter.description ?? null]);
  }
  if (plan.removedIds.length) await client.query('UPDATE profile_parameters SET active = FALSE WHERE id = ANY($1::uuid[])', [plan.removedIds]);
}
