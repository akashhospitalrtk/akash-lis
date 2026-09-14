import assert from 'node:assert/strict';

// Fixed isolated port: deliberately cannot be pointed at the live LIS.
const base = 'http://127.0.0.1:55446/api';
async function request(path, method = 'GET', body, token) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (response.headers.get('content-type')?.includes('application/pdf')) { assert.equal(response.status, 200); return Buffer.from(await response.arrayBuffer()); }
  const value = await response.json(); assert.ok(response.ok, JSON.stringify(value)); return value.data;
}
assert.equal((await request('/health')).database, 'connected');
const password = 'Synthetic-docker-only-123';
const admin = await request('/auth/bootstrap', 'POST', { username: 'docker_admin', fullName: 'Synthetic Docker Admin', password });
await request('/users', 'POST', { username: 'docker_doctor', fullName: 'Synthetic Docker Doctor', password, role: 'DOCTOR' }, admin.token);
const doctor = await request('/auth/login', 'POST', { username: 'docker_doctor', password });
const profiles = await request('/profiles', 'GET', undefined, admin.token);
const order = await request('/orders', 'POST', { patientName: 'Synthetic Docker Patient', sampleDate: new Date().toISOString(), profileIds: [profiles.find((p) => p.code === 'UPT').id], entryMode: 'RESULTS' }, admin.token);
await request(`/orders/${order.id}/results`, 'PUT', { results: [{ id: order.tests[0].results[0].id, value: 'Negative' }] }, admin.token);
await request(`/orders/${order.id}/authorize`, 'POST', undefined, admin.token);
await request(`/clinical/orders/${order.id}/notes`, 'POST', { body: 'Synthetic Docker note. पुनः जाँच। μmol/L.' }, doctor.token);
const pdf = await request(`/clinical/orders/${order.id}/report.pdf`, 'GET', undefined, doctor.token);
assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.length > 3000);
console.log('PASS: production Docker migration/startup, database health, doctor login, published results, clinical notes and PDF generation with bundled fonts.');
