import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(currentDirectory, '../../../database/002_seed_profiles.sql');

try {
  await pool.query(await fs.readFile(seedPath, 'utf8'));
  console.log('Common test profiles are ready.');
} finally {
  await pool.end();
}
