import pg, { type PoolClient } from 'pg';
import { config } from '../config/env.js';
import { attachDatabasePool } from '@vercel/functions';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
  max: config.databasePoolMax,
  statement_timeout: config.databaseStatementTimeout,
  lock_timeout: config.databaseLockTimeout,
  idle_in_transaction_session_timeout: 30000,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000
});
if (process.env.VERCEL === '1') attachDatabasePool(pool);

pool.on('error', () => {
  console.error('Unexpected PostgreSQL pool error');
});

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await callback(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type DbClient = Pick<PoolClient, 'query'>;
