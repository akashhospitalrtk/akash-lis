import { pool, withTransaction } from '../database/pool.js';
import { AppError } from '../core/AppError.js';
import { addAudit, addSystemAudit } from './auditService.js';
import { recalculateOrderTest, refreshOrderStatus, resultFlag, validatedResultValue } from './resultService.js';
import { applyAnalyzerResults } from './analyzerService.js';
import { getOrderDetails, nextAccession } from './orderService.js';
import { prepareForEntry } from './sampleService.js';
import { lockOrder, addOrderTest, changeOrderTests, refreshReferences, deleteReport } from './orderRevisionService.js';
import { parseCsv, csvDocument } from '../utils/csv.js';
import type { SearchInput } from '../schemas/commonSchemas.js';
import type { SessionUser } from '../schemas/authSchemas.js';
import type { CreateOrderInput, SaveResultsInput, AmendmentInput, OrderIdsInput, RecordsExportInput, CsvImportInput, ChangeTestsInput, WorklistInput } from '../schemas/orderSchemas.js';

export async function exportRecords(input: RecordsExportInput, user: SessionUser) {
  const { from, to, status } = input;
  const values = [from, to];
  const statusClause = status === 'AUTHORIZED' ? " AND o.status = 'AUTHORIZED'" : '';
  const { rows } = await pool.query(
    `SELECT o.accession_no, o.patient_name, o.uhid, o.age_years, o.age_value, o.age_unit, o.gender, o.mobile, o.patient_type,
      o.sample_date AS registration_at, o.sample_received_at, o.sample_status, o.status AS report_status,
      o.authorized_at, o.delivered_at, ot.profile_code, ot.profile_name, ot.remarks AS test_remarks,
      r.parameter_code, r.parameter_name, r.result_value, r.unit, r.method, r.abnormal_flag, r.comments,
      r.entered_at, entered_by.full_name AS entered_by_name, authorizer.full_name AS authorized_by_name
     FROM lab_orders o
     JOIN order_tests ot ON ot.order_id = o.id
     JOIN test_results r ON r.order_test_id = ot.id
     LEFT JOIN users entered_by ON entered_by.id = r.entered_by
     LEFT JOIN users authorizer ON authorizer.id = o.authorized_by
     WHERE o.deleted_at IS NULL AND o.sample_date >= $1::date AND o.sample_date < ($2::date + INTERVAL '1 day')${statusClause}
     ORDER BY o.sample_date, o.accession_no, ot.sort_order, r.sort_order`,
    values
  );
  await addSystemAudit(pool, user.id, 'RECORDS_EXPORTED', { from, to, status, resultRows: rows.length });
  const columns = ['Accession', 'Patient name', 'UHID', 'Age years', 'Age value', 'Age unit', 'Gender', 'Mobile', 'Patient type', 'Registered at', 'Sample received at', 'Sample workflow', 'Report status', 'Authorized at', 'Delivered at', 'Test code', 'Test name', 'Test remarks', 'Parameter code', 'Parameter name', 'Result', 'Unit', 'Method', 'Flag', 'Legacy parameter comments', 'Entered at', 'Entered by', 'Authorized by'];
  const valuesForCsv = rows.map((row) => [row.accession_no, row.patient_name, row.uhid, row.age_years, row.age_value ?? row.age_years, row.age_unit, row.gender, row.mobile, row.patient_type, row.registration_at, row.sample_received_at, row.sample_status, row.report_status, row.authorized_at, row.delivered_at, row.profile_code, row.profile_name, row.test_remarks, row.parameter_code, row.parameter_name, row.result_value, row.unit, row.method, row.abnormal_flag, row.comments, row.entered_at, row.entered_by_name, row.authorized_by_name]);
  return { content: csvDocument(columns, valuesForCsv), filename: `lis-records-${from}-to-${to}.csv`, rowCount: rows.length };
}

export async function listWorklist(input: WorklistInput) {
  const date = input.date;
  const status = input.status;
  const sampleStatus = input.sampleStatus;
  const query = input.query;
  const clauses = ['o.sample_date::date = $1::date', 'o.deleted_at IS NULL'];
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
  return rows;
}

