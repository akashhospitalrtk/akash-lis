import { z } from 'zod';

export const accountSchema = z.object({
  username: z.string().trim().min(3).max(60),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(['ADMIN', 'TECHNICIAN', 'AUTHORIZER']),
  designation: z.string().trim().max(120).optional().or(z.literal('')),
  signatureLabel: z.string().trim().max(160).optional().or(z.literal(''))
});

export type AccountPayload = z.infer<typeof accountSchema>;

export const bootstrapSchema = accountSchema.omit({ role: true }).transform((input) => ({ ...input, role: 'ADMIN' as const }));
export const loginSchema = z.object({ username: z.string().trim().min(1).max(60), password: z.string().min(1).max(200) });
export const sessionSchema = z.object({ id: z.string().uuid(), role: z.enum(['ADMIN', 'TECHNICIAN', 'AUTHORIZER']), username: z.string().optional(), fullName: z.string().optional(), designation: z.string().nullable().optional() });
export type LoginInput = z.infer<typeof loginSchema>;
export type SessionUser = z.infer<typeof sessionSchema>;
