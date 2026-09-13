import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import pg from 'pg';

const inDocker = process.env.LIS_CONTAINER_TEST === '1';
const env = inDocker ? {} : dotenv.parse(fs.readFileSync(new URL('../../.env', import.meta.url)));
const connection = { host: '127.0.0.1', port: 5432, user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, database: env.POSTGRES_DB || 'lis' };
const admin = new pg.Client(inDocker ? { connectionString: process.env.DATABASE_URL } : connection);
const name = `lis_revision_${Date.now()}_test`;
if (!/^lis_revision_\d+_test$/.test(name)) throw new Error('Invalid disposable database name');
await admin.connect();
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(inDocker ? process.env.DATABASE_URL : 'postgresql://127.0.0.1:5432'); if (!inDocker) { url.username = connection.user; url.password = connection.password; } url.pathname = `/${name}`;
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url.href, JWT_SECRET: 'synthetic-test-only-secret', NODE_ENV: 'test' } });
  process.exitCode = result.status ?? 1;
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}