export async function patientHistory(input: SearchInput) {
  const query = input.query;
  if (query.length < 2) return [];
  const value = `%${query}%`;
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (COALESCE(NULLIF(uhid, ''), NULLIF(mobile, ''), patient_name))
      id, uhid, patient_name AS name, age_years, age_value, age_unit, gender, mobile, referring_doctor, patient_type
     FROM lab_orders
     WHERE deleted_at IS NULL AND (uhid ILIKE $1 OR mobile ILIKE $1 OR patient_name ILIKE $1 OR accession_no ILIKE $1)
     ORDER BY COALESCE(NULLIF(uhid, ''), NULLIF(mobile, ''), patient_name), created_at DESC
     LIMIT 12`,
    [value]
  );
  return rows;
}

export async function acceptSamples(input: OrderIdsInput, user: SessionUser) {
  const { orderIds } = input;
  const accepted = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE lab_orders
       SET sample_status = 'COLLECTED', sample_received_at = NOW(), sample_received_by = $1, updated_at = NOW()
       WHERE deleted_at IS NULL AND id = ANY($2::uuid[]) AND sample_status = 'REGISTERED'
       RETURNING id, accession_no`,
      [user.id, orderIds]
    );
    for (const order of rows) await addAudit(client, order.id, user.id, 'SAMPLES_ACCEPTED', { accession: order.accession_no, batchSize: rows.length });
    return rows;
  });
  return { accepted: accepted.length, orderIds: accepted.map((order) => order.id) };
}

