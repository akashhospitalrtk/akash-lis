// Rasterize our code-native SVG artwork for PDFKit. No patient data is used.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH || 'D:/pharmacy-on/node_modules/playwright-core/index.mjs').href);
const root = new URL('../', import.meta.url);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 850, height: 1200 }, deviceScaleFactor: 3 });
  await mkdir(new URL('backend/assets/letterhead/', root), { recursive: true });
  await mkdir(new URL('backend/test-results/', root), { recursive: true });
  for (const name of ['emblem', 'beti-bachao']) {
    await page.goto(new URL(`frontend/public/letterhead/${name}.svg`, root).href);
    await page.locator('svg').evaluate((svg, name) => { svg.style.width = name === 'emblem' ? '200px' : '120px'; svg.style.height = name === 'emblem' ? '240px' : '120px'; }, name);
    await page.locator('svg').screenshot({ path: fileURLToPath(new URL(`backend/assets/letterhead/${name}.png`, root)), omitBackground: true });
  }
  await page.goto(new URL('docs/report-letterhead-preview.html', root).href);
  await page.locator('.page').screenshot({ path: fileURLToPath(new URL('backend/test-results/letterhead-preview.png', root)) });
  await page.pdf({ path: fileURLToPath(new URL('backend/test-results/letterhead-preview.pdf', root)), format: 'A4', printBackground: true });
  console.log('Generated letterhead artwork and preview.');
} finally { await browser.close(); }
