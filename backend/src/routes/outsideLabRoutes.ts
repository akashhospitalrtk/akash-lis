import express, { Router } from 'express';
import { z } from 'zod';
import { authenticate, allowRoles, requireUser } from '../middleware/auth.js';
import { validateParams } from '../middleware/validate.js';
import { idParamsSchema } from '../schemas/commonSchemas.js';
import { asyncHandler } from '../core/asyncHandler.js';
import { ApiResponse } from '../core/ApiResponse.js';
import { AppError } from '../core/AppError.js';
import { pool, withTransaction, type DbClient } from '../database/pool.js';
import { addAudit } from '../services/auditService.js';

const referralSchema = z.object({ labName: z.string().trim().min(1).max(160), reference: z.string().trim().max(120).default(''), sentAt: z.string().datetime().nullable(), notes: z.string().trim().max(2000).default('') });
async function checkOrder(id: string, client: DbClient = pool) {
  const { rows } = await client.query('SELECT id FROM lab_orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id]);
  if (!rows.length) throw AppError.notFound('Order not found.');
}
export const outsideLabRoutes = Router();
outsideLabRoutes.get('/outside-lab/reports', authenticate, allowRoles('ADMIN', 'TECHNICIAN', 'AUTHORIZER'), asyncHandler(async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 160) : '';
  const pattern = `%${query}%`;
  const { rows } = await pool.query(
    `SELECT r.id, r.order_id, r.filename, r.mime_type, octet_length(r.content)::int AS size, r.created_at,
       o.accession_no, o.uhid, o.patient_name, o.mobile, f.lab_name, f.reference
     FROM outside_lab_reports r
     JOIN outside_lab_referrals f ON f.order_id = r.order_id
     JOIN lab_orders o ON o.id = r.order_id
     WHERE o.deleted_at IS NULL
       AND ($1 = '' OR o.patient_name ILIKE $2 OR COALESCE(o.uhid, '') ILIKE $2
         OR o.accession_no ILIKE $2 OR o.mobile ILIKE $2 OR f.lab_name ILIKE $2
         OR f.reference ILIKE $2 OR r.filename ILIKE $2)
     ORDER BY r.created_at DESC
     LIMIT 200`,
    [query, pattern]
  );
  ApiResponse.ok({ reports: rows }).send(res);
}));

outsideLabRoutes.use('/orders/:id/outside-lab', authenticate, allowRoles('ADMIN', 'TECHNICIAN', 'AUTHORIZER'), validateParams(idParamsSchema));
outsideLabRoutes.get('/orders/:id/outside-lab', asyncHandler(async (req, res) => {
  await checkOrder(req.params.id);
  const referral = (await pool.query('SELECT lab_name, reference, sent_at, notes FROM outside_lab_referrals WHERE order_id=$1', [req.params.id])).rows[0] || null;
  const reports = (await pool.query('SELECT id, filename, mime_type, octet_length(content) AS size, created_at FROM outside_lab_reports WHERE order_id=$1 ORDER BY created_at DESC', [req.params.id])).rows;
  ApiResponse.ok({ referral, reports }).send(res);
}));
outsideLabRoutes.put('/orders/:id/outside-lab', allowRoles('ADMIN', 'TECHNICIAN'), asyncHandler(async (req, res) => {
  const data = referralSchema.parse(req.body);
  await withTransaction(async client => {
    await checkOrder(req.params.id, client);
    await client.query(`INSERT INTO outside_lab_referrals(order_id,lab_name,reference,sent_at,notes) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(order_id) DO UPDATE SET lab_name=$2,reference=$3,sent_at=$4,notes=$5`, [req.params.id,data.labName,data.reference,data.sentAt,data.notes]);
    await addAudit(client,req.params.id,requireUser(req).id,'OUTSIDE_LAB_REFERRAL_SAVED', { labName:data.labName });
  });
  ApiResponse.ok({ saved:true }).send(res);
}));
outsideLabRoutes.post('/orders/:id/outside-lab/reports', allowRoles('ADMIN', 'TECHNICIAN'), express.raw({ type:['application/pdf','image/jpeg','image/png'], limit:'10mb' }), asyncHandler(async (req,res) => {
  const content = req.body;
  const mime = req.get('Content-Type')?.split(';')[0];
  if (!Buffer.isBuffer(content) || !content.length) throw new AppError('Upload a PDF, JPG or PNG report (maximum 10 MB).');
  const valid = mime==='application/pdf' ? content.subarray(0,5).toString()==='%PDF-' : mime==='image/png' ? content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime==='image/jpeg' && content[0]===255 && content[1]===216 && content[2]===255;
  if (!valid) throw new AppError('The report content does not match its file type.');
  let filename: string;
  try { filename=decodeURIComponent(req.get('X-Report-Filename') || 'outside-report'); } catch { throw new AppError('Invalid report filename.'); }
  filename=filename.replace(/[\x00-\x1f\x7f\\/";]/g,'_').slice(0,180);
  await withTransaction(async client => {
    await checkOrder(req.params.id,client);
    const referral=await client.query('SELECT order_id FROM outside_lab_referrals WHERE order_id=$1',[req.params.id]);
    if (!referral.rows.length) throw AppError.conflict('Save the outside laboratory details before uploading its report.');
    await client.query('INSERT INTO outside_lab_reports(order_id,filename,mime_type,content,uploaded_by) VALUES($1,$2,$3,$4,$5)',[req.params.id,filename,mime,content,requireUser(req).id]);
    await addAudit(client,req.params.id,requireUser(req).id,'OUTSIDE_REPORT_UPLOADED',{ filename });
  });
  ApiResponse.created({ uploaded:true }).send(res);
}));
outsideLabRoutes.get('/orders/:id/outside-lab/reports/:reportId', asyncHandler(async (req,res) => {
  await checkOrder(req.params.id);
  const reportId=z.string().uuid().parse(req.params.reportId);
  const row=(await pool.query('SELECT filename,mime_type,content FROM outside_lab_reports WHERE id=$1 AND order_id=$2',[reportId,req.params.id])).rows[0];
  if (!row) throw AppError.notFound('Report not found.');
  res.set({ 'Content-Type':row.mime_type, 'Content-Disposition':`attachment; filename="outside-report.${row.mime_type==='application/pdf'?'pdf':row.mime_type==='image/png'?'png':'jpg'}"; filename*=UTF-8''${encodeURIComponent(row.filename)}` });
  res.send(row.content);
}));
