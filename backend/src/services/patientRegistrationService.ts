import { withTransaction } from '../database/pool.js';
import { AppError } from '../core/AppError.js';
import type { SessionUser } from '../schemas/authSchemas.js';
import { updatePatientSchema, type UpdatePatientInput } from '../schemas/orderSchemas.js';
import type { OrderRow, ResultRow } from '../types/database.js';
import { hasRole } from './permissionService.js';
import { lockOrder } from './orderRevisionService.js';
import { getOrderDetails } from './orderService.js';
import { resultFlag } from './resultService.js';
import { addAudit } from './auditService.js';

function snapshot(order: OrderRow) {
  return {
    patientName: order.patient_name, uhid: order.uhid, ageValue: order.age_value,
    ageUnit: order.age_unit, ageYears: order.age_years, gender: order.gender,
    mobile: order.mobile, referringDoctor: order.referring_doctor, patientType: order.patient_type
  };
}

/** Correct this LIS order's patient snapshot only; never write to the HMS. */
export async function updatePatientRegistration(input: UpdatePatientInput, orderId: string, user: SessionUser) {
  if (!hasRole(user, 'ADMIN')) throw AppError.forbidden('Only an administrator can correct patient registration details.');
  const payload = updatePatientSchema.parse(input);
  return withTransaction(async (client) => {
    const before = await lockOrder(client, orderId);
    if (new Date(before.updated_at).getTime() !== Date.parse(payload.expectedUpdatedAt)) {
      throw AppError.conflict('This order has changed. Refresh it and review the current patient details before saving again.');
    }
    const ageDays = payload.ageValue === null ? null : payload.ageValue * ({ days: 1, weeks: 7, months: 365.25 / 12, years: 365.25 }[payload.ageUnit]);
    const updated = (await client.query<OrderRow>(`UPDATE lab_orders SET patient_name = $1, uhid = $2,
      age_value = $3, age_unit = $4, age_years = $5, gender = $6, mobile = $7,
      referring_doctor = $8, patient_type = $9, updated_at = NOW() WHERE id = $10 RETURNING *`,
    [payload.patientName, payload.uhid || null, payload.ageValue, payload.ageUnit,
      ageDays === null ? null : Math.floor(ageDays / 365.25), payload.gender || null,
      payload.mobile || null, payload.referringDoctor || null, payload.patientType || null, orderId])).rows[0];
    // Age/sex corrections can change flags. Retain all measured values and the
    // order's saved reference ranges, including previously calculated results.
    const results = (await client.query<ResultRow>(`SELECT r.* FROM test_results r
      JOIN order_tests ot ON ot.id = r.order_test_id WHERE ot.order_id = $1`, [orderId])).rows;
    const flagChanges = [];
    for (const result of results) {
      const flag = resultFlag(result.result_value, result, updated);
      if (flag !== result.abnormal_flag) {
        await client.query('UPDATE test_results SET abnormal_flag = $1, updated_by = $2, updated_at = NOW() WHERE id = $3', [flag, user.id, result.id]);
        flagChanges.push({ id: result.id, before: result.abnormal_flag, after: flag });
      }
    }
    await addAudit(client, orderId, user.id, 'PATIENT_DETAILS_UPDATED', {
      reason: payload.reason, before: snapshot(before), after: snapshot(updated), flagChanges
    });
    return getOrderDetails(orderId, client);
  });
}
