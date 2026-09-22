import { copyFile, mkdir, access } from 'node:fs/promises';

// Include only runtime assets; schema migrations are a separate operator step.
const target = new URL('../assets/database/', import.meta.url);
await mkdir(target, { recursive: true });
try {
  await copyFile(new URL('../../database/report-descriptions.json', import.meta.url), new URL('report-descriptions.json', target));
} catch (error) {
  throw new Error('Could not package report descriptions. Enable "Include source files outside of the Root Directory in the Build Step" for the backend Vercel project.', { cause: error });
}
for (const name of ['NotoSans.ttf', 'NotoSansDevanagari.ttf']) {
  await access(new URL(`../assets/fonts/${name}`, import.meta.url));
}
console.log('Vercel report descriptions and PDF fonts are ready. No database migrations or seeds were run.');
