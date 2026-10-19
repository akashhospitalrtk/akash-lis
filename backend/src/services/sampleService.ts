import type { DbClient } from '../database/pool.js';
import { AppError } from '../core/AppError.js';
import { lockOrder } from './orderRevisionService.js';
import { addAudit } from './auditService.js';

export async function prepareForEntry(client: DbClient, orderId: string, userId: string) {
  const order = await lockOrder(client, orderId);
  if (!['REGISTERED', 'COLLECTED', 'IN_PROCESS', 'RESULTS_PENDING'].includes(order.sample_status)) throw AppError.conflict('This sample cannot be opened for result entry.');
  if (order.sample_status === 'REGISTERED') {
    await client.query("UPDATE lab_orders SET sample_status = 'COLLECTED', sample_received_at = NOW(), sample_received_by = $1, updated_at = NOW() WHERE id = $2", [userId, orderId]);
    await addAudit(client, orderId, userId, 'SAMPLES_ACCEPTED', { source: 'DIRECT_RESULT_ENTRY' });
  }
  if (order.sample_status === 'REGISTERED' || order.sample_status === 'COLLECTED') {
    await client.query("UPDATE lab_orders SET sample_status = 'IN_PROCESS', updated_at = NOW() WHERE id = $1", [orderId]);
    await addAudit(client, orderId, userId, 'SAMPLE_PROCESSING_STARTED', { source: 'DIRECT_RESULT_ENTRY' });
  }
}
