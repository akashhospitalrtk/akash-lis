import { z } from 'zod';

export const idParamsSchema = z.object({ id: z.string().uuid('Use a valid record ID.') });
export const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
export const optionalNumber = z.preprocess((value) => value === '' || value == null ? undefined : value, z.coerce.number().finite().optional());
export const searchSchema = z.object({ query: z.string().trim().max(160).default('') });
export type SearchInput = z.infer<typeof searchSchema>;
