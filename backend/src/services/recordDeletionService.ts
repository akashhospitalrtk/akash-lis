import bcrypt from 'bcryptjs';
import { AppError } from '../core/AppError.js';
import { withTransaction } from '../database/pool.js';
import type { SessionUser } from '../schemas/authSchemas.js';
import { deleteReportSchema, type DeleteReportInput } from '../schemas/orderSchemas.js';
import { addSystemAudit } from './auditService.js';
import { deleteReport, lockOrder } from './orderRevisionService.js';
import { hasRole } from './permissionService.js';

/** No hard-delete API: keep patient snapshot, results, notes and audit history. */
export async function removeClinicalRecord(input: DeleteReportInput, orderId: string, actor: SessionUser) {
  const payload = deleteReportSchema.parse(input);
  const denied = await withTransaction(async (client) => {
    // Re-read and lock the actor so a role/active-state change cannot race deletion.
    const user = (await client.query(`SELECT id, role, COALESCE(roles, ARRAY[role::text]) AS roles,
      active, password_hash, sensitive_failed_attempts, sensitive_attempt_window,
      sensitive_attempt_window > NOW() - INTERVAL '15 minutes' AS within_window
      FROM users WHERE id = $1 FOR UPDATE`, [actor.id])).rows[0];
    if (!user?.active || !hasRole(user, 'ADMIN')) throw AppError.forbidden('Only an active administrator can remove a clinical record.');
    if (user.within_window && user.sensitive_failed_attempts >= 5) {
      return new AppError('Too many confirmation attempts. Try again after 15 minutes.', 429);
    }
    if (!await bcrypt.compare(payload.password, user.password_hash)) {
      await client.query(`UPDATE users SET sensitive_failed_attempts = $2,
        sensitive_attempt_window = CASE WHEN $3 THEN sensitive_attempt_window ELSE NOW() END WHERE id = $1`,
      [actor.id, user.within_window ? user.sensitive_failed_attempts + 1 : 1, Boolean(user.within_window)]);
      await addSystemAudit(client, actor.id, 'RECORD_REMOVAL_DENIED', { orderId, cause: 'PASSWORD_CONFIRMATION_FAILED' });
      // Return the error to commit the attempt counter and audit; throw afterward.
      return AppError.forbidden('Administrator password confirmation failed.');
    }
    const order = await lockOrder(client, orderId, false);
    if (order.accession_no !== payload.confirmationAccession) throw AppError.conflict('The accession number does not match this report.');
    await deleteReport(client, orderId, payload.reason, actor.id);
    await client.query('UPDATE users SET sensitive_failed_attempts = 0, sensitive_attempt_window = NULL WHERE id = $1', [actor.id]);
    await addSystemAudit(client, actor.id, 'CLINICAL_RECORD_REMOVED', {
      orderId, accession: order.accession_no, previousStatus: order.status,
      action: order.status === 'AUTHORIZED' ? 'VOID' : 'ARCHIVE', reason: payload.reason,
      patientSnapshotRetained: true, passwordConfirmed: true
    });
    return null;
  });
  if (denied) throw denied;
}
