// Check a standalone runtime layout without a database connection or deployment.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.argv[2] !== '--worker') {
  const base = fileURLToPath(new URL('../test-results/', import.meta.url));
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(resolve(base, 'vercel-runtime-'));
  try {
    await cp(new URL('../dist/', import.meta.url), resolve(directory, 'dist'), { recursive: true });
    await cp(new URL('../assets/', import.meta.url), resolve(directory, 'assets'), { recursive: true });
    await writeFile(resolve(directory, 'package.json'), JSON.stringify({ type: 'module' }));
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', directory], {
      cwd: directory, stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production', VERCEL: '1', DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/vercel_runtime_test', DATABASE_SSL: 'false', DATABASE_POOL_MAX: '5', JWT_SECRET: 'synthetic-vercel-runtime-test-only-secret', CORS_ORIGIN: 'https://lis-ui.example', HOSPITAL_PATIENT_PROVIDER: 'disabled' }
    });
    if (child.error) throw child.error;
    assert.equal(child.status, 0, 'Packaged API smoke failed');
  } finally {
    const checked = resolve(directory);
    assert.ok(checked.startsWith(resolve(base) + sep) && checked.includes('vercel-runtime-'));
    await rm(checked, { recursive: true, force: true });
  }
} else {
  const directory = resolve(process.argv[3]);
  await assert.rejects(access(resolve(directory, 'database')));
  const moduleAt = (path) => import(pathToFileURL(resolve(directory, 'dist/src', path)).href);
  const { default: app } = await moduleAt('app.js');
  const { pool } = await moduleAt('database/pool.js');
  const { prisma } = await moduleAt('database/prisma.js');
  const { getDescriptionLibrary } = await moduleAt('services/descriptionService.js');
  const { makeReportPdf } = await moduleAt('services/reportPdfService.js');
  assert.equal(typeof app, 'function');
  assert.equal(pool.options.max, 5);
  assert.equal(pool.options.connectionTimeoutMillis, 10000);
  assert.ok(Object.keys((await getDescriptionLibrary()).profiles).length > 0);
  const pdf = await makeReportPdf({ accession_no: 'SYNTHETIC-VERCEL', patient_name: 'Synthetic staging patient', age_value: '25', age_unit: 'years', gender: 'Female', status: 'AUTHORIZED', sample_date: new Date(), authorized_at: new Date(), amendment_count: 0, tests: [], clinical_notes: [] });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const config = await fetch(`${base}/api/config`, { headers: { Origin: 'https://lis-ui.example' } });
    assert.equal(config.status, 200);
    assert.equal(config.headers.get('access-control-allow-origin'), 'https://lis-ui.example');
    assert.match(config.headers.get('cache-control'), /no-store/);
    const blocked = await fetch(`${base}/api/config`, { headers: { Origin: 'https://unapproved.example' } });
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
    const preflight = await fetch(`${base}/api/catalogue/profiles`, { method: 'OPTIONS', headers: { Origin: 'https://lis-ui.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/);
    assert.equal((await fetch(`${base}/api/catalogue/profiles`)).status, 401);
    assert.equal((await fetch(`${base}/api/missing`)).status, 404);
    console.log('PASS: packaged API default export, report assets/PDF, pool limits, CORS/preflight, authentication and API 404. No database connection or cloud deployment.');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
    await pool.end();
  }
}
