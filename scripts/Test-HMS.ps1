# Run from the LIS server. Read-only checks; no patient records or secrets are printed.
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')
try {
    Get-Service -Name Tailscale -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType
    @'
import net from 'node:net';
import sql from 'mssql';
import { config } from './dist/src/config/env.js';
import { patientSearchStatement } from './dist/src/integrations/hospitalSqlServer.js';
const settings = config.externalPatients.sqlServer;
console.log(JSON.stringify({ provider: config.externalPatients.provider, target: settings.server, port: settings.port }));
if (config.externalPatients.provider !== 'mssql') { console.log('SQL lookup is not enabled; check HOSPITAL_PATIENT_PROVIDER.'); process.exit(1); }
const reachable = await new Promise(resolve => {
  const socket = net.createConnection({ host: settings.server, port: settings.port });
  socket.setTimeout(5000);
  socket.once('connect', () => { console.log('Backend-to-HMS TCP: connected'); socket.destroy(); resolve(true); });
  socket.once('timeout', () => { console.log('Backend-to-HMS TCP: timeout'); socket.destroy(); resolve(false); });
  socket.once('error', error => { console.log(`Backend-to-HMS TCP: ${error.code || 'failed'}`); socket.destroy(); resolve(false); });
});
if (!reachable) process.exit(1);
const pool = new sql.ConnectionPool({ ...settings, connectionTimeout: 5000, requestTimeout: 5000, options: { encrypt: settings.encrypt, trustServerCertificate: settings.trustServerCertificate } });
pool.on('error', () => {});
try {
  await pool.connect();
  // TOP (0) validates mapped columns and SELECT permission without fetching patient data.
  await pool.request().input('exact', sql.NVarChar(160), '').input('prefix', sql.NVarChar(321), '').query(patientSearchStatement(settings.view).replace('TOP (20)', 'TOP (0)'));
  console.log('HMS login, patient view and read permission: OK');
} catch (error) {
  const codes = ['ELOGIN','ETIMEOUT','ESOCKET','EREQUEST','ENOTOPEN','ECONNCLOSED'];
  console.log(JSON.stringify({ hms: 'unavailable', code: codes.includes(error.code) ? error.code : 'FAILED', number: [208,229].includes(error.number) ? error.number : undefined }));
  process.exitCode = 1;
} finally { await pool.close().catch(() => undefined); }
'@ | docker compose exec -T backend node --input-type=module
    if ($LASTEXITCODE -ne 0) { throw 'HMS check failed. Check TCP routing/firewall, then SQL login/view permissions using the result above.' }
} finally { Pop-Location }
