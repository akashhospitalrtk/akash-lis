import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import { createApp } from '../dist/src/app.js';
import { config } from '../dist/src/config/env.js';
import { pool } from '../dist/src/database/pool.js';
import { prisma } from '../dist/src/database/prisma.js';
import { AppError } from '../dist/src/core/AppError.js';
import { ApiResponse } from '../dist/src/core/ApiResponse.js';
import { asyncHandler } from '../dist/src/core/asyncHandler.js';
import { errorHandler } from '../dist/src/middleware/errorHandler.js';
import express from 'express';

const url = new URL(config.databaseUrl);
assert.ok(url.pathname.endsWith('_test') && ['localhost', '127.0.0.1', ...(process.env.LIS_CONTAINER_TEST === '1' ? ['db'] : [])].includes(url.hostname), 'Disposable test database only.');

test('production app layers, authentication, envelopes and direct entry', async (t) => {
  await pool.query(await fs.readFile(new URL('../../database/001_schema.sql', import.meta.url), 'utf8'));
  await pool.query(await fs.readFile(new URL('../../database/002_seed_profiles.sql', import.meta.url), 'utf8'));
  const server = createApp().listen(0, '0.0.0.0'); await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await prisma.$disconnect(); await pool.end(); });
  let token;
  async function request(path, method = 'GET', body, authorization = token) {
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
  }
  await t.test('shared success envelope and centralized authentication errors', async () => {
    const health = await request('/health'); assert.equal(health.status, 200); assert.equal(health.body.success, true); assert.equal(health.body.data.database, 'connected');
    const denied = await request('/profiles'); assert.equal(denied.status, 401); assert.equal(denied.body.success, false); assert.equal(denied.body.code, 'UNAUTHORIZED');
    const badJson = await request('/auth/login', 'POST', '{broken'); assert.equal(badJson.status, 400); assert.equal(badJson.body.code, 'INVALID_JSON');
    assert.equal((await request('/missing')).body.code, 'NOT_FOUND');
  });
  await t.test('bootstrap is atomic, user creation/login share account rules', async () => {
    const account = { username: 'architecture_fixture', password: 'Synthetic-test-only-123', fullName: 'Architecture Fixture', role: 'TECHNICIAN' };
    const attempts = await Promise.all([request('/auth/bootstrap', 'POST', account), request('/auth/bootstrap', 'POST', { ...account, username: 'architecture_fixture_two' })]);
    assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 409]);
    const session = attempts.find((r) => r.status === 201).body.data; token = session.token; assert.equal(session.user.role, 'ADMIN');
    const me = await request('/auth/me'); assert.equal(me.body.data.user.id, session.user.id);
    const user = await request('/users', 'POST', { ...account, username: 'architecture_technician', role: 'TECHNICIAN' }); assert.equal(user.status, 201); assert.equal(user.body.data.password_hash, undefined);
    const login = await request('/auth/login', 'POST', { username: 'architecture_technician', password: account.password }); assert.equal(login.status, 200);
    assert.equal((await request('/users', 'GET', undefined, login.body.data.token)).status, 403);
    assert.equal((await request('/auth/login', 'POST', { username: 'architecture_technician', password: 'wrong' })).status, 401);
    assert.equal((await request('/users', 'POST', { ...account, username: 'architecture_technician' })).body.code, 'CONFLICT');
  });
  const profileId = (await request('/profiles')).body.data.find((p) => p.code === 'UPT').id;
  let direct;
  await t.test('Zod body/query/ID validation is shared and rejects malformed claims', async () => {
    const invalid = await request('/orders', 'POST', { patientName: 'x' }); assert.equal(invalid.status, 400); assert.equal(invalid.body.code, 'VALIDATION_ERROR'); assert.ok(invalid.body.details.some((issue) => issue.path === 'patientName'));
    assert.equal((await request('/orders/not-a-uuid')).status, 400);
    assert.equal((await request('/worklist?status=unexpected')).status, 400);
    assert.equal((await request('/profiles', 'GET', undefined, jwt.sign({ role: 'ADMIN' }, config.jwtSecret))).status, 401);
  });
  await t.test('direct entry atomically registers, accepts and starts processing', async () => {
    const input = { patientName: 'Synthetic Direct Entry', sampleDate: new Date().toISOString(), ageValue: 6, ageUnit: 'months', profileIds: [profileId], entryMode: 'RESULTS' };
    const result = await request('/orders', 'POST', input); assert.equal(result.status, 201, JSON.stringify(result.body)); direct = result.body.data;
    assert.equal(direct.sample_status, 'IN_PROCESS'); assert.ok(direct.sample_received_at); assert.equal(direct.tests[0].results[0].result_value, null);
    assert.deepEqual(direct.audit.map((a) => a.event_type).sort(), ['ORDER_CREATED', 'SAMPLES_ACCEPTED', 'SAMPLE_PROCESSING_STARTED']);
    const before = (await pool.query('SELECT count(*)::int AS n FROM lab_orders')).rows[0].n;
    const missing = await request('/orders', 'POST', { ...input, profileIds: ['00000000-0000-4000-8000-000000000099'] }); assert.equal(missing.status, 400);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM lab_orders')).rows[0].n, before);
    const manual = (await request('/orders', 'POST', { ...input, entryMode: 'SAMPLE' })).body.data; assert.equal(manual.sample_status, 'REGISTERED');
    const prepared = (await request(`/orders/${manual.id}/prepare-entry`, 'POST')).body.data; assert.equal(prepared.sample_status, 'IN_PROCESS');
    const again = (await request(`/orders/${manual.id}/prepare-entry`, 'POST')).body.data; assert.equal(again.audit.length, prepared.audit.length);
  });
  await t.test('report amendment reopens processing and allows measured-value correction', async () => {
    const value = direct.tests[0].results[0];
    const saved = await request(`/orders/${direct.id}/results`, 'PUT', { results: [{ id: value.id, value: 'Negative' }] }); assert.equal(saved.status, 200);
    assert.equal((await request(`/orders/${direct.id}/authorize`, 'POST')).status, 200);
    assert.equal((await request(`/orders/${direct.id}/prepare-entry`, 'POST')).status, 409);
    const amended = await request(`/orders/${direct.id}/amend`, 'POST', { reason: 'Correct synthetic repeated measurement' }); assert.equal(amended.status, 200); assert.equal(amended.body.data.sample_status, 'IN_PROCESS');
    assert.equal((await request(`/orders/${direct.id}/results`, 'PUT', { results: [{ id: value.id, value: 'Positive' }] })).status, 200);
    assert.equal((await request(`/orders/${direct.id}/authorize`, 'POST')).status, 200);
  });
});

test('response/error classes forward async failures and hide unexpected details', async () => {
  const app = express();
  app.get('/expected', asyncHandler(async () => { throw AppError.conflict('Controlled conflict'); }));
  app.get('/unexpected', asyncHandler(async () => { throw new Error('private SQL password text'); }));
  app.get('/created', (_req, res) => ApiResponse.created({ id: 'fixture' }).send(res));
  app.get('/empty', (_req, res) => ApiResponse.noContent(res));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const expected = await fetch(`${base}/expected`); assert.equal(expected.status, 409); assert.equal((await expected.json()).message, 'Controlled conflict');
    const unexpected = await fetch(`${base}/unexpected`); assert.equal(unexpected.status, 500); assert.doesNotMatch(await unexpected.text(), /private|SQL|password/);
    const created = await fetch(`${base}/created`); assert.equal(created.status, 201); assert.deepEqual((await created.json()).data, { id: 'fixture' });
    const empty = await fetch(`${base}/empty`); assert.equal(empty.status, 204); assert.equal(await empty.text(), '');
  } finally { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
});
