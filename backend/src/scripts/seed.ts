import fs from 'node:fs/promises';
import { databaseFile } from '../utils/databaseAssets.js';
import { seedDescriptions } from '../services/descriptionService.js';
import { pool, withTransaction } from '../database/pool.js';

const seedPath = databaseFile('002_seed_profiles.sql');

try {
  await pool.query(await fs.readFile(seedPath, 'utf8'));
  const descriptions = await withTransaction(seedDescriptions);
  console.log(`Report descriptions added to ${descriptions} investigations.`);
  console.log('Common test profiles are ready.');
} finally {
  await pool.end();
}
