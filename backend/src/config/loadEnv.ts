import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Compiled files live one directory deeper under backend/dist.
const relativePath = /\/dist\/src\/config\//.test(import.meta.url)
  ? '../../../../.env'
  : '../../../.env';
config({ path: fileURLToPath(new URL(relativePath, import.meta.url)) });

// Share Compose's database credentials with standalone commands.
if (!process.env.DATABASE_URL && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD) {
  const user = encodeURIComponent(process.env.POSTGRES_USER);
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD);
  const database = encodeURIComponent(process.env.POSTGRES_DB || 'lis');
  process.env.DATABASE_URL = `postgresql://${user}:${password}@localhost:5432/${database}`;
}
