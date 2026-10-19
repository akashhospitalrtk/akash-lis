import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from '../dist/src/config/env.js';
import { pool } from '../dist/src/database/pool.js';
import { defaultReportTemplate } from '../dist/src/schemas/reportTemplateSchema.js';

const target = new URL(config.databaseUrl);
assert.ok(target.pathname.endsWith('_test') && ['127.0.0.1', 'localhost', ...(process.env.LIS_CONTAINER_TEST === '1' ? ['db'] : [])].includes(target.hostname), 'Disposable test database only.');

test('clean report appearance preserves site wording, audits changes, and rejects a stale revision', async t => {
  t.after(() => pool.end());
  await pool.query(await readFile(new URL('../../database/001_schema.sql', import.meta.url), 'utf8'));
  const before = { ...defaultReportTemplate, brandName: 'SYNTHETIC SITE', phone: 'TEST CONTACT',
    supportLine: 'CUSTOM SUPPORT', labels: { ...defaultReportTemplate.labels, name: 'Patient name' },
    bandColor: '#0000ff', brandFontPt: 70, patientLayout: 'three-column', watermarkOpacity: .05 };
  await pool.query('UPDATE report_template SET template=$1, revision=3 WHERE id=1', [JSON.stringify(before)]);
  const script = fileURLToPath(new URL('../dist/src/scripts/applyCleanReportDesign.js', import.meta.url));
  const result = spawnSync(process.execPath, [script, '3'], { env: process.env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const after = (await pool.query('SELECT template,revision FROM report_template WHERE id=1')).rows[0];
  assert.equal(after.revision, 4);
  assert.equal(after.template.brandName, before.brandName);
  assert.equal(after.template.phone, before.phone);
  assert.equal(after.template.supportLine, before.supportLine);
  assert.deepEqual(after.template.labels, before.labels);
  assert.equal(after.template.bandColor, '#ffffff');
  assert.equal(after.template.patientLabelWeight, 'bold');
  assert.equal(after.template.patientLayout, 'minimal');
  const audit = (await pool.query("SELECT details FROM system_audit_events WHERE details->>'source'='maintenance:clean-hospital-design'")).rows;
  assert.equal(audit.length, 1);
  assert.deepEqual(audit[0].details.before, before);
  assert.deepEqual(audit[0].details.after, after.template);
  assert.notEqual(spawnSync(process.execPath, [script, '3'], { env: process.env, encoding: 'utf8' }).status, 0);
  assert.equal((await pool.query('SELECT revision FROM report_template WHERE id=1')).rows[0].revision, 4);
});
