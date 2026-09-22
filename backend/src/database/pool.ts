import pg, { type PoolClient } from 'pg';
import { config } from '../config/env.js';
import { attachDatabasePool } from '@vercel/functions';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
  max: config.databasePoolMax,
  idleTimeoutMillis: 5000,
  connectionTimeoutMillis: 10000
});
if (process.env.VERCEL === '1') attachDatabasePool(pool);

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
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
