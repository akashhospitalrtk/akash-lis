import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import { performance } from 'node:perf_hooks';
import { createApp } from '../dist/src/app.js';
import { config } from '../dist/src/config/env.js';
import { pool, withTransaction } from '../dist/src/database/pool.js';
import { prisma } from '../dist/src/database/prisma.js';

const url = new URL(config.databaseUrl);
assert.ok(url.pathname.endsWith('_test') && ['localhost', '127.0.0.1', ...(process.env.LIS_CONTAINER_TEST === '1' ? ['db'] : [])].includes(url.hostname), 'Disposable test database only.');

test('patient prefix lookup and bounded concurrent database load', async (t) => {
  await pool.query(await fs.readFile(new URL('../../database/001_schema.sql', import.meta.url), 'utf8'));
  const user = (await pool.query("INSERT INTO users(username,password_hash,full_name,role) VALUES('lookup_load','synthetic-unusable-hash','Synthetic Operator','TECHNICIAN') RETURNING id")).rows[0];
  await pool.query(`INSERT INTO lab_orders(accession_no,uhid,patient_name,mobile,sample_date,created_by)
    SELECT 'SYN-' || n, n::text, 'Synthetic Patient ' || n, '9' || lpad(n::text,9,'0'), now(), $1
    FROM generate_series(1,20000) AS n`, [user.id]);
  await pool.query(`INSERT INTO lab_orders(accession_no,uhid,patient_name,sample_date,created_by)
    VALUES('SYN-literal','LITERAL','Literal%Patient',now(),$1)`, [user.id]);
  await pool.query("UPDATE lab_orders SET deleted_at=now() WHERE uhid='12999'");
  await pool.query(`INSERT INTO lab_orders(accession_no,patient_name,mobile,sample_date,created_by)
    VALUES('SYN-family-a','Synthetic Family A','8888888888',now(),$1),
          ('SYN-family-b','Synthetic Family B','8888888888',now(),$1)`, [user.id]);
  await pool.query('ANALYZE lab_orders');
  const server = createApp().listen(0, '0.0.0.0');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); await pool.end(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = { Authorization: `Bearer ${jwt.sign({ id: user.id, role: 'TECHNICIAN' }, config.jwtSecret)}` };
  const request = async query => {
    const response = await fetch(`${base}/patient-history?query=${encodeURIComponent(query)}&match=prefix&limit=5`, { headers });
    const body = await response.json();
    assert.equal(response.status, 200, body.message);
    return body.data;
  };

  await t.test('one-character prefixes, exact priority, literal wildcards, deletion filtering and hard limit', async () => {
    for (const query of ['1', '12']) {
      const rows = await request(query);
      assert.equal(rows.length, 5);
      assert.equal(rows[0].uhid, query);
      assert.ok(rows.every(row => row.uhid.startsWith(query)));
    }
    assert.deepEqual(await request('12999'), []);
    assert.equal((await request('8888888888')).length, 2, 'A shared family mobile must not hide another patient');
    assert.equal((await request('literal%'))[0].name, 'Literal%Patient');
    assert.equal((await request('synthetic patient 12')).length, 5);
    assert.deepEqual(await request(''), []);
    const invalid = await fetch(`${base}/patient-history?query=1&match=prefix&limit=1000`, { headers });
    assert.equal(invalid.status, 400);
    const forbidden = await fetch(`${base}/patient-history?query=1&match=prefix&limit=5`);
    assert.equal(forbidden.status, 401);
  });

  await t.test('prefix indexes and server-side query limits are active', async () => {
    const plan = await pool.query(`EXPLAIN (FORMAT JSON) SELECT id FROM lab_orders WHERE deleted_at IS NULL
      AND (lower(uhid) LIKE '123%' OR lower(mobile) LIKE '123%' OR lower(patient_name) LIKE '123%' OR lower(accession_no) LIKE '123%')`);
    assert.match(JSON.stringify(plan.rows), /lab_orders_.*_prefix_idx/);
    assert.equal((await pool.query("SELECT current_setting('statement_timeout')::interval = ($1 || ' milliseconds')::interval AS matches", [config.databaseStatementTimeout])).rows[0].matches, true);
    assert.equal((await pool.query("SELECT current_setting('lock_timeout')::interval = ($1 || ' milliseconds')::interval AS matches", [config.databaseLockTimeout])).rows[0].matches, true);
    await assert.rejects(withTransaction(async client => {
      await client.query("SET LOCAL statement_timeout='50ms'");
      await client.query('SELECT pg_sleep(0.2)');
    }), error => error.code === '57014');
    assert.equal((await request('12')).length, 5, 'Pool remains usable after timeout and rollback');
  });

  await t.test('96 authenticated searches at concurrency 16 complete within the configured pool cap', async () => {
    const durations = [];
    let maximumConnections = 0;
    const started = performance.now();
    await Promise.all(Array.from({ length: 16 }, async (_, worker) => {
      for (let requestNumber = 0; requestNumber < 6; requestNumber += 1) {
        const start = performance.now();
        const rows = await request(String((worker % 9) + 1));
        assert.equal(rows.length, 5);
        durations.push(performance.now() - start);
        maximumConnections = Math.max(maximumConnections, pool.totalCount);
      }
    }));
    durations.sort((a, b) => a - b);
    assert.ok(maximumConnections <= config.databasePoolMax);
    assert.equal(pool.waitingCount, 0);
    console.log(JSON.stringify({ syntheticPatients: 20003, requests: durations.length, concurrency: 16, maximumConnections,
      p95Ms: Math.round(durations[Math.ceil(durations.length * .95) - 1]), elapsedMs: Math.round(performance.now() - started) }));
  });
});
