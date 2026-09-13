import { z } from 'zod';

export const externalPatientSearchSchema = z.object({ query: z.string().trim().min(2, 'Enter at least two characters to search.').max(160) });
export type ExternalPatientSearchInput = z.infer<typeof externalPatientSearchSchema>;
