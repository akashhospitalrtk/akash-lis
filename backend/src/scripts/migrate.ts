import fs from 'node:fs/promises';
import { databaseFile } from '../utils/databaseAssets.js';
import { pool } from '../database/pool.js';

const schemaPath = databaseFile('001_schema.sql');

try {
  await pool.query(await fs.readFile(schemaPath, 'utf8'));
  console.log('Database schema is ready.');
} finally {
  await pool.end();
}
