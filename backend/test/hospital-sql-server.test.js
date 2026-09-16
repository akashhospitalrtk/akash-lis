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
  assert.throws(() => patientSearchParameters('x'));
  for (const view of ['dbo.x;DELETE', 'other.dbo.x', 'dbo.[x]', 'dbo.x --']) assert.throws(() => patientSearchStatement(view));
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
    assert.equal(this.config.requestTimeout, 5000);
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
