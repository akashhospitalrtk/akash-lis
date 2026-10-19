import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Source/tsx and compiled Docker builds place the database folder at different depths.
export function databaseFile(name: '001_schema.sql' | '002_seed_profiles.sql' | 'report-descriptions.json') {
  const candidates = [
    new URL(`../../../database/${name}`, import.meta.url),
    new URL(`../../../../database/${name}`, import.meta.url),
    new URL(`../../assets/database/${name}`, import.meta.url),
    new URL(`../../../assets/database/${name}`, import.meta.url),
    pathToFileURL(resolve(process.cwd(), 'assets/database', name))
  ];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) throw new Error(`Missing database asset: ${name}`);
  return file;
}
