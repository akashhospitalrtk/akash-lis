import { z } from 'zod';

export const roleSchema = z.enum(['ADMIN', 'IT', 'DOCTOR', 'TECHNICIAN', 'AUTHORIZER']);

export const accountSchema = z.object({
  username: z.string().trim().min(3).max(60),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(2).max(120),
  role: roleSchema,
  departmentIds: z.array(z.string().uuid()).max(30).default([]),
  designation: z.string().trim().max(120).optional().or(z.literal('')),
  signatureLabel: z.string().trim().max(160).optional().or(z.literal(''))
});

export type AccountPayload = z.infer<typeof accountSchema>;

export const bootstrapSchema = accountSchema.omit({ role: true }).transform((input) => ({ ...input, role: 'ADMIN' as const }));
export const loginSchema = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) });
export const sessionSchema = z.object({ id: z.string().uuid(), role: roleSchema, username: z.string().optional(), fullName: z.string().optional(), designation: z.string().nullable().optional(), departments: z.array(z.object({ id: z.string().uuid(), name: z.string() })).default([]), permissions: z.array(z.string()).default([]) });
export const updateAccountSchema = accountSchema.omit({ password: true, username: true }).extend({ active: z.boolean() });
export const departmentSchema = z.object({ name: z.string().trim().min(2).max(80) });
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SessionUser = z.infer<typeof sessionSchema>;
