import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
const loading = getDocument({ data: new Uint8Array(await fs.readFile(new URL('../../docs/LIS_ACCESS_AND_MACHINE_SETUP.pdf', import.meta.url))), useSystemFonts: true });
const pdf = await loading.promise;
let text = '';
await fs.mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const contents = await page.getTextContent(); text += contents.items.map((item) => item.str || '').join(' ') + '\n';
  const viewport = page.getViewport({ scale: 1.2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  await fs.writeFile(new URL(`../test-results/access-guide-${i}.png`, import.meta.url), canvas.toBuffer('image/png'));
}
for (const expected of ['central-server approach', 'Technician + Report authorizer', 'Protected removal', 'docker compose up', 'another machine today', 'Before commercial use']) assert.ok(text.includes(expected), expected);
const pages = pdf.numPages;
await loading.destroy();
console.log(`PASS: ${pages}-page setup PDF contains all required sections; rendered every page for visual review.`);
