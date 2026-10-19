import { z } from 'zod';

export const clinicalSearchSchema = z.object({
  query: z.string().trim().max(160).default(''),
  status: z.enum(['ALL', 'PENDING', 'COMPLETED', 'AUTHORIZED']).default('ALL'),
  page: z.coerce.number().int().min(1).max(100000).default(1)
});
export const clinicalNoteSchema = z.object({ body: z.string().trim().min(1).max(5000) });
export type ClinicalSearchInput = z.infer<typeof clinicalSearchSchema>;
export type ClinicalNoteInput = z.infer<typeof clinicalNoteSchema>;
