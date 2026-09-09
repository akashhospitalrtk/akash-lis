import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(currentDirectory, '../../../database/001_schema.sql');

try {
  await pool.query(await fs.readFile(schemaPath, 'utf8'));
  console.log('Database schema is ready.');
} finally {
  await pool.end();
}
