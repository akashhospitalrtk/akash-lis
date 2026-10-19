import { z } from 'zod';

export const externalPatientSearchSchema = z.object({
  query: z.string().trim().min(1, 'Enter a character to search.').max(160),
  limit: z.coerce.number().int().min(1).max(20).default(20),
  match: z.enum(['exact', 'prefix']).default('exact')
});
export type ExternalPatientSearchInput = z.infer<typeof externalPatientSearchSchema>;

export const patientHistorySearchSchema = z.object({
  query: z.string().trim().max(160).default(''),
  limit: z.coerce.number().int().min(1).max(20).default(12),
  match: z.enum(['contains', 'prefix']).default('contains')
});
export type PatientHistorySearchInput = z.infer<typeof patientHistorySearchSchema>;
