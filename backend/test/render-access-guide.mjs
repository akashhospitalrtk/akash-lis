import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH || 'D:/pharmacy-on/node_modules/playwright-core/index.mjs').href);
const root = new URL('../../', import.meta.url);
const source = await fs.readFile(new URL('docs/another-machine-setup.md', root), 'utf8');
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
let code = false;
const body = source.split(/\r?\n/).map((line) => {
  if (line.startsWith('```')) { code = !code; return code ? '<pre>' : '</pre>'; }
  if (code) return escape(line) + '\n';
  if (!line.trim()) return '';
  const heading = /^(#{1,2}) (.*)$/.exec(line);
  if (heading) return `<h${heading[1].length}>${escape(heading[2])}</h${heading[1].length}>`;
  return `<p${line.startsWith('- ') ? ' class="item"' : ''}>${escape(line)}</p>`;
}).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>LIS access and deployment guide</title><style>body{font:11pt Arial,sans-serif;color:#17283a;line-height:1.45}h1{font-size:24pt;color:#174e7c}h2{font-size:15pt;color:#174e7c;break-after:avoid;margin-top:25px}p{orphans:3;widows:3}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:9pt Consolas,monospace;background:#eef3f7;padding:12px;break-inside:avoid}.item{margin:6px 0 6px 15px}p{overflow-wrap:anywhere}</style><body>${body}</body></html>`;
await fs.writeFile(new URL('docs/LIS_ACCESS_AND_MACHINE_SETUP.html', root), html);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(); await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({ path: fileURLToPath(new URL('docs/LIS_ACCESS_AND_MACHINE_SETUP.pdf', root)), format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font:9px Arial;width:100%;text-align:center;color:#667">LIS implementation handoff | <span class="pageNumber"></span> / <span class="totalPages"></span></div>', margin: { top: '18mm', bottom: '20mm', left: '18mm', right: '18mm' } });
} finally { await browser.close(); }
console.log('Generated LIS_ACCESS_AND_MACHINE_SETUP.html and .pdf');
