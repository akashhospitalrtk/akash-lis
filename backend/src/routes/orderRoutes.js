import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { addAudit, addSystemAudit } from '../services/auditService.js';
import { recalculateOrderTest, refreshOrderStatus, resultFlag, validatedResultValue } from '../services/resultService.js';
import { applyAnalyzerResults } from '../services/analyzerService.js';
import { getOrderDetails, nextAccession } from '../services/orderService.js';

const patientSchema = z.object({
  patientSource: z.enum(['MANUAL', 'HOSPITAL']).default('MANUAL'),
  externalPatientId: z.string().max(120).optional().nullable(),
  uhid: z.string().trim().max(80).optional().nullable(),
  patientName: z.string().trim().min(2).max(160),
  ageYears: z.coerce.number().int().min(0).max(130).optional().nullable(),
  gender: z.enum(['Male', 'Female', 'Other']).optional().nullable(),
  mobile: z.string().trim().max(30).optional().nullable(),
  referringDoctor: z.string().trim().max(160).optional().nullable(),
  patientType: z.string().trim().max(60).optional().nullable(),
  sampleDate: z.string().datetime()
});
const createOrderSchema = patientSchema.extend({ profileIds: z.array(z.string().uuid()).min(1).max(20) });
const resultSchema = z.object({ id: z.string().uuid(), value: z.string().max(200).nullable().optional(), comments: z.string().max(400).nullable().optional() });
const testRemarksSchema = z.object({ id: z.string().uuid(), remarks: z.string().max(2000).nullable().optional() });
const amendmentSchema = z.object({ reason: z.string().trim().min(5, 'Enter a clear amendment reason (at least 5 characters).').max(500) });
const orderIdsSchema = z.object({ orderIds: z.array(z.string().uuid()).min(1).max(100) });
const recordsExportSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid start date.'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid end date.'),
  status: z.enum(['ALL', 'AUTHORIZED']).default('ALL')
}).refine(({ from, to }) => from <= to, { message: 'The end date must not be before the start date.' })
  .refine(({ from, to }) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 <= 30, { message: 'Export up to 31 days at a time to keep records exports safe and fast.' });

function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const separator = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const values = lines.map((line) => line.split(separator).map((part) => part.trim().replace(/^"|"$/g, '')));
  const first = values[0].map((value) => value.toLowerCase());
  const codeIndex = first.findIndex((value) => ['code', 'parameter', 'analyte', 'test'].includes(value));
  const valueIndex = first.findIndex((value) => ['value', 'result', 'result value'].includes(value));
  const rows = codeIndex >= 0 && valueIndex >= 0 ? values.slice(1).map((row) => ({ code: row[codeIndex], value: row[valueIndex] })) : values.map((row) => ({ code: row[0], value: row[1] }));
  return rows.filter((row) => row.code && row.value !== undefined);
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  // Prevent spreadsheet applications from evaluating patient data as a formula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvDocument(columns, rows) {
  return `\uFEFF${[columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export const orderRoutes = Router();

orderRoutes.get('/records/export', authenticate, allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const { from, to, status } = recordsExportSchema.parse(req.query);
    const values = [from, to];
    const statusClause = status === 'AUTHORIZED' ? " AND o.status = 'AUTHORIZED'" : '';
    const { rows } = await pool.query(
      `SELECT o.accession_no, o.patient_name, o.uhid, o.age_years, o.gender, o.mobile, o.patient_type,
        o.sample_date AS registration_at, o.sample_received_at, o.sample_status, o.status AS report_status,
        o.authorized_at, o.delivered_at, ot.profile_code, ot.profile_name, ot.remarks AS test_remarks,
        r.parameter_code, r.parameter_name, r.result_value, r.unit, r.method, r.abnormal_flag, r.comments,
        r.entered_at, entered_by.full_name AS entered_by_name, authorizer.full_name AS authorized_by_name
       FROM lab_orders o
       JOIN order_tests ot ON ot.order_id = o.id
       JOIN test_results r ON r.order_test_id = ot.id
       LEFT JOIN users entered_by ON entered_by.id = r.entered_by
       LEFT JOIN users authorizer ON authorizer.id = o.authorized_by
       WHERE o.sample_date >= $1::date AND o.sample_date < ($2::date + INTERVAL '1 day')${statusClause}
       ORDER BY o.sample_date, o.accession_no, ot.sort_order, r.sort_order`,
      values
    );
    await addSystemAudit(pool, req.user.id, 'RECORDS_EXPORTED', { from, to, status, resultRows: rows.length });
    const columns = ['Accession', 'Patient name', 'UHID', 'Age years', 'Gender', 'Mobile', 'Patient type', 'Registered at', 'Sample received at', 'Sample workflow', 'Report status', 'Authorized at', 'Delivered at', 'Test code', 'Test name', 'Test remarks', 'Parameter code', 'Parameter name', 'Result', 'Unit', 'Method', 'Flag', 'Legacy parameter comments', 'Entered at', 'Entered by', 'Authorized by'];
    const valuesForCsv = rows.map((row) => [row.accession_no, row.patient_name, row.uhid, row.age_years, row.gender, row.mobile, row.patient_type, row.registration_at, row.sample_received_at, row.sample_status, row.report_status, row.authorized_at, row.delivered_at, row.profile_code, row.profile_name, row.test_remarks, row.parameter_code, row.parameter_name, row.result_value, row.unit, row.method, row.abnormal_flag, row.comments, row.entered_at, row.entered_by_name, row.authorized_by_name]);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="lis-records-${from}-to-${to}.csv"`,
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'X-Export-Row-Count': String(rows.length)
    });
    res.send(csvDocument(columns, valuesForCsv));
  } catch (error) { next(error); }
});

