import pg from 'pg';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// Dedicated test server only. Never point this runner at the hospital database.
const url = new URL(process.env.DATABASE_URL || '');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.endsWith('_test'), 'Provide an isolated local _test DATABASE_URL.');
const admin = new pg.Client({ connectionString: url.href }); await admin.connect();
const prefix = `access_${Date.now()}`;
const suites = process.argv.slice(2);
const selected = suites.length ? suites : ['multi-role.integration.test.js', 'architecture.integration.test.js', 'catalogue.integration.test.js', 'reference-ranges.test.js', 'doctor-access.integration.test.js', 'doctor-pdf.test.js', 'doctor-browser.mjs', 'multi-role-browser.mjs', 'revision-browser.mjs'];
try {
  for (const [i, suite] of selected.entries()) {
    assert.ok(/^[a-z0-9.-]+\.(js|mjs)$/.test(suite), 'Use a test filename only.');
    const name = `${prefix}_${i}_test`; await admin.query(`CREATE DATABASE "${name}"`);
    const testUrl = new URL(url); testUrl.pathname = '/' + name;
    console.log(`Running ${suite} against ${name}`);
    const args = [...(suite.endsWith('.test.js') ? ['--test'] : []), 'test/' + suite];
    const code = await new Promise((resolve, reject) => {
      const env = { ...process.env, DATABASE_URL: testUrl.href, NODE_ENV: 'test' };
      if (env.PLAYWRIGHT_MODULE_PATH) {
        const moduleUrl = env.PLAYWRIGHT_MODULE_PATH.startsWith('file:') ? new URL(env.PLAYWRIGHT_MODULE_PATH) : pathToFileURL(env.PLAYWRIGHT_MODULE_PATH);
        // Catalogue imports a URL directly; the standalone browser scripts accept a path.
        env.PLAYWRIGHT_MODULE_PATH = suite === 'catalogue.integration.test.js' ? moduleUrl.href : fileURLToPath(moduleUrl);
      }
      const child = spawn(process.execPath, args, { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit', env });
      child.once('error', reject); child.once('exit', resolve);
    });
    if (code !== 0) throw new Error(`${suite} failed (${code}); isolated database ${name} retained for diagnostics.`);
    await admin.query(`DROP DATABASE "${name}"`);
  }
} finally { await admin.end(); }
