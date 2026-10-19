import { readFile, writeFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
const path = process.argv[2] || 'test-results/report-header.pdf';
const task = getDocument({ data: new Uint8Array(await readFile(path)), useSystemFonts: true });
try {
  const pdf = await task.promise;
  console.log(`Pages: ${pdf.numPages}`);
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    console.log(`Page ${n}: ${content.items.map(item => item.str).join(' | ').slice(0, 2400)}`);
    if (n === 1 || n === pdf.numPages) {
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      await writeFile(path.replace(/\.pdf$/, `-page-${n}.png`), canvas.toBuffer('image/png'));
    }
  }
} finally { await task.destroy(); }