orderRoutes.get('/worklist', authenticate, async (req, res, next) => {
  try {
    const date = String(req.query.date || new Date().toISOString().slice(0, 10));
    const status = String(req.query.status || 'ALL');
    const sampleStatus = String(req.query.sampleStatus || 'ALL');
    const query = String(req.query.query || '').trim();
    const clauses = ['o.sample_date::date = $1::date'];
    const values = [date];
    if (status === 'PRINTED') clauses.push('o.printed_at IS NOT NULL');
    else if (['PENDING', 'COMPLETED', 'AUTHORIZED'].includes(status)) { values.push(status); clauses.push(`o.status = $${values.length}`); }
    if (['REGISTERED', 'COLLECTED', 'IN_PROCESS', 'RESULTS_PENDING', 'APPROVED', 'DELIVERED'].includes(sampleStatus)) { values.push(sampleStatus); clauses.push(`o.sample_status = $${values.length}`); }
    if (query) {
      values.push(`%${query}%`);
      clauses.push(`(o.accession_no ILIKE $${values.length} OR o.patient_name ILIKE $${values.length} OR COALESCE(o.uhid, '') ILIKE $${values.length})`);
    }
    const { rows } = await pool.query(
      `SELECT o.*, creator.full_name AS created_by_name, authorizer.full_name AS authorized_by_name,
        (SELECT string_agg(profile_name, ', ' ORDER BY sort_order) FROM order_tests WHERE order_id = o.id) AS tests
       FROM lab_orders o JOIN users creator ON creator.id = o.created_by
       LEFT JOIN users authorizer ON authorizer.id = o.authorized_by
       WHERE ${clauses.join(' AND ')} ORDER BY o.created_at DESC`, values
    );
    res.json(rows);
  } catch (error) { next(error); }
});

orderRoutes.get('/patient-history', authenticate, allowRoles('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const query = String(req.query.query || '').trim();
    if (query.length < 2) return res.json([]);
    const value = `%${query}%`;
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (COALESCE(NULLIF(uhid, ''), NULLIF(mobile, ''), patient_name))
        id, uhid, patient_name AS name, age_years, gender, mobile, referring_doctor, patient_type
       FROM lab_orders
       WHERE uhid ILIKE $1 OR mobile ILIKE $1 OR patient_name ILIKE $1 OR accession_no ILIKE $1
       ORDER BY COALESCE(NULLIF(uhid, ''), NULLIF(mobile, ''), patient_name), created_at DESC
       LIMIT 12`,
      [value]
    );
    res.json(rows);
  } catch (error) { next(error); }
});

orderRoutes.post('/orders/samples/accept', authenticate, allowRoles('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { orderIds } = orderIdsSchema.parse(req.body);
    const accepted = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE lab_orders
         SET sample_status = 'COLLECTED', sample_received_at = NOW(), sample_received_by = $1, updated_at = NOW()
         WHERE id = ANY($2::uuid[]) AND sample_status = 'REGISTERED'
         RETURNING id, accession_no`,
        [req.user.id, orderIds]
      );
      for (const order of rows) await addAudit(client, order.id, req.user.id, 'SAMPLES_ACCEPTED', { accession: order.accession_no, batchSize: rows.length });
      return rows;
    });
    res.json({ accepted: accepted.length, orderIds: accepted.map((order) => order.id) });
  } catch (error) { next(error); }
});

