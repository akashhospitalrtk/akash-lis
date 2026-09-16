import { z } from 'zod';
import { optionalText, optionalNumber } from './commonSchemas.js';

const resultKinds = ['NUMERIC', 'TEXT', 'POS_NEG', 'SELECT'] as const;
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{0,39}$/, 'Use 2–40 uppercase letters, numbers or underscores, starting with a letter.');
export const rangeSchema = z.object({
  label: optionalText(80),
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  ageUnit: z.enum(['days', 'weeks', 'months', 'years']).default('years'),
  ageMin: z.coerce.number().finite().min(0).max(47483).optional(),
  ageMax: z.coerce.number().finite().min(0).max(47483).optional(),
  low: z.coerce.number().finite().optional(),
  high: z.coerce.number().finite().optional()
}).superRefine((range, context) => {
  if (range.low === undefined && range.high === undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ['low'], message: 'Enter at least one approved reference limit, or remove this empty range.' });
  if (range.ageMin !== undefined && range.ageMax !== undefined && range.ageMin > range.ageMax) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Minimum age cannot exceed maximum age.' });
  if (range.low !== undefined && range.high !== undefined && range.low > range.high) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Low reference limit cannot exceed high limit.' });
});

export const parameterSchema = z.object({
  id: z.string().uuid().optional(),
  loincCode: z.string().trim().regex(/^([0-9]{1,7}-[0-9])?$/, 'Use a LOINC code such as 2160-0, or leave blank.').optional(),
  referenceNote: optionalText(2000),
  code: codeSchema,
  name: z.string().trim().min(2).max(160),
  description: optionalText(5000),
  resultKind: z.enum(resultKinds),
  unit: optionalText(40),
  method: optionalText(240),
  referenceRanges: z.array(rangeSchema).max(20).default([]),
  selectOptions: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  commonValues: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  calculationFormula: optionalText(300),
  suggestedValue: optionalText(200),
  numericStep: optionalNumber,
  sliderMin: optionalNumber,
  sliderMax: optionalNumber,
  criticalLow: optionalNumber,
  criticalHigh: optionalNumber,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.boolean().optional().default(true)
});

export const profileInputSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2).max(160),
  description: optionalText(5000),
  department: z.string().trim().max(80).default('Laboratory').transform((value) => value || 'Laboratory'),
  specimenType: optionalText(80),
  turnaroundTime: optionalText(80),
  instructions: optionalText(500),
  parameters: z.array(parameterSchema).min(1).max(100)
});

