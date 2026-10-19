import type { DbClient } from '../database/pool.js';
import type { ReferenceRange, PatientAge, ResultRow } from '../types/database.js';
type MeasuredValue = string | number | null | undefined;
type FlagMetadata = Pick<ResultRow, 'result_kind' | 'reference_ranges' | 'critical_low' | 'critical_high'>;
import { AppError } from '../core/AppError.js';
export function matchingRange(ranges: ReferenceRange[] = [], patient: PatientAge) {
  const factors = { days: 1, weeks: 7, months: 365.25 / 12, years: 365.25 };
  const rawAge = patient.age_value ?? patient.age_years;
  const unit = patient.age_value != null ? patient.age_unit || 'years' : 'years';
  const age = Number(rawAge) * factors[unit];
  const hasAge = rawAge !== null && rawAge !== undefined && Number.isFinite(age);
  const matches = ranges.filter((range: ReferenceRange) => {
    const factor = factors[range.ageUnit || 'years'];
    const gender = !range.gender || range.gender.toLowerCase() === 'any' || range.gender.toLowerCase() === String(patient.gender || '').toLowerCase();
    return gender && (range.ageMin == null || (hasAge && age + 1e-8 >= Number(range.ageMin) * factor))
      && (range.ageMax == null || (hasAge && age - 1e-8 <= Number(range.ageMax) * factor));
  });
  return matches.sort((left, right) => {
    const specificity = (range: ReferenceRange) => (range.gender && range.gender.toLowerCase() !== 'any' ? 2 : 0) + (range.ageMin != null ? 2 : 0) + (range.ageMax != null ? 2 : 0);
    const span = (range: ReferenceRange) => range.ageMin != null && range.ageMax != null ? (range.ageMax - range.ageMin) * factors[range.ageUnit || 'years'] : Infinity;
    return specificity(right) - specificity(left) || span(left) - span(right);
  })[0];
}

export function abnormalFlag(value: MeasuredValue, ranges: ReferenceRange[], patient: PatientAge) {
  if (value === null || value === undefined || value === '' || !Array.isArray(ranges)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const range = matchingRange(ranges, patient);
  if (!range) return null;
  if (range.low !== undefined && numeric < Number(range.low)) return 'L';
  if (range.high !== undefined && numeric > Number(range.high)) return 'H';
  return null;
}

export function criticalFlag(value: MeasuredValue, result: FlagMetadata) {
  if (value === null || value === undefined || value === '' || result.result_kind !== 'NUMERIC') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (result.critical_low !== null && result.critical_low !== undefined && numeric <= Number(result.critical_low)) return 'CL';
  if (result.critical_high !== null && result.critical_high !== undefined && numeric >= Number(result.critical_high)) return 'CH';
  return null;
}

export function resultFlag(value: MeasuredValue, result: FlagMetadata, patient: PatientAge) {
  return criticalFlag(value, result) || abnormalFlag(value, result.reference_ranges, patient);
}

/** Reject values that cannot belong to the configured result field. This is used
 * for manual entry and analyzer imports, so a browser cannot bypass the rules. */
export function validatedResultValue(value: MeasuredValue, result: Pick<ResultRow, 'result_kind' | 'parameter_name' | 'select_options'>) {
  const normalized = value === null || value === undefined ? null : String(value).trim();
  if (!normalized) throw new AppError(`Please enter a result for ${result.parameter_name}.`, 400);
  if (result.result_kind === 'NUMERIC' && !Number.isFinite(Number(normalized))) {
    throw new AppError(`${result.parameter_name} must be a valid numeric result.`, 400);
  }
  if ((result.result_kind === 'SELECT' || result.result_kind === 'POS_NEG') && (!Array.isArray(result.select_options) || !result.select_options.includes(normalized))) {
    throw new AppError(`${result.parameter_name} must use one of its configured result options.`, 400);
  }
  return normalized;
}

function calculate(formula: string | null, values: Record<string, string | null>) {
  if (!formula) return null;
  let expression = formula.replace(/\b[A-Z][A-Z0-9_]*\b/g, (code) => {
    const numeric = Number(values[code]);
    return Number.isFinite(numeric) ? String(numeric) : 'NaN';
  });
  if (!/^[0-9+\-*/().\sNaInfty]+$/.test(expression) || expression.includes('NaN')) return null;
  try {
    const output = Function(`"use strict"; return (${expression})`)();
    return Number.isFinite(output) ? String(Number(output.toFixed(3))) : null;
  } catch {
    return null;
  }
}

export async function recalculateOrderTest(client: DbClient, orderTestId: string, patient: PatientAge, userId: string) {
  const { rows } = await client.query<Pick<ResultRow, 'id' | 'parameter_code' | 'result_value' | 'result_kind' | 'reference_ranges' | 'critical_low' | 'critical_high' | 'calculation_formula'>>(
    'SELECT id, parameter_code, result_value, result_kind, reference_ranges, critical_low, critical_high, calculation_formula FROM test_results WHERE order_test_id = $1 ORDER BY sort_order',
    [orderTestId]
  );
  const values = Object.fromEntries(rows.map((row) => [row.parameter_code, row.result_value]));
  for (const row of rows.filter((result) => result.calculation_formula)) {
    const resultValue = calculate(row.calculation_formula, values);
    const flag = resultFlag(resultValue, row, patient);
    await client.query(
      `UPDATE test_results SET result_value = $1, abnormal_flag = $2, updated_by = $3, updated_at = NOW(),
       entered_by = COALESCE(entered_by, $3), entered_at = COALESCE(entered_at, NOW()) WHERE id = $4`,
      [resultValue, flag, userId, row.id]
    );
    values[row.parameter_code] = resultValue;
  }
  const { rows: remaining } = await client.query(
    "SELECT COUNT(*)::int AS missing FROM test_results WHERE order_test_id = $1 AND calculation_formula IS NULL AND COALESCE(NULLIF(TRIM(result_value), ''), '') = ''",
    [orderTestId]
  );
  await client.query('UPDATE order_tests SET status = $1 WHERE id = $2', [remaining[0].missing ? 'PENDING' : 'COMPLETED', orderTestId]);
}

export async function refreshOrderStatus(client: DbClient, orderId: string) {
  const { rows } = await client.query(
    "SELECT COUNT(*)::int AS pending FROM order_tests WHERE order_id = $1 AND status = 'PENDING'", [orderId]
  );
  const status = rows[0].pending ? 'PENDING' : 'COMPLETED';
  await client.query(
    `UPDATE lab_orders
     SET status = $1::order_status,
         sample_status = CASE WHEN $1::order_status = 'COMPLETED'::order_status AND sample_status IN ('COLLECTED', 'IN_PROCESS') THEN 'RESULTS_PENDING' ELSE sample_status END,
         updated_at = NOW()
     WHERE id = $2 AND status <> 'AUTHORIZED'`,
    [status, orderId]
  );
}

export function referenceText(ranges: ReferenceRange[], patient: PatientAge) {
  const range = matchingRange(ranges, patient);
  if (!range) return '—';
  if (range.low !== undefined || range.high !== undefined) return `${range.low ?? '—'} – ${range.high ?? '—'}`;
  return range.label || '—';
}
