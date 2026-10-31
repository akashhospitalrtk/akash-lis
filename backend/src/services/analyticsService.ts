import { pool } from '../database/pool.js';
import type { DashboardQuery } from '../schemas/analyticsSchemas.js';

export async function dashboardAnalytics({ from, to }: DashboardQuery) {
  const [summaryResult, trendResult, statusResult, topTestsResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT o.id)::int AS orders,
        COUNT(DISTINCT ot.id)::int AS tests,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'PENDING')::int AS pending,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'COMPLETED')::int AS completed,
        COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'AUTHORIZED')::int AS authorized,
        (SELECT COUNT(*)::int FROM test_results r
          JOIN order_tests flagged_test ON flagged_test.id = r.order_test_id
          JOIN lab_orders flagged_order ON flagged_order.id = flagged_test.order_id
          WHERE flagged_order.deleted_at IS NULL AND r.abnormal_flag IS NOT NULL
            AND flagged_order.sample_date >= $1::date AND flagged_order.sample_date < ($2::date + INTERVAL '1 day')) AS abnormal_results,
        (SELECT ROUND((AVG(EXTRACT(EPOCH FROM (timed_order.authorized_at - timed_order.sample_received_at)) / 3600))::numeric, 1)::float8
          FROM lab_orders timed_order
          WHERE timed_order.deleted_at IS NULL AND timed_order.authorized_at IS NOT NULL AND timed_order.sample_received_at IS NOT NULL
            AND timed_order.sample_date >= $1::date AND timed_order.sample_date < ($2::date + INTERVAL '1 day')) AS avg_turnaround_hours
       FROM lab_orders o
       LEFT JOIN order_tests ot ON ot.order_id = o.id
       WHERE o.deleted_at IS NULL AND o.sample_date >= $1::date AND o.sample_date < ($2::date + INTERVAL '1 day')`,
      [from, to]
    ),
    pool.query(
      `WITH days AS (
        SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS day
       )
       SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
         COUNT(DISTINCT o.id)::int AS orders,
         COUNT(ot.id)::int AS tests
       FROM days
       LEFT JOIN lab_orders o ON o.sample_date::date = days.day AND o.deleted_at IS NULL
       LEFT JOIN order_tests ot ON ot.order_id = o.id
       GROUP BY days.day ORDER BY days.day`,
      [from, to]
    ),
    pool.query(
      `SELECT o.status, COUNT(*)::int AS count
       FROM lab_orders o
       WHERE o.deleted_at IS NULL AND o.sample_date >= $1::date AND o.sample_date < ($2::date + INTERVAL '1 day')
       GROUP BY o.status
       ORDER BY CASE o.status WHEN 'PENDING' THEN 1 WHEN 'COMPLETED' THEN 2 ELSE 3 END`,
      [from, to]
    ),
    pool.query(
      `SELECT ot.profile_code AS code, ot.profile_name AS name, COUNT(*)::int AS count
       FROM order_tests ot
       JOIN lab_orders o ON o.id = ot.order_id
       WHERE o.deleted_at IS NULL AND o.sample_date >= $1::date AND o.sample_date < ($2::date + INTERVAL '1 day')
       GROUP BY ot.profile_code, ot.profile_name
       ORDER BY count DESC, ot.profile_name
       LIMIT 8`,
      [from, to]
    )
  ]);

  const summary = summaryResult.rows[0];
  return {
    from,
    to,
    metrics: {
      orders: summary.orders,
      tests: summary.tests,
      pending: summary.pending,
      completed: summary.completed,
      authorized: summary.authorized,
      abnormalResults: summary.abnormal_results,
      avgTurnaroundHours: summary.avg_turnaround_hours
    },
    daily: trendResult.rows,
    statuses: statusResult.rows,
    topTests: topTestsResult.rows
  };
}
