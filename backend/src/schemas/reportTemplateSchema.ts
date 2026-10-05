import { z } from 'zod';
import defaults from '../config/reportTemplate.defaults.json' with { type: 'json' };

const label = z.string().trim().min(1).max(24);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour.');
export const reportTemplateSchema = z.object({
  brandName: z.string().trim().min(1).max(24), subtitle: z.string().trim().max(40),
  address: z.string().trim().max(160), phone: z.string().trim().max(30), locationLine: z.string().trim().max(45),
  bandColor: color, bandTextColor: color, helplineColor: color,
  footerBandColor: color, footerBandTextColor: color, footerTextColor: color,
  headerAlignment: z.enum(['left', 'center', 'right']), footerAlignment: z.enum(['left', 'center', 'right']),
  headerContactAlignment: z.enum(['left', 'center', 'right']).default('right'),
  footerContactAlignment: z.enum(['left', 'center', 'right']).default('right'),
  headerGapMm: z.number().min(3).max(12).default(6), footerGapMm: z.number().min(3).max(12).default(4),
  brandFontPt: z.number().min(24).max(80), subtitleFontPt: z.number().min(10).max(30), contactFontPt: z.number().min(8).max(18),
  footerFontPt: z.number().min(6).max(12), disclaimerFontPt: z.number().min(6).max(11), helplineFontPt: z.number().min(8).max(18),
  headerHeightMm: z.number().min(32).max(45), footerHeightMm: z.number().min(32).max(45),
  bodyFontPt: z.number().min(8).max(11), watermarkOpacity: z.number().min(0).max(.12),
  patientLayout: z.enum(['three-column', 'bordered', 'minimal']),
  patientLabelWeight: z.enum(['normal', 'bold']).default('bold'), patientValueWeight: z.enum(['normal', 'bold']).default('normal'),
  dateStyle: z.enum(['date', 'date-time']),
  showSampleDates: z.boolean(), showBadge: z.boolean(),
  supportLine: z.string().trim().max(100), servicesLine: z.string().trim().max(180), facilitiesLine: z.string().trim().max(120),
  disclaimerLines: z.array(z.string().trim().max(180)).length(3),
  labels: z.object({ name: label, ageGender: label, referringDoctor: label, mobile: label, patientType: label,
    uhid: label, accession: label, registered: label, reported: label, collected: label, received: label }).strict()
}).strict();
export type ReportTemplate = z.infer<typeof reportTemplateSchema>;
export const defaultReportTemplate = reportTemplateSchema.parse(defaults);
export const saveReportTemplateSchema = z.object({ template: reportTemplateSchema, expectedRevision: z.number().int().nonnegative() }).strict();
