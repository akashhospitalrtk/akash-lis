import type { SessionUser } from '../schemas/authSchemas.js';

export const doctorPermissions = ['patient.view', 'result.view', 'report.print', 'report.download', 'status.view', 'clinical_notes.write'] as const;
export type Permission = typeof doctorPermissions[number] | 'staff.manage';
export function permissionsFor(role: SessionUser['role']): Permission[] {
  if (role === 'ADMIN') return [...doctorPermissions, 'staff.manage'];
  if (role === 'IT') return ['staff.manage'];
  if (role === 'DOCTOR') return [...doctorPermissions];
  if (role === 'AUTHORIZER') return ['patient.view', 'status.view', 'result.view', 'report.print', 'report.download'];
  return ['patient.view', 'status.view', 'result.view'];
}
