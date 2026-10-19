import { z } from 'zod';

const noteSchema = z.object({ text: z.string(), sources: z.array(z.string()).default([]) }).passthrough();
export const descriptionLibrarySchema = z.object({
  version: z.union([z.string(), z.number()]),
  profiles: z.record(noteSchema),
  parameters: z.record(noteSchema)
}).passthrough();
