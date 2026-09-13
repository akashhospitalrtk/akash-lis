import type { DbClient } from '../database/pool.js';

export async function addAudit(client: DbClient, orderId: string, userId: string | null, eventType: string, details: Record<string, unknown> = {}) {
  await client.query(
    'INSERT INTO audit_events (order_id, user_id, event_type, details) VALUES ($1, $2, $3, $4)',
    [orderId, userId || null, eventType, JSON.stringify(details)]
  );
}

export async function addSystemAudit(client: DbClient, userId: string | null, eventType: string, details: Record<string, unknown> = {}) {
  await client.query(
    'INSERT INTO system_audit_events (user_id, event_type, details) VALUES ($1, $2, $3)',
    [userId || null, eventType, JSON.stringify(details)]
  );
}

export async function catalogueAudit(client: DbClient, profileId: string, userId: string | null, eventType: string, details: Record<string, unknown> = {}) {
  await client.query('INSERT INTO catalogue_audit_events (profile_id, user_id, event_type, details) VALUES ($1, $2, $3, $4)', [profileId, userId, eventType, JSON.stringify(details)]);
}
