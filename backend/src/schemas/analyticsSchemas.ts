import { z } from 'zod';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date.').refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Choose a valid date.');

export const dashboardQuerySchema = z.object({ from: dateOnly, to: dateOnly })
  .refine(({ from, to }) => from <= to, { message: 'The end date must not be before the start date.' })
  .refine(({ from, to }) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 <= 365,
    { message: 'Choose a date range of up to 366 days.' });

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
