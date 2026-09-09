export async function addAudit(client, orderId, userId, eventType, details = {}) {
  await client.query(
    'INSERT INTO audit_events (order_id, user_id, event_type, details) VALUES ($1, $2, $3, $4)',
    [orderId, userId || null, eventType, JSON.stringify(details)]
  );
}

export async function addSystemAudit(client, userId, eventType, details = {}) {
  await client.query(
    'INSERT INTO system_audit_events (user_id, event_type, details) VALUES ($1, $2, $3)',
    [userId || null, eventType, JSON.stringify(details)]
  );
}