export const profileSchema = profileInputSchema.superRefine((profile, context) => {
  const seen = new Set();
  const seenIds = new Set();
  for (const [index, parameter] of profile.parameters.entries()) {
    if (seen.has(parameter.code)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'code'], message: 'Each parameter code must be unique within this investigation.' });
    seen.add(parameter.code);
    if (parameter.id && seenIds.has(parameter.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'The same parameter cannot appear twice.' });
    if (parameter.id) seenIds.add(parameter.id);
    if (parameter.resultKind === 'NUMERIC' && parameter.selectOptions.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'selectOptions'], message: 'Numeric parameters cannot have select options.' });
    if ((parameter.resultKind === 'SELECT' || parameter.resultKind === 'POS_NEG') && parameter.selectOptions.length < 1) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'selectOptions'], message: 'Choose at least one allowed result value.' });
    if (!['NUMERIC', 'TEXT'].includes(parameter.resultKind) && parameter.commonValues.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'commonValues'], message: 'Common quick values are only supported for numeric and free-text parameters. Select results already use their allowed-options dropdown.' });
    if (new Set(parameter.commonValues.map((value) => value.toLocaleLowerCase())).size !== parameter.commonValues.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'commonValues'], message: 'Common quick values must not contain duplicates.' });
    if (parameter.resultKind === 'NUMERIC' && parameter.commonValues.some((value) => !Number.isFinite(Number(value)))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'commonValues'], message: 'Every common quick value must be numeric for a numeric parameter.' });
    if ((parameter.resultKind === 'TEXT' || parameter.resultKind === 'SELECT' || parameter.resultKind === 'POS_NEG') && parameter.calculationFormula) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'calculationFormula'], message: 'Only numeric parameters can use a calculation formula.' });
    if (parameter.resultKind !== 'NUMERIC' && parameter.referenceRanges.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'referenceRanges'], message: 'Reference limits are only supported for numeric parameters.' });
    if (parameter.resultKind !== 'NUMERIC' && (parameter.numericStep !== undefined || parameter.sliderMin !== undefined || parameter.sliderMax !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index], message: 'Step controls and sliders are only supported for numeric parameters.' });
    if (parameter.resultKind !== 'NUMERIC' && (parameter.criticalLow !== undefined || parameter.criticalHigh !== undefined)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index], message: 'Critical limits are only supported for numeric parameters.' });
    if (parameter.criticalLow !== undefined && parameter.criticalHigh !== undefined && parameter.criticalLow >= parameter.criticalHigh) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'criticalHigh'], message: 'Critical high limit must be greater than critical low limit.' });
    if (parameter.numericStep !== undefined && parameter.numericStep <= 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'numericStep'], message: 'Numeric step must be greater than zero.' });
    if ((parameter.sliderMin === undefined) !== (parameter.sliderMax === undefined)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'sliderMin'], message: 'Enter both slider minimum and maximum, or leave both blank.' });
    if (parameter.sliderMin !== undefined && parameter.sliderMax !== undefined && parameter.sliderMin >= parameter.sliderMax) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'sliderMax'], message: 'Slider maximum must be greater than slider minimum.' });
    if (parameter.suggestedValue) {
      if (parameter.calculationFormula) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'suggestedValue'], message: 'Calculated values cannot have a suggested value.' });
      if (parameter.resultKind === 'NUMERIC' && !Number.isFinite(Number(parameter.suggestedValue))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'suggestedValue'], message: 'Suggested value must be numeric for a numeric parameter.' });
      if ((parameter.resultKind === 'SELECT' || parameter.resultKind === 'POS_NEG') && !parameter.selectOptions.includes(parameter.suggestedValue)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'suggestedValue'], message: 'Suggested value must be one of the allowed result options.' });
      if (parameter.resultKind === 'NUMERIC' && parameter.sliderMin !== undefined && parameter.sliderMax !== undefined && (Number(parameter.suggestedValue) < parameter.sliderMin || Number(parameter.suggestedValue) > parameter.sliderMax)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'suggestedValue'], message: 'Suggested value must be inside the configured slider range.' });
    }
    if (parameter.calculationFormula && parameter.commonValues.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'commonValues'], message: 'Calculated values cannot have common quick values.' });
  }
  if (!profile.parameters.some((parameter) => parameter.active)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters'], message: 'Keep at least one active parameter in an investigation.' });
  const dependencies = new Map<string, string[]>();
  for (const [index, parameter] of profile.parameters.entries()) {
    const formula = parameter.calculationFormula;
    if (!formula) continue;
    if (!/^[A-Z0-9_+\-*/().\s]+$/.test(formula)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'calculationFormula'], message: 'Formula may contain only parameter codes, numbers, parentheses and + - * /.' });
      continue;
    }
    const codes = [...new Set(formula.match(/\b[A-Z][A-Z0-9_]*\b/g) || [])];
    if (!codes.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'calculationFormula'], message: 'Formula must reference at least one parameter code.' });
    const unknown = codes.find((code) => !profile.parameters.some((p) => p.code === code && p.active && p.resultKind === 'NUMERIC') || code === parameter.code);
    if (unknown) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters', index, 'calculationFormula'], message: `Formula references an unknown or same parameter: ${unknown}.` });
    dependencies.set(parameter.code, codes);
  }
  const visiting = new Set(); const visited = new Set();
  function hasCycle(code: string): boolean {
    if (visiting.has(code)) return true;
    if (visited.has(code)) return false;
    visiting.add(code);
    const cycle = (dependencies.get(code) || []).some((dependency) => dependencies.has(dependency) && hasCycle(dependency));
    visiting.delete(code); visited.add(code);
    return cycle;
  }
  if ([...dependencies.keys()].some(hasCycle)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters'], message: 'Calculation formulas cannot form a cycle.' });
});

export const permanentDeleteProfileSchema = z.object({
  confirmationCode: codeSchema,
  reason: z.string().trim().min(5, 'Explain why this investigation should be deleted (at least 5 characters).').max(500)
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type PermanentDeleteProfileInput = z.infer<typeof permanentDeleteProfileSchema>;
export type ParameterInput = z.infer<typeof parameterSchema>;
export type ReferenceRange = z.infer<typeof rangeSchema>;
