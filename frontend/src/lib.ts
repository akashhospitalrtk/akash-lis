import type { Order, OrderTest, ReferenceRange, Result, Role, User } from './types';

export function hasRole(user: Pick<User, 'role' | 'roles'>, ...roles: Role[]) {
  return (user.roles ?? [user.role]).some((role) => roles.includes(role));
}
export function userRoleLabel(user: Pick<User, 'role' | 'roles'>) {
  return (user.roles ?? [user.role]).map(roleLabel).join(' + ');
}
export function hasPermission(user: Pick<User, 'role' | 'roles' | 'permissions'>, permission: string) {
  if (user.permissions) return user.permissions.includes(permission);
  return hasRole(user, 'ADMIN') || (permission.startsWith('catalogue.') && hasRole(user, 'CATALOGUE_MANAGER'));
}

export function formatDate(value?: string | null, withTime = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) }).format(new Date(value));
}

function normalizedGender(value?: string | null) {
  const gender = value?.trim().toLowerCase() || '';
  if (gender === 'm' || gender === 'male') return 'male';
  if (gender === 'f' || gender === 'female') return 'female';
  if (gender === 'o' || gender === 'other') return 'other';
  return gender === 'any' ? '' : gender;
}

export function matchingReferenceRange(ranges: ReferenceRange[] = [], order: Order) {
  const factors = { days: 1, weeks: 7, months: 365.25 / 12, years: 365.25 };
  const rawAge = order.age_value ?? order.age_years;
  const unit = order.age_value != null ? order.age_unit || 'years' : 'years';
  const age = Number(rawAge) * factors[unit];
  const hasAge = rawAge !== null && rawAge !== undefined && Number.isFinite(age);
  const patientGender = normalizedGender(order.gender);
  const matches = ranges.filter((range: ReferenceRange) => {
    const factor = factors[range.ageUnit || 'years'];
    const rangeGender = normalizedGender(range.gender);
    const genderMatches = !rangeGender || rangeGender === patientGender;
    return genderMatches && (range.ageMin == null || (hasAge && age + 1e-8 >= Number(range.ageMin) * factor))
      && (range.ageMax == null || (hasAge && age - 1e-8 <= Number(range.ageMax) * factor));
  });
  return matches.sort((left, right) => {
    const specificity = (range: ReferenceRange) => (normalizedGender(range.gender) ? 2 : 0) + (range.ageMin != null ? 2 : 0) + (range.ageMax != null ? 2 : 0);
    const span = (range: ReferenceRange) => range.ageMin != null && range.ageMax != null ? (range.ageMax - range.ageMin) * factors[range.ageUnit || 'years'] : Infinity;
    return specificity(right) - specificity(left) || span(left) - span(right);
  })[0];
}

function referenceAgeScope(range: ReferenceRange) {
  if (range.ageMin == null && range.ageMax == null) return '';
  const unit = range.ageUnit || 'years';
  if (range.ageMin != null && range.ageMax != null) return `${range.ageMin}–${range.ageMax} ${unit}`;
  if (range.ageMin != null) return `${range.ageMin}+ ${unit}`;
  return `0–${range.ageMax} ${unit}`;
}

export function referenceText(ranges: ReferenceRange[] = [], _order: Order) {
  if (!ranges.length) return '—';
  return ranges.map((range) => {
    const configuredLabel = range.label?.trim();
    const genderLabel = normalizedGender(range.gender).replace(/^./, (letter) => letter.toUpperCase());
    const ageScope = referenceAgeScope(range);
    const label = configuredLabel || [genderLabel, ageScope].filter(Boolean).join(', ');
    const limits = range.low !== undefined || range.high !== undefined ? `${range.low ?? '—'} – ${range.high ?? '—'}` : '';
    if (label && limits) return `${label}: ${limits}`;
    return label || limits || '—';
  }).join('\n');
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
  return { ADMIN: 'Administrator', IT: 'Hospital IT', DOCTOR: 'Doctor', TECHNICIAN: 'Lab technician', AUTHORIZER: 'Report authorizer', CATALOGUE_MANAGER: 'Investigation manager' }[role] || role;
}

export function formatAge(order: Pick<Order, 'age_value' | 'age_unit' | 'age_years'>) {
  const value = order.age_value ?? order.age_years;
  return value == null ? '' : `${value} ${order.age_value != null ? order.age_unit || 'years' : 'years'}`;
}