orderRoutes.post('/orders', authenticate, allowRoles('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const payload = createOrderSchema.parse(req.body);
    const order = await withTransaction(async (client) => {
      const profiles = (await client.query('SELECT * FROM test_profiles WHERE active = TRUE AND id = ANY($1::uuid[])', [payload.profileIds])).rows;
      if (profiles.length !== payload.profileIds.length) throw Object.assign(new Error('One or more selected profiles are unavailable.'), { status: 400 });
      const parameters = (await client.query('SELECT * FROM profile_parameters WHERE active = TRUE AND profile_id = ANY($1::uuid[]) ORDER BY sort_order', [payload.profileIds])).rows;
      if (profiles.some((profile) => !parameters.some((parameter) => parameter.profile_id === profile.id))) throw Object.assign(new Error('An investigation must have at least one active parameter before it can be ordered.'), { status: 400 });
      const accession = await nextAccession(client, payload.sampleDate);
      const inserted = await client.query(
        `INSERT INTO lab_orders (accession_no, patient_source, external_patient_id, uhid, patient_name, age_years, gender, mobile, referring_doctor, patient_type, sample_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [accession, payload.patientSource, payload.externalPatientId || null, payload.uhid || null, payload.patientName, payload.ageYears ?? null, payload.gender || null, payload.mobile || null, payload.referringDoctor || null, payload.patientType || null, payload.sampleDate, req.user.id]
      );
      for (let index = 0; index < payload.profileIds.length; index += 1) {
        const profile = profiles.find((item) => item.id === payload.profileIds[index]);
        const test = (await client.query(
          'INSERT INTO order_tests (order_id, profile_id, profile_code, profile_name, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [inserted.rows[0].id, profile.id, profile.code, profile.name, index]
        )).rows[0];
        for (const parameter of parameters.filter((item) => item.profile_id === profile.id)) {
          await client.query(
          `INSERT INTO test_results (order_test_id, parameter_id, parameter_code, parameter_name, result_kind, unit, method, reference_ranges, select_options, common_values, calculation_formula, suggested_value, numeric_step, slider_min, slider_max, critical_low, critical_high, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
            [test.id, parameter.id, parameter.code, parameter.name, parameter.result_kind, parameter.unit, parameter.method, JSON.stringify(parameter.reference_ranges), JSON.stringify(parameter.select_options), JSON.stringify(parameter.common_values || []), parameter.calculation_formula, parameter.suggested_value, parameter.numeric_step, parameter.slider_min, parameter.slider_max, parameter.critical_low, parameter.critical_high, parameter.sort_order]
          );
        }
      }
      await addAudit(client, inserted.rows[0].id, req.user.id, 'ORDER_CREATED', { profileIds: payload.profileIds, source: payload.patientSource });
      return inserted.rows[0];
    });
    res.status(201).json(await getOrderDetails(order.id));
  } catch (error) { next(error); }
});

orderRoutes.get('/orders/:id', authenticate, async (req, res, next) => {
  try {
    const order = await getOrderDetails(req.params.id);
    if (!order) return res.status(404).json({ message: 'Laboratory order not found.' });
    return res.json(order);
  } catch (error) { next(error); }
});

