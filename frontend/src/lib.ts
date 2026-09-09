import type { Order, ReferenceRange, Result } from './types';

export function formatDate(value?: string | null, withTime = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) }).format(new Date(value));
}

export function matchingReferenceRange(ranges: ReferenceRange[] = [], order: Order) {
  const age = Number(order.age_years);
  const hasAge = order.age_years !== null && order.age_years !== undefined && Number.isFinite(age);
  const matches = ranges.filter((range) => {
    const gender = !range.gender || range.gender.toLowerCase() === String(order.gender || '').toLowerCase();
    const minAge = range.ageMin === undefined || (hasAge && age >= Number(range.ageMin));
    const maxAge = range.ageMax === undefined || (hasAge && age <= Number(range.ageMax));
    return gender && minAge && maxAge;
  });
  if (!matches.length) return undefined;
  return matches.sort((left, right) => {
    const specificity = (range: ReferenceRange) => (range.gender ? 2 : 0) + (range.ageMin !== undefined ? 2 : 0) + (range.ageMax !== undefined ? 2 : 0);
    const bySpecificity = specificity(right) - specificity(left);
    if (bySpecificity) return bySpecificity;
    const leftSpan = left.ageMin !== undefined && left.ageMax !== undefined ? Number(left.ageMax) - Number(left.ageMin) : Number.POSITIVE_INFINITY;
    const rightSpan = right.ageMin !== undefined && right.ageMax !== undefined ? Number(right.ageMax) - Number(right.ageMin) : Number.POSITIVE_INFINITY;
    return leftSpan - rightSpan;
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

export interface ResultTest { id: string; profile_code: string; profile_name: string; status: string; remarks?: string | null; sort_order: number; results: Result[] }

export function roleLabel(role: string) {
  return { ADMIN: 'Administrator', TECHNICIAN: 'Lab technician', AUTHORIZER: 'Report authorizer' }[role] || role;
}
