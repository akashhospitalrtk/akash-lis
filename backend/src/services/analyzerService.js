import { recalculateOrderTest, refreshOrderStatus, resultFlag, validatedResultValue } from './resultService.js';
import { addAudit } from './auditService.js';

/** Normalized values let CSV, ASTM, HL7 and future vendor adapters share one safe import path. */
export async function applyAnalyzerResults(client, orderId, normalizedResults, user) {
  const order = (await client.query('SELECT * FROM lab_orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0];
  if (!order) throw new Error('Order not found.');
  if (order.status === 'AUTHORIZED') throw new Error('Authorized reports cannot be changed.');
  if (order.sample_status === 'REGISTERED') throw new Error('Accept the sample before importing results.');
  if (!['IN_PROCESS', 'RESULTS_PENDING'].includes(order.sample_status)) throw new Error('Mark the collected sample as in process before importing analyzer results.');

  const resultRows = (await client.query(
    'SELECT r.*, ot.id AS order_test_id FROM test_results r JOIN order_tests ot ON ot.id = r.order_test_id WHERE ot.order_id = $1', [orderId]
  )).rows;
  const byCode = new Map(resultRows.map((row) => [row.parameter_code.toUpperCase(), row]));
  const touchedTests = new Set();
  let imported = 0;
  for (const item of normalizedResults) {
    const result = byCode.get(String(item.code || '').trim().toUpperCase());
    if (!result || item.value === undefined || item.value === null) continue;
    const value = validatedResultValue(item.value, result);
    if (!value) continue;
    await client.query(
      `UPDATE test_results SET result_value = $1, abnormal_flag = $2, updated_by = $3, updated_at = NOW(),
       entered_by = COALESCE(entered_by, $3), entered_at = COALESCE(entered_at, NOW()) WHERE id = $4`,
      [value, resultFlag(value, result, order), user.id, result.id]
    );
    touchedTests.add(result.order_test_id);
    imported += 1;
  }
  for (const testId of touchedTests) await recalculateOrderTest(client, testId, order, user.id);
  if (!imported) throw Object.assign(new Error('No analyzer result matched this order. Check the CSV parameter codes and values.'), { status: 400 });
  await refreshOrderStatus(client, orderId);
  await addAudit(client, orderId, user.id, 'RESULTS_IMPORTED', { source: 'CSV', imported });
  return imported;
}
