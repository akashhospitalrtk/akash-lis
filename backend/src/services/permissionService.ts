import type { SessionUser } from '../schemas/authSchemas.js';

export const doctorPermissions = ['patient.view', 'result.view', 'report.print', 'report.download', 'status.view', 'clinical_notes.write'] as const;
export type Permission = typeof doctorPermissions[number] | 'staff.manage' | 'patient.register' | 'result.enter' | 'result.authorize' | 'report.delete' | 'catalogue.manage' | 'catalogue.delete';
export function hasRole(user: Pick<SessionUser, 'role' | 'roles'>, ...roles: SessionUser['role'][]) {
  return (user.roles ?? [user.role]).some((role) => roles.includes(role));
}
export function permissionsFor(role: SessionUser['role'] | SessionUser['role'][]): Permission[] {
  if (Array.isArray(role)) return [...new Set(role.flatMap((item) => permissionsFor(item)))];
  if (role === 'ADMIN') return [...doctorPermissions, 'staff.manage', 'patient.register', 'result.enter', 'result.authorize', 'report.delete', 'catalogue.manage', 'catalogue.delete'];
  if (role === 'IT') return ['staff.manage'];
  if (role === 'CATALOGUE_MANAGER') return ['catalogue.manage', 'catalogue.delete'];
  if (role === 'DOCTOR') return [...doctorPermissions];
  if (role === 'AUTHORIZER') return ['patient.view', 'status.view', 'result.view', 'report.print', 'report.download', 'result.authorize'];
  if (role === 'TECHNICIAN') return ['patient.view', 'status.view', 'result.view', 'patient.register', 'result.enter'];
  return [];
}
