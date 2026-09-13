import type { DbClient } from '../database/pool.js';
import type { OrderRow, ProfileRow, ParameterRow, ResultRow } from '../types/database.js';
import { AppError } from '../core/AppError.js';
import { getOrderDetails } from './orderService.js';
import { addAudit } from './auditService.js';
import { resultFlag, recalculateOrderTest, refreshOrderStatus } from './resultService.js';

const fail = (message: string, status = 409) => new AppError(message, status);

export async function lockOrder(client: DbClient, id: string, editable = true) {
  const order = (await client.query<OrderRow>('SELECT * FROM lab_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
  if (!order) throw fail('Laboratory order not found.', 404);
  if (editable && order.status === 'AUTHORIZED') throw fail('Open a report amendment before changing an authorized report.');
  return order;
}

export async function addOrderTest(client: DbClient, orderId: string, profileId: string, sortOrder: number) {
  const profile = (await client.query<ProfileRow>('SELECT * FROM test_profiles WHERE id = $1 AND active = TRUE FOR SHARE', [profileId])).rows[0];
  const parameters = (await client.query<ParameterRow>('SELECT * FROM profile_parameters WHERE profile_id = $1 AND active = TRUE ORDER BY sort_order FOR SHARE', [profileId])).rows;
  if (!profile || !parameters.length) throw fail('Selected investigation is unavailable or has no active parameters.', 400);
  const test = (await client.query('INSERT INTO order_tests (order_id, profile_id, profile_code, profile_name, sort_order, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [orderId, profile.id, profile.code, profile.name, sortOrder, profile.description])).rows[0];
  await client.query(`INSERT INTO test_results
    (order_test_id, parameter_id, parameter_code, parameter_name, result_kind, unit, method, reference_ranges, select_options, common_values, calculation_formula, suggested_value, numeric_step, slider_min, slider_max, critical_low, critical_high, sort_order, loinc_code, reference_note, description)
    SELECT $1, id, code, name, result_kind, unit, method, reference_ranges, select_options, common_values, calculation_formula, suggested_value, numeric_step, slider_min, slider_max, critical_low, critical_high, sort_order, loinc_code, reference_note, description
    FROM profile_parameters WHERE profile_id = $2 AND active = TRUE`, [test.id, profileId]);
  return test;
}

export async function changeOrderTests(client: DbClient, id: string, profileIds: string[], reason: string, userId: string) {
  const order = await lockOrder(client, id);
  const before = await getOrderDetails(id, client);
  if (!before) throw AppError.notFound();
  const retained = new Set(profileIds);
  for (const test of before.tests) {
    if (!retained.has(test.profile_id || '')) await client.query('DELETE FROM order_tests WHERE id = $1', [test.id]);
  }
  for (const [index, profileId] of profileIds.entries()) {
    const existing = before.tests.find((test) => test.profile_id === profileId);
    if (existing) await client.query('UPDATE order_tests SET sort_order = $1 WHERE id = $2', [index, existing.id]);
    else await addOrderTest(client, id, profileId, index);
  }
  for (const test of (await client.query('SELECT id FROM order_tests WHERE order_id = $1', [id])).rows) await recalculateOrderTest(client, test.id, order, userId);
  await refreshOrderStatus(client, id);
  await addAudit(client, id, userId, 'ORDER_TESTS_CHANGED', { reason, before: before.tests, profileIds });
}

export async function refreshReferences(client: DbClient, id: string, reason: string, userId: string) {
  const order = await lockOrder(client, id);
  const before = (await client.query<ResultRow & { current_ranges: ResultRow['reference_ranges']; current_note: string | null; current_unit: string | null; current_kind: ResultRow['result_kind'] }>(`SELECT r.*, p.reference_ranges AS current_ranges, p.reference_note AS current_note, p.unit AS current_unit, p.result_kind AS current_kind
    FROM test_results r JOIN order_tests ot ON ot.id = r.order_test_id
    JOIN profile_parameters p ON p.id = r.parameter_id WHERE ot.order_id = $1 AND p.active = TRUE FOR SHARE OF p`, [id])).rows;
  if (!before.length) throw fail('No active catalogue fields are available for this order.');
  if (before.some((row) => row.unit !== row.current_unit || row.result_kind !== row.current_kind)) throw fail('A field unit or result type has changed. Change the ordered test and re-enter its measurements instead of refreshing its ranges.');
  for (const row of before) {
    const updated = { ...row, reference_ranges: row.current_ranges };
    await client.query('UPDATE test_results SET reference_ranges = $1, reference_note = $2, abnormal_flag = $3, updated_by = $4, updated_at = NOW() WHERE id = $5', [JSON.stringify(row.current_ranges), row.current_note, resultFlag(row.result_value, updated, order), userId, row.id]);
  }
  await addAudit(client, id, userId, 'REFERENCE_RANGES_REFRESHED', { reason, fields: before.map((row) => ({ id: row.id, before: row.reference_ranges, after: row.current_ranges, previousNote: row.reference_note, note: row.current_note })) });
}

export async function deleteReport(client: DbClient, id: string, reason: string, userId: string) {
  await lockOrder(client, id, false);
  await client.query('UPDATE lab_orders SET deleted_at = NOW(), deleted_by = $1, deletion_reason = $2, updated_at = NOW() WHERE id = $3', [userId, reason, id]);
  await addAudit(client, id, userId, 'REPORT_DELETED', { reason });
}
