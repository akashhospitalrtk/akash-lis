import type { DbClient } from '../database/pool.js';
import { descriptionLibrarySchema } from '../schemas/descriptionSchemas.js';
import fs from 'node:fs/promises';
import { databaseFile } from '../utils/databaseAssets.js';

const libraryPromise = fs.readFile(databaseFile('report-descriptions.json'), 'utf8').then((text) => descriptionLibrarySchema.parse(JSON.parse(text)));
export async function getDescriptionLibrary() { return libraryPromise; }

export async function seedDescriptions(client: DbClient) {
  const library = await getDescriptionLibrary();
  let updated = 0;
  for (const [code, entry] of Object.entries(library.profiles)) {
    const profile = (await client.query('SELECT id FROM test_profiles WHERE code = $1', [code])).rows[0];
    if (!profile) continue;
    const change = await client.query('UPDATE test_profiles SET description = $1 WHERE id = $2 AND description IS NULL', [entry.text, profile.id]);
    const fields = [];
    for (const [key, parameterEntry] of Object.entries(library.parameters)) {
      if (!key.startsWith(`${code}:`)) continue;
      const parameterCode = key.slice(code.length + 1);
      const result = await client.query('UPDATE profile_parameters SET description = $1 WHERE profile_id = $2 AND code = $3 AND description IS NULL', [parameterEntry.text, profile.id, parameterCode]);
      if (result.rowCount) fields.push(parameterCode);
    }
    if (change.rowCount || fields.length) {
      await client.query("INSERT INTO catalogue_audit_events (profile_id, event_type, details) VALUES ($1, 'DESCRIPTION_DEFAULTS_ADDED', $2)", [profile.id, JSON.stringify({ version: library.version, profile: Boolean(change.rowCount), parameters: fields, sources: entry.sources })]);
      updated++;
    }
  }
  return updated;
}
