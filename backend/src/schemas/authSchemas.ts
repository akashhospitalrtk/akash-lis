import { z } from 'zod';

export const roleSchema = z.enum(['ADMIN', 'IT', 'DOCTOR', 'TECHNICIAN', 'AUTHORIZER', 'CATALOGUE_MANAGER']);
export const rolesSchema = z.array(roleSchema).min(1, 'Select at least one role.').max(6)
  .refine((roles) => new Set(roles).size === roles.length, 'Select each role only once.');
type Role = z.infer<typeof roleSchema>;
function normalizeRoles<T extends { role?: Role; roles?: Role[] }>(input: T) {
  const roles = input.roles || (input.role ? [input.role] : []);
  return { ...input, role: roles[0]!, roles };
}

const accountFields = z.object({
  username: z.string().trim().min(3).max(60),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(2).max(120),
  role: roleSchema.optional(),
  roles: rolesSchema.optional(),
  departmentIds: z.array(z.string().uuid()).max(30).default([]),
  designation: z.string().trim().max(120).optional().or(z.literal('')),
  signatureLabel: z.string().trim().max(160).optional().or(z.literal(''))
});
const validAssignment = (input: { role?: Role; roles?: Role[] }) => Boolean(input.roles?.length || input.role)
  && (!input.roles || !input.role || input.roles.includes(input.role));
export const accountSchema = accountFields.refine(validAssignment, 'Choose valid roles; legacy role must belong to roles.').transform(normalizeRoles);

export type AccountPayload = z.infer<typeof accountSchema>;

export const bootstrapSchema = accountFields.omit({ role: true, roles: true }).transform((input) => ({ ...input, role: 'ADMIN' as const, roles: ['ADMIN'] as Role[] }));
export const loginSchema = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) });
export const sessionSchema = z.object({ id: z.string().uuid(), role: roleSchema, roles: rolesSchema.optional(), username: z.string().optional(), fullName: z.string().optional(), designation: z.string().nullable().optional(), departments: z.array(z.object({ id: z.string().uuid(), name: z.string() })).default([]), permissions: z.array(z.string()).default([]) });
export const updateAccountSchema = accountFields.omit({ password: true, username: true }).extend({ active: z.boolean() }).refine(validAssignment, 'Choose valid roles; legacy role must belong to roles.').transform(normalizeRoles);
export const departmentSchema = z.object({ name: z.string().trim().min(2).max(80) });
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SessionUser = z.infer<typeof sessionSchema>;