orderRoutes.put('/orders/:id/results', authenticate, allowRoles('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const payload = z.object({ results: z.array(resultSchema).min(1), testRemarks: z.array(testRemarksSchema).max(20).default([]) }).parse(req.body);
    const results = payload.results;
    await withTransaction(async (client) => {
      const order = (await client.query('SELECT * FROM lab_orders WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!order) throw Object.assign(new Error('Laboratory order not found.'), { status: 404 });
      if (order.status === 'AUTHORIZED') throw Object.assign(new Error('Authorized reports cannot be changed.'), { status: 409 });
      if (order.sample_status === 'REGISTERED') throw Object.assign(new Error('Accept the sample before entering results.'), { status: 409 });
      if (!['IN_PROCESS', 'RESULTS_PENDING'].includes(order.sample_status)) throw Object.assign(new Error('Mark the collected sample as in process before entering results.'), { status: 409 });
      const allowed = (await client.query(
        'SELECT r.*, ot.id AS order_test_id FROM test_results r JOIN order_tests ot ON ot.id = r.order_test_id WHERE ot.order_id = $1', [order.id]
      )).rows;
      const byId = new Map(allowed.map((row) => [row.id, row]));
      for (const input of results) {
        if (!byId.has(input.id)) throw Object.assign(new Error('One or more submitted result fields do not belong to this order.'), { status: 400 });
      }
      const allowedTests = (await client.query('SELECT id FROM order_tests WHERE order_id = $1', [order.id])).rows;
      const allowedTestIds = new Set(allowedTests.map((test) => test.id));
      for (const input of payload.testRemarks) {
        if (!allowedTestIds.has(input.id)) throw Object.assign(new Error('One or more submitted remarks do not belong to this order.'), { status: 400 });
        await client.query('UPDATE order_tests SET remarks = $1 WHERE id = $2', [input.remarks?.trim() || null, input.id]);
      }
      const supplied = new Map(results.map((input) => [input.id, input]));
      const missing = allowed.filter((result) => !result.calculation_formula && !String(supplied.has(result.id) ? supplied.get(result.id).value || '' : result.result_value || '').trim());
      if (missing.length) throw Object.assign(new Error(`Please enter a result for ${missing.slice(0, 5).map((result) => result.parameter_name).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}.`), { status: 400 });
      const touchedTests = new Set();
      for (const input of results) {
        const existing = byId.get(input.id);
        if (!existing || existing.calculation_formula) continue;
        const value = validatedResultValue(input.value, existing);
        await client.query(
          `UPDATE test_results SET result_value = $1, comments = $2, abnormal_flag = $3, entered_by = COALESCE(entered_by, $4),
           entered_at = COALESCE(entered_at, NOW()), updated_by = $4, updated_at = NOW() WHERE id = $5`,
          [value, input.comments?.trim() || null, resultFlag(value, existing, order), req.user.id, existing.id]
        );
        touchedTests.add(existing.order_test_id);
      }
      for (const testId of touchedTests) await recalculateOrderTest(client, testId, order, req.user.id);
      await refreshOrderStatus(client, order.id);
      await addAudit(client, order.id, req.user.id, 'RESULTS_SAVED', { changed: results.length, remarksChanged: payload.testRemarks.length, amendmentNo: Number(order.amendment_count || 0) || null });
    });
    res.json(await getOrderDetails(req.params.id));
  } catch (error) { next(error); }
});

orderRoutes.post('/orders/:id/start-processing', authenticate, allowRoles('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    await withTransaction(async (client) => {
      const order = (await client.query('SELECT * FROM lab_orders WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!order) throw Object.assign(new Error('Laboratory order not found.'), { status: 404 });
      if (!['COLLECTED', 'IN_PROCESS'].includes(order.sample_status)) throw Object.assign(new Error('Accept the sample before starting processing.'), { status: 409 });
      if (order.sample_status !== 'IN_PROCESS') {
        await client.query("UPDATE lab_orders SET sample_status = 'IN_PROCESS', updated_at = NOW() WHERE id = $1", [order.id]);
        await addAudit(client, order.id, req.user.id, 'SAMPLE_PROCESSING_STARTED');
      }
    });
    res.json(await getOrderDetails(req.params.id));
  } catch (error) { next(error); }
});

orderRoutes.post('/orders/:id/import-csv', authenticate, allowRoles('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const csv = z.object({ csv: z.string().min(3).max(500000) }).parse(req.body).csv;
    const records = parseCsv(csv);
    if (!records.length) return res.status(400).json({ message: 'No code/value rows were found in the CSV.' });
    const imported = await withTransaction((client) => applyAnalyzerResults(client, req.params.id, records, req.user));
    res.json({ imported, order: await getOrderDetails(req.params.id) });
  } catch (error) { next(error); }
});

