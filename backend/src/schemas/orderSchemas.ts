import { z } from 'zod';

export const patientSchema = z.object({
  patientSource: z.enum(['MANUAL', 'HOSPITAL']).default('MANUAL'),
  externalPatientId: z.string().max(120).optional().nullable(),
  uhid: z.string().trim().max(80).optional().nullable(),
  patientName: z.string().trim().min(2).max(160),
  ageValue: z.number().finite().min(0).max(47483).optional().nullable(),
  ageUnit: z.enum(['days', 'weeks', 'months', 'years']).default('years'),
  ageYears: z.coerce.number().int().min(0).max(130).optional().nullable(),
  gender: z.enum(['Male', 'Female', 'Other']).optional().nullable(),
  mobile: z.string().trim().max(30).optional().nullable(),
  referringDoctor: z.string().trim().max(160).optional().nullable(),
  patientType: z.string().trim().max(60).optional().nullable(),
  sampleDate: z.string().datetime()
});
export const createOrderSchema = patientSchema.extend({ entryMode: z.enum(['SAMPLE', 'RESULTS']).default('SAMPLE'), profileIds: z.array(z.string().uuid()).min(1).max(20).refine((ids) => new Set(ids).size === ids.length, 'Choose each investigation once.') });
export const resultSchema = z.object({ id: z.string().uuid(), value: z.string().max(200).nullable().optional(), comments: z.string().max(400).nullable().optional() });
export const testRemarksSchema = z.object({ id: z.string().uuid(), remarks: z.string().max(2000).nullable().optional() });
export const amendmentSchema = z.object({ reason: z.string().trim().min(5, 'Enter a clear amendment reason (at least 5 characters).').max(500) });
export const updatePatientSchema = patientSchema.pick({
  patientName: true, uhid: true, gender: true, mobile: true, referringDoctor: true, patientType: true
}).extend({
  ageValue: z.number().finite().min(0).nullable(),
  ageUnit: z.enum(['days', 'weeks', 'months', 'years']),
  reason: amendmentSchema.shape.reason,
  expectedUpdatedAt: z.string().datetime()
}).strict().refine(({ ageValue, ageUnit }) => ageValue === null || ageValue * ({ days: 1, weeks: 7, months: 365.25 / 12, years: 365.25 }[ageUnit]) <= 130 * 365.25,
  { path: ['ageValue'], message: 'Age must not exceed 130 years in the selected unit.' });
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export const deleteReportSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  password: z.string().max(200).optional()
}).default({});
export type DeleteReportInput = z.infer<typeof deleteReportSchema>;
export const orderIdsSchema = z.object({ orderIds: z.array(z.string().uuid()).min(1).max(100) });
export const recordsExportSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid start date.'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid end date.'),
  status: z.enum(['ALL', 'AUTHORIZED']).default('ALL')
}).refine(({ from, to }) => from <= to, { message: 'The end date must not be before the start date.' })
  .refine(({ from, to }) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 <= 30, { message: 'Export up to 31 days at a time to keep records exports safe and fast.' });

export const saveResultsSchema = z.object({ results: z.array(resultSchema).min(1), testRemarks: z.array(testRemarksSchema).max(20).default([]) });
export const csvImportSchema = z.object({ csv: z.string().min(3).max(500000) });
export const changeTestsSchema = amendmentSchema.extend({ profileIds: z.array(z.string().uuid()).min(1).max(20).refine((ids) => new Set(ids).size === ids.length, 'Choose each investigation once.') });
export const worklistSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(() => new Date().toISOString().slice(0, 10)),
  status: z.enum(['ALL', 'PRINTED', 'PENDING', 'COMPLETED', 'AUTHORIZED']).default('ALL'),
  sampleStatus: z.enum(['ALL', 'REGISTERED', 'COLLECTED', 'IN_PROCESS', 'RESULTS_PENDING', 'APPROVED', 'DELIVERED']).default('ALL'),
  query: z.string().trim().max(160).default('')
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type SaveResultsInput = z.infer<typeof saveResultsSchema>;
export type AmendmentInput = z.infer<typeof amendmentSchema>;
export type OrderIdsInput = z.infer<typeof orderIdsSchema>;
export type RecordsExportInput = z.infer<typeof recordsExportSchema>;
export type CsvImportInput = z.infer<typeof csvImportSchema>;
export type ChangeTestsInput = z.infer<typeof changeTestsSchema>;
export type WorklistInput = z.infer<typeof worklistSchema>;
