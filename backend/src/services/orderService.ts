import type { OrderRow, OrderTestRow, ResultRow } from '../types/database.js';
import { pool, type DbClient } from '../database/pool.js';
import { listClinicalNotes } from './clinicalNoteService.js';

export async function getOrderDetails(orderId: string, client: DbClient = pool) {
  const orderResult = await client.query<OrderRow>(
    `SELECT o.*, creator.full_name AS created_by_name, creator.designation AS created_by_designation,
       authorizer.full_name AS authorized_by_name, authorizer.designation AS authorized_by_designation,
       authorizer.signature_label AS authorized_signature_label,
       amender.full_name AS amended_by_name
     FROM lab_orders o
     JOIN users creator ON creator.id = o.created_by
     LEFT JOIN users authorizer ON authorizer.id = o.authorized_by
     LEFT JOIN users amender ON amender.id = o.amended_by
     WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [orderId]
  );
  const order = orderResult.rows[0];
  if (!order) return null;
  const tests = (await client.query<OrderTestRow>('SELECT * FROM order_tests WHERE order_id = $1 ORDER BY sort_order, created_at', [orderId])).rows;
  const results = (await client.query<ResultRow>(
    `SELECT r.* FROM test_results r JOIN order_tests ot ON ot.id = r.order_test_id
     WHERE ot.order_id = $1 ORDER BY ot.sort_order, r.sort_order`, [orderId]
  )).rows;
  const audit = (await client.query(
    `SELECT a.*, u.full_name AS user_name FROM audit_events a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.order_id = $1 ORDER BY a.created_at DESC`, [orderId]
  )).rows;
  const amendments = (await client.query(
    `SELECT a.id, a.amendment_no, a.reason, a.created_at, a.reauthorized_at, a.printed_at,
       starter.full_name AS started_by_name, authorizer.full_name AS reauthorized_by_name
     FROM report_amendments a
     JOIN users starter ON starter.id = a.started_by
     LEFT JOIN users authorizer ON authorizer.id = a.reauthorized_by
     WHERE a.order_id = $1 ORDER BY a.amendment_no DESC`,
    [orderId]
  )).rows;
  return {
    ...order,
    tests: tests.map((test) => ({ ...test, results: results.filter((result) => result.order_test_id === test.id) })),
    audit,
    amendments,
    clinical_notes: await listClinicalNotes(orderId, client)
  };
}

export async function nextAccession(client: DbClient, sampleDate: string) {
  const day = new Date(sampleDate).toISOString().slice(0, 10);
  const compactDate = day.replaceAll('-', '');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('lis-accession-' || $1))", [compactDate]);
  const { rows } = await client.query(
    'SELECT COUNT(*)::int AS count FROM lab_orders WHERE sample_date::date = $1::date', [day]
  );
  return `LAB-${compactDate}-${String(rows[0].count + 1).padStart(4, '0')}`;
}