orderRoutes.post('/orders/:id/amend', authenticate, allowRoles('ADMIN', 'AUTHORIZER'), async (req, res, next) => {
  try {
    const { reason } = amendmentSchema.parse(req.body);
    await withTransaction(async (client) => {
      const order = (await client.query('SELECT * FROM lab_orders WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!order) throw Object.assign(new Error('Laboratory order not found.'), { status: 404 });
      if (order.status !== 'AUTHORIZED') throw Object.assign(new Error('Only an authorized report can be amended.'), { status: 409 });
      const amendmentNo = Number(order.amendment_count || 0) + 1;
      // Capture the complete authorized version before reopening it. This ensures
      // no correction can overwrite what was previously issued to the patient.
      const snapshot = await getOrderDetails(order.id, client);
      await client.query(
        `INSERT INTO report_amendments (order_id, amendment_no, reason, report_snapshot, started_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, amendmentNo, reason, JSON.stringify(snapshot), req.user.id]
      );
      await client.query(
        `UPDATE lab_orders SET status = 'PENDING', authorized_by = NULL, authorized_at = NULL, printed_at = NULL,
         amendment_count = $1, amended_at = NOW(), amended_by = $2, amendment_reason = $3, updated_at = NOW() WHERE id = $4`,
        [amendmentNo, req.user.id, reason, order.id]
      );
      await client.query("UPDATE order_tests SET status = 'PENDING' WHERE order_id = $1", [order.id]);
      await addAudit(client, order.id, req.user.id, 'REPORT_AMENDMENT_STARTED', { amendmentNo, reason });
    });
    res.json(await getOrderDetails(req.params.id));
  } catch (error) { next(error); }
});

orderRoutes.post('/orders/:id/authorize', authenticate, allowRoles('ADMIN', 'AUTHORIZER'), async (req, res, next) => {
  try {
    await withTransaction(async (client) => {
      const order = (await client.query('SELECT * FROM lab_orders WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!order) throw Object.assign(new Error('Laboratory order not found.'), { status: 404 });
      const { rows: missing } = await client.query(
        `SELECT r.parameter_name FROM test_results r JOIN order_tests ot ON ot.id = r.order_test_id
         WHERE ot.order_id = $1 AND r.calculation_formula IS NULL AND COALESCE(NULLIF(TRIM(r.result_value), ''), '') = ''
         ORDER BY ot.sort_order, r.sort_order LIMIT 6`,
        [order.id]
      );
      if (missing.length) throw Object.assign(new Error(`Please enter a result for ${missing.slice(0, 5).map((result) => result.parameter_name).join(', ')}${missing.length > 5 ? ' and more' : ''} before authorizing.`), { status: 400 });
      if (order.status !== 'COMPLETED') throw Object.assign(new Error('Complete all result fields before authorization.'), { status: 409 });
      await client.query("UPDATE lab_orders SET status = 'AUTHORIZED', sample_status = 'APPROVED', authorized_by = $1, authorized_at = NOW(), updated_at = NOW() WHERE id = $2", [req.user.id, order.id]);
      await client.query("UPDATE order_tests SET status = 'AUTHORIZED' WHERE order_id = $1", [order.id]);
      if (Number(order.amendment_count || 0) > 0) {
        await client.query('UPDATE report_amendments SET reauthorized_by = $1, reauthorized_at = NOW() WHERE order_id = $2 AND amendment_no = $3', [req.user.id, order.id, order.amendment_count]);
        await addAudit(client, order.id, req.user.id, 'AMENDED_REPORT_AUTHORIZED', { amendmentNo: order.amendment_count });
      } else await addAudit(client, order.id, req.user.id, 'REPORT_AUTHORIZED');
    });
    res.json(await getOrderDetails(req.params.id));
  } catch (error) { next(error); }
});

orderRoutes.post('/orders/:id/deliver', authenticate, allowRoles('ADMIN', 'AUTHORIZER'), async (req, res, next) => {
  try {
    await withTransaction(async (client) => {
      const order = (await client.query('SELECT * FROM lab_orders WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!order) throw Object.assign(new Error('Laboratory order not found.'), { status: 404 });
      if (order.status !== 'AUTHORIZED') throw Object.assign(new Error('Only authorized reports can be marked as delivered.'), { status: 409 });
      if (order.sample_status !== 'DELIVERED') {
        await client.query("UPDATE lab_orders SET sample_status = 'DELIVERED', delivered_at = NOW(), delivered_by = $1, updated_at = NOW() WHERE id = $2", [req.user.id, order.id]);
        await addAudit(client, order.id, req.user.id, 'REPORT_DELIVERED');
      }
    });
    res.json(await getOrderDetails(req.params.id));
  } catch (error) { next(error); }
});

orderRoutes.post('/orders/:id/printed', authenticate, allowRoles('ADMIN', 'AUTHORIZER'), async (req, res, next) => {
  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM lab_orders WHERE id = $1 FOR UPDATE', [req.params.id]);
      const order = rows[0];
      if (!order) throw Object.assign(new Error('Laboratory order not found.'), { status: 404 });
      if (order.status !== 'AUTHORIZED') throw Object.assign(new Error('Only authorized reports can be printed.'), { status: 409 });
      await client.query('UPDATE lab_orders SET printed_at = NOW(), updated_at = NOW() WHERE id = $1', [order.id]);
      if (Number(order.amendment_count || 0) > 0) await client.query('UPDATE report_amendments SET printed_at = NOW() WHERE order_id = $1 AND amendment_no = $2', [order.id, order.amendment_count]);
      await addAudit(client, order.id, req.user.id, 'REPORT_PRINTED');
    });
    res.json(await getOrderDetails(req.params.id));
  } catch (error) { next(error); }
});
