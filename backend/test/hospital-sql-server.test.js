import test from 'node:test';
import assert from 'node:assert/strict';
import { patientSearchStatement, patientSearchParameters, parseHospitalPatients } from '../dist/src/integrations/hospitalSqlServer.js';
import { envSchema } from '../dist/src/schemas/envSchema.js';
import sql from 'mssql';
import { config } from '../dist/src/config/env.js';
import { findSqlServerPatients, closeHospitalSqlServer } from '../dist/src/integrations/hospitalSqlServer.js';

test('HMS search binds input and escapes wildcard searches', () => {
  const attack = "ab'; DELETE FROM patients;--";
  assert.equal(patientSearchParameters(attack).exact, attack);
  const query = patientSearchStatement('dbo.LisPatientLookup');
  assert.ok(!query.includes(attack));
  assert.match(query, /TOP \(20\)/);
  assert.match(query, /FROM \[dbo\]\.\[LisPatientLookup\]/);
  assert.equal(patientSearchParameters('A%_[').prefix, 'A~%~_~[%');
  assert.equal(patientSearchParameters('A~B').prefix, 'A~~B%');
  assert.equal(patientSearchParameters('1').prefix, '1%');
  assert.equal(patientSearchParameters('12').prefix, '12%');
  assert.throws(() => patientSearchParameters(''));
  const prefixQuery = patientSearchStatement('dbo.LisPatientLookup', 5, 'prefix');
  assert.match(prefixQuery, /TOP \(5\)/);
  assert.match(prefixQuery, /\[uhid\] LIKE @prefix ESCAPE '~'/);
  assert.match(prefixQuery, /\[mobile\] LIKE @prefix ESCAPE '~'/);
  for (const limit of [0, 21, 1.5, '5;DELETE']) assert.throws(() => patientSearchStatement('dbo.LisPatientLookup', limit, 'prefix'));
  for (const view of ['dbo.x;DELETE', 'other.dbo.x', 'dbo.[x]', 'dbo.x --']) assert.throws(() => patientSearchStatement(view));
});

test('SQL Server lookup recovers from a dropped connection without retrying slow queries or login failures', async (t) => {
  await closeHospitalSqlServer();
  let connections = 0, requests = 0, closes = 0;
  let failure = { code: 'ESOCKET' };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async function () { connections += 1; return this; });
  t.mock.method(sql.ConnectionPool.prototype, 'close', async () => { closes += 1; });
  t.mock.method(sql.ConnectionPool.prototype, 'request', () => ({
    input() { return this; },
    async query() { requests += 1; if (failure) { const error = failure; failure = null; throw error; } return { recordset: [infant] }; }
  }));
  try {
    assert.deepEqual(await findSqlServerPatients('1', { limit: 5, match: 'prefix' }), [infant]);
    assert.equal(connections, 2);
    assert.equal(requests, 2);
    assert.equal(closes, 1);
    failure = { code: 'ETIMEOUT', name: 'RequestError' };
    await assert.rejects(findSqlServerPatients('12'), (error) => error.code === 'UPSTREAM_TIMEOUT');
    assert.equal(requests, 3);
    failure = { code: 'ELOGIN' };
    await assert.rejects(findSqlServerPatients('12'), (error) => error.code === 'UPSTREAM_AUTH_ERROR');
    assert.equal(requests, 4);
  } finally { await closeHospitalSqlServer(); }
});

const infant = { id: 'synthetic-1', uhid: 'TEST-1', name: 'Synthetic Infant', age: 3, age_unit: 'days', gender: 'Female', mobile: null, referringDoctor: null, patientType: 'OPD' };
test('HMS mapping preserves age units, rejects malformed records and strips extra fields', () => {
  const [row] = parseHospitalPatients([{ ...infant, privateHmsField: 'must not leave adapter' }]);
  assert.deepEqual(row, infant);
  assert.equal(parseHospitalPatients([{ ...infant, age: null }])[0].age, null);
  for (const data of [{ ...infant, id: null }, { ...infant, age: -1 }, { ...infant, gender: 'F' }, { ...infant, age_unit: 'month' }]) {
    assert.throws(() => parseHospitalPatients([data]), (error) => error.statusCode === 502 && !error.message.includes('synthetic'));
  }
  assert.throws(() => parseHospitalPatients(Array(21).fill(infant)));
});

test('SQL Server remains optional and its credentials are required only when enabled', () => {
  assert.equal(envSchema.parse({}).HOSPITAL_PATIENT_PROVIDER, 'api');
  assert.equal(envSchema.parse({ HOSPITAL_PATIENT_PROVIDER: 'disabled' }).HMS_SQL_ENCRYPT, 'true');
  assert.throws(() => envSchema.parse({ HOSPITAL_PATIENT_PROVIDER: 'mssql' }));
  const enabled = envSchema.parse({ HOSPITAL_PATIENT_PROVIDER: 'mssql', HMS_SQL_SERVER: 'synthetic-host', HMS_SQL_DATABASE: 'synthetic-db', HMS_SQL_USER: 'synthetic-user', HMS_SQL_PASSWORD: 'synthetic-password' });
  assert.equal(enabled.HMS_SQL_TRUST_SERVER_CERTIFICATE, 'false');
});

test('SQL Server adapter executes a bound SELECT and hides driver errors', async (t) => {
  const previous = config.externalPatients.sqlServer.server;
  config.externalPatients.sqlServer.server = 'synthetic.invalid';
  const bound = {};
  let statement;
  let fail = false;
  const request = {
    input(name, _type, value) { bound[name] = value; return this; },
    async query(value) { statement = value; if (fail) throw new Error('secret connection details'); return { recordset: [infant] }; }
  };
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async function () {
    assert.equal(this.config.pool.max, 2);
    assert.equal(this.config.requestTimeout, config.externalPatients.sqlServer.requestTimeout);
    return this;
  });
  t.mock.method(sql.ConnectionPool.prototype, 'request', () => request);
  t.mock.method(sql.ConnectionPool.prototype, 'close', async () => undefined);
  try {
    assert.deepEqual(await findSqlServerPatients('TEST-1'), [infant]);
    assert.equal(bound.exact, 'TEST-1');
    assert.equal(bound.prefix, 'TEST-1%');
    assert.match(statement, /^SELECT/);
    assert.ok(!statement.includes('TEST-1'));
    fail = true;
    await assert.rejects(findSqlServerPatients('TEST-1'), (error) => error.statusCode === 502 && !error.message.includes('secret'));
  } finally {
    await closeHospitalSqlServer();
    config.externalPatients.sqlServer.server = previous;
  }
});
