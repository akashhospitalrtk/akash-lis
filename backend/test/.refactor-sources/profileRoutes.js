import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { getDescriptionLibrary } from '../services/descriptionService.js';
import { planParameters, writeParameters } from '../services/catalogueService.js';

const resultKinds = ['NUMERIC', 'TEXT', 'POS_NEG', 'SELECT'];
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{0,39}$/, 'Use 2–40 uppercase letters, numbers or underscores, starting with a letter.');
const optionalText = (max) => z.string().trim().max(max).optional().or(z.literal(''));
const optionalNumber = z.preprocess((value) => value === '' || value === null || value === undefined ? undefined : value, z.coerce.number().finite().optional());
const rangeSchema = z.object({
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

const parameterSchema = z.object({
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

const profileInputSchema = z.object({
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
  const dependencies = new Map();
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
  function hasCycle(code) {
    if (visiting.has(code)) return true;
    if (visited.has(code)) return false;
    visiting.add(code);
    const cycle = (dependencies.get(code) || []).some((dependency) => dependencies.has(dependency) && hasCycle(dependency));
    visiting.delete(code); visited.add(code);
    return cycle;
  }
  if ([...dependencies.keys()].some(hasCycle)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['parameters'], message: 'Calculation formulas cannot form a cycle.' });
});

function normalizedProfile(row, parameters) {
  return { ...row, parameters: parameters.filter((parameter) => parameter.profile_id === row.id) };
}

async function readProfiles({ includeInactive = false, client = pool } = {}) {
  const profiles = (await client.query(`SELECT * FROM test_profiles ${includeInactive ? '' : 'WHERE active = TRUE'} ORDER BY department, name`)).rows;
  const parameters = (await client.query(`SELECT * FROM profile_parameters ${includeInactive ? '' : 'WHERE active = TRUE'} ORDER BY sort_order, name`)).rows;
  return profiles.map((profile) => normalizedProfile(profile, parameters));
}

async function catalogueAudit(client, profileId, userId, eventType, details = {}) {
  await client.query('INSERT INTO catalogue_audit_events (profile_id, user_id, event_type, details) VALUES ($1, $2, $3, $4)', [profileId, userId, eventType, JSON.stringify(details)]);
}

export const profileRoutes = Router();
profileRoutes.get('/catalogue/descriptions', authenticate, allowRoles('ADMIN'), async (_req, res, next) => {
  try { res.json(await getDescriptionLibrary()); } catch (error) { next(error); }
});

// Technicians only see active investigations and parameters for new orders.
profileRoutes.get('/profiles', authenticate, async (_req, res, next) => {
  try { res.json(await readProfiles()); } catch (error) { next(error); }
});

// Full catalogue management is deliberately limited to the laboratory administrator.
profileRoutes.get('/catalogue/profiles', authenticate, allowRoles('ADMIN'), async (_req, res, next) => {
  try { res.json(await readProfiles({ includeInactive: true })); } catch (error) { next(error); }
});

profileRoutes.get('/catalogue/profiles/:id/audit', authenticate, allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT a.*, u.full_name AS user_name FROM catalogue_audit_events a LEFT JOIN users u ON u.id = a.user_id WHERE a.profile_id = $1 ORDER BY a.created_at DESC LIMIT 30`, [req.params.id]);
    res.json(rows);
  } catch (error) { next(error); }
});

profileRoutes.post('/catalogue/profiles', authenticate, allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const payload = profileSchema.parse(req.body);
    const profile = await withTransaction(async (client) => {
      const { rows } = await client.query(`INSERT INTO test_profiles (code, name, department, specimen_type, turnaround_time, instructions, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [payload.code, payload.name, payload.department, payload.specimenType || null, payload.turnaroundTime || null, payload.instructions || null, payload.description ?? null]);
      const plan = planParameters([], payload.parameters);
      await writeParameters(client, rows[0].id, plan);
      await catalogueAudit(client, rows[0].id, req.user.id, 'INVESTIGATION_CREATED', { code: payload.code, parameters: payload.parameters.length });
      return rows[0];
    });
    res.status(201).json((await readProfiles({ includeInactive: true })).find((item) => item.id === profile.id));
  } catch (error) { next(error); }
});

profileRoutes.put('/catalogue/profiles/:id', authenticate, allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const input = profileInputSchema.parse(req.body);
    const profile = await withTransaction(async (client) => {
      const current = (await client.query('SELECT * FROM test_profiles WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!current) throw Object.assign(new Error('Investigation not found.'), { status: 404 });
      const existing = (await client.query('SELECT * FROM profile_parameters WHERE profile_id = $1 FOR UPDATE', [current.id])).rows;
      const plan = planParameters(existing, input.parameters);
      const payload = profileSchema.parse({ ...input, parameters: plan.parameters });
      plan.parameters = payload.parameters.map((parameter, index) => ({ ...parameter, existing: plan.parameters[index].existing }));
      const { rows } = await client.query(`UPDATE test_profiles SET name = $1, department = $2, specimen_type = $3, turnaround_time = $4, instructions = $5, code = $7, description = COALESCE($8, description) WHERE id = $6 RETURNING *`, [payload.name, payload.department, payload.specimenType || null, payload.turnaroundTime || null, payload.instructions || null, current.id, payload.code, payload.description ?? null]);
      await writeParameters(client, current.id, plan);
      await catalogueAudit(client, current.id, req.user.id, 'INVESTIGATION_UPDATED', { previousCode: current.code, code: payload.code, parameterCodeChanges: plan.codeChanges, before: { ...current, parameters: existing }, after: payload });
      return rows[0];
    });
    res.json((await readProfiles({ includeInactive: true })).find((item) => item.id === profile.id));
  } catch (error) { next(error); }
});

profileRoutes.delete('/catalogue/profiles/:id', authenticate, allowRoles('ADMIN'), async (req, res, next) => {
  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query('UPDATE test_profiles SET active = FALSE WHERE id = $1 AND active = TRUE RETURNING id, code', [req.params.id]);
      if (!rows[0]) throw Object.assign(new Error('Active investigation not found.'), { status: 404 });
      await catalogueAudit(client, rows[0].id, req.user.id, 'INVESTIGATION_ARCHIVED', { code: rows[0].code });
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

profileRoutes.post('/catalogue/profiles/:id/restore', authenticate, allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const profile = await withTransaction(async (client) => {
      const { rows } = await client.query('UPDATE test_profiles SET active = TRUE WHERE id = $1 RETURNING *', [req.params.id]);
      if (!rows[0]) throw Object.assign(new Error('Investigation not found.'), { status: 404 });
      await catalogueAudit(client, rows[0].id, req.user.id, 'INVESTIGATION_RESTORED', { code: rows[0].code });
      return rows[0];
    });
    res.json((await readProfiles({ includeInactive: true })).find((item) => item.id === profile.id));
  } catch (error) { next(error); }
});
