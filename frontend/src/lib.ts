import type { Order, OrderTest, ReferenceRange, Result } from './types';

export function formatDate(value?: string | null, withTime = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) }).format(new Date(value));
}

export function matchingReferenceRange(ranges: ReferenceRange[] = [], order: Order) {
  const factors = { days: 1, weeks: 7, months: 365.25 / 12, years: 365.25 };
  const rawAge = order.age_value ?? order.age_years;
  const unit = order.age_value != null ? order.age_unit || 'years' : 'years';
  const age = Number(rawAge) * factors[unit];
  const hasAge = rawAge !== null && rawAge !== undefined && Number.isFinite(age);
  const matches = ranges.filter((range: ReferenceRange) => {
    const factor = factors[range.ageUnit || 'years'];
    const gender = !range.gender || range.gender.toLowerCase() === 'any' || range.gender.toLowerCase() === String(order.gender || '').toLowerCase();
    return gender && (range.ageMin == null || (hasAge && age + 1e-8 >= Number(range.ageMin) * factor))
      && (range.ageMax == null || (hasAge && age - 1e-8 <= Number(range.ageMax) * factor));
  });
  return matches.sort((left, right) => {
    const specificity = (range: ReferenceRange) => (range.gender && range.gender.toLowerCase() !== 'any' ? 2 : 0) + (range.ageMin != null ? 2 : 0) + (range.ageMax != null ? 2 : 0);
    const span = (range: ReferenceRange) => range.ageMin != null && range.ageMax != null ? (range.ageMax - range.ageMin) * factors[range.ageUnit || 'years'] : Infinity;
    return specificity(right) - specificity(left) || span(left) - span(right);
  })[0];
}

export function referenceText(ranges: ReferenceRange[] = [], order: Order) {
  const range = matchingReferenceRange(ranges, order);
  if (!range) return '—';
  if (range.low !== undefined || range.high !== undefined) return `${range.low ?? '—'} – ${range.high ?? '—'}`;
  return range.label || '—';
}

export function resultFlag(value: string | null | undefined, result: Pick<Result, 'result_kind' | 'reference_ranges' | 'critical_low' | 'critical_high'>, order: Order) {
  if (value === undefined || value === null || value.trim() === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || result.result_kind !== 'NUMERIC') return null;
  if (result.critical_low !== null && result.critical_low !== undefined && numeric <= Number(result.critical_low)) return 'CL';
  if (result.critical_high !== null && result.critical_high !== undefined && numeric >= Number(result.critical_high)) return 'CH';
  const range = matchingReferenceRange(result.reference_ranges, order);
  if (!range) return null;
  if (range.low !== undefined && numeric < range.low) return 'L';
  if (range.high !== undefined && numeric > range.high) return 'H';
  return null;
}

export function isDetailOrder(order: Order | null): order is Order & { tests: ResultTest[] } {
  return Boolean(order && Array.isArray(order.tests));
}

export type ResultTest = OrderTest;

export function roleLabel(role: string) {
  return { ADMIN: 'Administrator', TECHNICIAN: 'Lab technician', AUTHORIZER: 'Report authorizer' }[role] || role;
}

export function formatAge(order: Pick<Order, 'age_value' | 'age_unit' | 'age_years'>) {
  const value = order.age_value ?? order.age_years;
  return value == null ? '' : `${value} ${order.age_value != null ? order.age_unit || 'years' : 'years'}`;
}