export async function createOrder(input: CreateOrderInput, user: SessionUser) {
  const payload = input;
  const ageValue = payload.ageValue ?? payload.ageYears ?? null;
  const ageUnit = payload.ageValue != null ? payload.ageUnit : 'years';
  const ageDays = ageValue == null ? null : ageValue * ({ days: 1, weeks: 7, months: 365.25 / 12, years: 365.25 })[ageUnit];
  if (ageDays !== null && ageDays > 130 * 365.25) throw new AppError('Age must not exceed 130 years.', 400);
  const order = await withTransaction(async (client) => {
    const accession = await nextAccession(client, payload.sampleDate);
    const inserted = await client.query(
      `INSERT INTO lab_orders (accession_no, patient_source, external_patient_id, uhid, patient_name, age_years, gender, mobile, referring_doctor, patient_type, sample_date, created_by, age_value, age_unit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [accession, payload.patientSource, payload.externalPatientId || null, payload.uhid || null, payload.patientName, ageDays == null ? null : Math.floor(ageDays / 365.25), payload.gender || null, payload.mobile || null, payload.referringDoctor || null, payload.patientType || null, payload.sampleDate, user.id, ageValue, ageUnit]
    );
    for (const [index, profileId] of payload.profileIds.entries()) {
      await addOrderTest(client, inserted.rows[0].id, profileId, index);
    }
    await addAudit(client, inserted.rows[0].id, user.id, 'ORDER_CREATED', { profileIds: payload.profileIds, source: payload.patientSource });
    if (payload.entryMode === 'RESULTS') await prepareForEntry(client, inserted.rows[0].id, user.id);
    return inserted.rows[0];
  });
  return await getOrderDetails(order.id);
}

export async function getOrder(orderId: string) {
  const order = await getOrderDetails(orderId);
  if (!order) throw new AppError('Laboratory order not found.', 404);
  return order;
}

export async function saveResults(input: SaveResultsInput, orderId: string, user: SessionUser) {
  const payload = input;
  const results = payload.results;
  await withTransaction(async (client) => {
    const order = await lockOrder(client, orderId, false);
    if (order.status === 'AUTHORIZED') throw new AppError('Authorized reports cannot be changed.', 409);
    if (order.sample_status === 'REGISTERED') throw new AppError('Accept the sample before entering results.', 409);
    if (!['IN_PROCESS', 'RESULTS_PENDING'].includes(order.sample_status)) throw new AppError('Mark the collected sample as in process before entering results.', 409);
    const allowed = (await client.query(
      'SELECT r.*, ot.id AS order_test_id FROM test_results r JOIN order_tests ot ON ot.id = r.order_test_id WHERE ot.order_id = $1', [order.id]
    )).rows;
    const byId = new Map(allowed.map((row) => [row.id, row]));
    for (const input of results) {
      if (!byId.has(input.id)) throw new AppError('One or more submitted result fields do not belong to this order.', 400);
    }
    const allowedTests = (await client.query('SELECT id FROM order_tests WHERE order_id = $1', [order.id])).rows;
    const allowedTestIds = new Set(allowedTests.map((test) => test.id));
    for (const input of payload.testRemarks) {
      if (!allowedTestIds.has(input.id)) throw new AppError('One or more submitted remarks do not belong to this order.', 400);
      await client.query('UPDATE order_tests SET remarks = $1 WHERE id = $2', [input.remarks?.trim() || null, input.id]);
    }
    const supplied = new Map(results.map((input) => [input.id, input]));
    const missing = allowed.filter((result) => !result.calculation_formula && !String(supplied.has(result.id) ? supplied.get(result.id)?.value || '' : result.result_value || '').trim());
    if (missing.length) throw new AppError(`Please enter a result for ${missing.slice(0, 5).map((result) => result.parameter_name).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}.`, 400);
    const touchedTests = new Set<string>();
    for (const input of results) {
      const existing = byId.get(input.id);
      if (!existing || existing.calculation_formula) continue;
      const value = validatedResultValue(input.value, existing);
      await client.query(
        `UPDATE test_results SET result_value = $1, comments = $2, abnormal_flag = $3, entered_by = COALESCE(entered_by, $4),
         entered_at = COALESCE(entered_at, NOW()), updated_by = $4, updated_at = NOW() WHERE id = $5`,
        [value, input.comments?.trim() || null, resultFlag(value, existing, order), user.id, existing.id]
      );
      touchedTests.add(existing.order_test_id);
    }
    for (const testId of touchedTests) await recalculateOrderTest(client, testId, order, user.id);
    await refreshOrderStatus(client, order.id);
    await addAudit(client, order.id, user.id, 'RESULTS_SAVED', { changed: results.length, remarksChanged: payload.testRemarks.length, amendmentNo: Number(order.amendment_count || 0) || null });
  });
  return await getOrderDetails(orderId);
}

export async function startProcessing(orderId: string, user: SessionUser) {
  await withTransaction(async (client) => {
    const order = await lockOrder(client, orderId, false);
    if (!['COLLECTED', 'IN_PROCESS'].includes(order.sample_status)) throw new AppError('Accept the sample before starting processing.', 409);
    if (order.sample_status !== 'IN_PROCESS') {
      await client.query("UPDATE lab_orders SET sample_status = 'IN_PROCESS', updated_at = NOW() WHERE id = $1", [order.id]);
      await addAudit(client, order.id, user.id, 'SAMPLE_PROCESSING_STARTED');
    }
  });
  return await getOrderDetails(orderId);
}

export async function importCsv(input: CsvImportInput, orderId: string, user: SessionUser) {
  const csv = input.csv;
  const records = parseCsv(csv);
  if (!records.length) throw new AppError('No code/value rows were found in the CSV.', 400);
  const imported = await withTransaction((client) => applyAnalyzerResults(client, orderId, records, user));
  return { imported, order: await getOrderDetails(orderId) };
}

export async function amendReport(input: AmendmentInput, orderId: string, user: SessionUser) {
  const { reason } = input;
  await withTransaction(async (client) => {
    const order = await lockOrder(client, orderId, false);
    if (order.status !== 'AUTHORIZED') throw new AppError('Only an authorized report can be amended.', 409);
    const amendmentNo = Number(order.amendment_count || 0) + 1;
    // Capture the complete authorized version before reopening it. This ensures
    // no correction can overwrite what was previously issued to the patient.
    const snapshot = await getOrderDetails(order.id, client);
    await client.query(
      `INSERT INTO report_amendments (order_id, amendment_no, reason, report_snapshot, started_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [order.id, amendmentNo, reason, JSON.stringify(snapshot), user.id]
    );
    await client.query(
      `UPDATE lab_orders SET status = 'PENDING', sample_status = 'IN_PROCESS', delivered_at = NULL, delivered_by = NULL, authorized_by = NULL, authorized_at = NULL, printed_at = NULL,
       amendment_count = $1, amended_at = NOW(), amended_by = $2, amendment_reason = $3, updated_at = NOW() WHERE id = $4`,
      [amendmentNo, user.id, reason, order.id]
    );
    await client.query("UPDATE order_tests SET status = 'PENDING' WHERE order_id = $1", [order.id]);
    await addAudit(client, order.id, user.id, 'REPORT_AMENDMENT_STARTED', { amendmentNo, reason });
  });
  return await getOrderDetails(orderId);
}

export async function authorizeReport(orderId: string, user: SessionUser) {
  await withTransaction(async (client) => {
    const order = await lockOrder(client, orderId, false);
    const { rows: missing } = await client.query(
      `SELECT r.parameter_name FROM test_results r JOIN order_tests ot ON ot.id = r.order_test_id
       WHERE ot.order_id = $1 AND r.calculation_formula IS NULL AND COALESCE(NULLIF(TRIM(r.result_value), ''), '') = ''
       ORDER BY ot.sort_order, r.sort_order LIMIT 6`,
      [order.id]
    );
    if (missing.length) throw new AppError(`Please enter a result for ${missing.slice(0, 5).map((result) => result.parameter_name).join(', ')}${missing.length > 5 ? ' and more' : ''} before authorizing.`, 400);
    if (order.status !== 'COMPLETED') throw new AppError('Complete all result fields before authorization.', 409);
    await client.query("UPDATE lab_orders SET status = 'AUTHORIZED', sample_status = 'APPROVED', authorized_by = $1, authorized_at = NOW(), updated_at = NOW() WHERE id = $2", [user.id, order.id]);
    await client.query("UPDATE order_tests SET status = 'AUTHORIZED' WHERE order_id = $1", [order.id]);
    if (Number(order.amendment_count || 0) > 0) {
      await client.query('UPDATE report_amendments SET reauthorized_by = $1, reauthorized_at = NOW() WHERE order_id = $2 AND amendment_no = $3', [user.id, order.id, order.amendment_count]);
      await addAudit(client, order.id, user.id, 'AMENDED_REPORT_AUTHORIZED', { amendmentNo: order.amendment_count });
    } else await addAudit(client, order.id, user.id, 'REPORT_AUTHORIZED');
  });
  return await getOrderDetails(orderId);
}

export async function deliverReport(orderId: string, user: SessionUser) {
  await withTransaction(async (client) => {
    const order = await lockOrder(client, orderId, false);
    if (order.status !== 'AUTHORIZED') throw new AppError('Only authorized reports can be marked as delivered.', 409);
    if (order.sample_status !== 'DELIVERED') {
      await client.query("UPDATE lab_orders SET sample_status = 'DELIVERED', delivered_at = NOW(), delivered_by = $1, updated_at = NOW() WHERE id = $2", [user.id, order.id]);
      await addAudit(client, order.id, user.id, 'REPORT_DELIVERED');
    }
  });
  return await getOrderDetails(orderId);
}

export async function markPrinted(orderId: string, user: SessionUser) {
  await withTransaction(async (client) => {
    const order = await lockOrder(client, orderId, false);
    if (order.status !== 'AUTHORIZED') throw new AppError('Only authorized reports can be printed.', 409);
    await client.query('UPDATE lab_orders SET printed_at = NOW(), updated_at = NOW() WHERE id = $1', [order.id]);
    if (Number(order.amendment_count || 0) > 0) await client.query('UPDATE report_amendments SET printed_at = NOW() WHERE order_id = $1 AND amendment_no = $2', [order.id, order.amendment_count]);
    await addAudit(client, order.id, user.id, 'REPORT_PRINTED');
  });
  return await getOrderDetails(orderId);
}

export async function changeTests(input: ChangeTestsInput, orderId: string, user: SessionUser) {
  const payload = input;
  await withTransaction((client) => changeOrderTests(client, orderId, payload.profileIds, payload.reason, user.id));
  return await getOrderDetails(orderId);
}

export async function refreshOrderReferences(input: AmendmentInput, orderId: string, user: SessionUser) {
  const { reason } = input;
  await withTransaction((client) => refreshReferences(client, orderId, reason, user.id));
  return await getOrderDetails(orderId);
}

export async function removeReport(input: AmendmentInput, orderId: string, user: SessionUser) {
  const { reason } = input;
  await withTransaction((client) => deleteReport(client, orderId, reason, user.id));
  return;
}

export async function prepareEntry(orderId: string, user: SessionUser) {
  await withTransaction((client) => prepareForEntry(client, orderId, user.id));
  return getOrderDetails(orderId);
}
