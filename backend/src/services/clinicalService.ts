import { pool, withTransaction, type DbClient } from '../database/pool.js';
import { AppError } from '../core/AppError.js';
import type { ClinicalSearchInput, ClinicalNoteInput } from '../schemas/clinicalSchemas.js';
import type { SessionUser } from '../schemas/authSchemas.js';
import { getOrderDetails } from './orderService.js';
import { listClinicalNotes } from './clinicalNoteService.js';
import { addAudit } from './auditService.js';
import { makeReportPdf } from './reportPdfService.js';
import { getReportTemplate } from './reportTemplateService.js';

// Explicit projection: statuses/patient identifiers are visible before publication;
// draft values, lab comments, audit payloads and amendment snapshots never are.
const summarySelect = `SELECT o.id, o.accession_no, o.patient_source, o.uhid, o.patient_name,
  o.age_value, o.age_unit, o.age_years, o.gender, o.patient_type, o.referring_doctor,
  o.sample_date, o.created_at, o.status, o.sample_status, o.authorized_at, o.amendment_count,
  (SELECT string_agg(profile_name, ', ' ORDER BY sort_order) FROM order_tests WHERE order_id = o.id) AS tests
  FROM lab_orders o`;

export async function listClinicalOrders(input: ClinicalSearchInput) {
  const params: unknown[] = [];
  const clauses = ['o.deleted_at IS NULL'];
  if (input.query) {
    // Literal search, rather than allowing % or _ to become wildcard-only queries.
    params.push('%' + input.query.replace(/[\\%_]/g, '\\$&') + '%');
    clauses.push(`(o.patient_name ILIKE $${params.length} OR o.uhid ILIKE $${params.length} OR o.accession_no ILIKE $${params.length})`);
  }
  if (input.status !== 'ALL') { params.push(input.status); clauses.push(`o.status = $${params.length}`); }
  params.push((input.page - 1) * 30);
  const rows = (await pool.query(`${summarySelect} WHERE ${clauses.join(' AND ')} ORDER BY o.created_at DESC, o.id DESC LIMIT 31 OFFSET $${params.length}`, params)).rows;
  return { items: rows.slice(0, 30), hasMore: rows.length > 30, page: input.page };
}
async function summary(id: string, client: DbClient, lock: 'SHARE' | 'UPDATE' = 'SHARE') {
  const order = (await client.query(`${summarySelect} WHERE o.id = $1 AND o.deleted_at IS NULL FOR ${lock} OF o`, [id])).rows[0];
  if (!order) throw AppError.notFound('Laboratory order not found.');
  return order;
}
export async function clinicalOrder(id: string, user: SessionUser) {
  return withTransaction(async (client) => {
    const order = await summary(id, client);
    await addAudit(client, id, user.id, 'PATIENT_VIEWED');
    return { ...order, clinical_notes: await listClinicalNotes(id, client) };
  });
}
export async function addClinicalNote(id: string, input: ClinicalNoteInput, user: SessionUser) {
  return withTransaction(async (client) => {
    await summary(id, client);
    const note = (await client.query(`INSERT INTO clinical_notes (order_id, author_id, author_name, author_designation, body)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`, [id, user.id, user.fullName, user.designation || null, input.body])).rows[0];
    await addAudit(client, id, user.id, 'CLINICAL_NOTE_ADDED', { noteId: note.id });
    return note;
  });
}
export async function publishedReport(id: string, user: SessionUser, action: 'RESULTS_VIEWED' | 'REPORT_PRINT_REQUESTED' | 'REPORT_DOWNLOADED' = 'RESULTS_VIEWED') {
  return withTransaction(async (client) => {
    const order = await summary(id, client, action === 'REPORT_PRINT_REQUESTED' ? 'UPDATE' : 'SHARE');
    if (order.status !== 'AUTHORIZED') throw AppError.conflict('Results are awaiting laboratory authorization. Check the order status for progress.');
    if (action === 'REPORT_PRINT_REQUESTED') {
      await client.query('UPDATE lab_orders SET printed_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
      if (order.amendment_count) await client.query('UPDATE report_amendments SET printed_at = NOW() WHERE order_id = $1 AND amendment_no = $2', [id, order.amendment_count]);
    }
    const detail = await getOrderDetails(id, client);
    if (!detail) throw AppError.notFound();
    await addAudit(client, id, user.id, action, { amendmentNo: detail.amendment_count || 0, clinicalNoteIds: detail.clinical_notes.map((note) => note.id) });
    // Do not disclose audit payloads (which may contain prior result values).
    const { audit: _audit, amendments: _amendments, ...report } = detail;
    return report;
  });
}
export async function downloadReport(id: string, user: SessionUser) {
  // Recheck publication under a lock and capture one consistent report version.
  const report = await publishedReport(id, user, 'REPORT_DOWNLOADED');
  const { template } = await getReportTemplate();
  return { filename: `${report.accession_no}.pdf`, bytes: await makeReportPdf(report, template) };
}
