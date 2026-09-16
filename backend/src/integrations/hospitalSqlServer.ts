import sql from 'mssql';
import { z } from 'zod';
import { config } from '../config/env.js';
import { AppError } from '../core/AppError.js';

// Explicit projection prevents unrelated HMS columns from reaching a browser.
const patientRow = z.object({
  id: z.string().trim().min(1).max(120),
  uhid: z.string().max(80).nullable(),
  name: z.string().trim().min(2).max(160),
  age: z.number().finite().min(0).max(47483).nullable(),
  age_unit: z.enum(['days', 'weeks', 'months', 'years']),
  gender: z.enum(['Male', 'Female', 'Other']).nullable(),
  mobile: z.string().max(30).nullable(),
  referringDoctor: z.string().max(160).nullable(),
  patientType: z.enum(['OPD', 'IPD', 'Emergency', 'Health check']).nullable()
});

export function patientSearchStatement(view: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(view)) throw new Error('Invalid HMS patient view');
  const identifier = view.split('.').map((part) => `[${part}]`).join('.');
  return `SELECT TOP (20) [id], [uhid], [name], [age], [age_unit], [gender], [mobile], [referringDoctor], [patientType]
    FROM ${identifier}
    WHERE [uhid] = @exact OR [mobile] = @exact OR [name] LIKE @prefix ESCAPE '~'
    ORDER BY CASE WHEN [uhid] = @exact THEN 0 WHEN [mobile] = @exact THEN 1 ELSE 2 END, [name], [id]`;
}

export function patientSearchParameters(query: string) {
  const exact = z.string().trim().min(2).max(160).parse(query);
  return { exact, prefix: exact.replace(/[~%_\[]/g, (char) => `~${char}`) + '%' };
}

export function parseHospitalPatients(rows: unknown) {
  const result = z.array(patientRow).max(20).safeParse(rows);
  if (!result.success) throw new AppError('Hospital patient fields do not match the configured mapping. Ask the administrator to check the HMS view.', 502, 'UPSTREAM_MAPPING_ERROR');
  return result.data;
}

let poolPromise: Promise<sql.ConnectionPool> | undefined;
function getPool() {
  if (!poolPromise) {
    const settings = config.externalPatients.sqlServer;
    const pool = new sql.ConnectionPool({
      server: settings.server, port: settings.port, database: settings.database,
      user: settings.user, password: settings.password,
      connectionTimeout: 5000, requestTimeout: 5000,
      pool: { max: 2, min: 0, idleTimeoutMillis: 30000 },
      options: { encrypt: settings.encrypt, trustServerCertificate: settings.trustServerCertificate }
    });
    // Do not log driver errors, connection strings or patient search terms.
    pool.on('error', () => console.error('HMS SQL Server pool error'));
    poolPromise = pool.connect().catch(async (error: unknown) => {
      poolPromise = undefined;
      await pool.close().catch(() => undefined);
      throw error;
    });
  }
  return poolPromise;
}

export async function findSqlServerPatients(query: string) {
  const { exact, prefix } = patientSearchParameters(query);
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('exact', sql.NVarChar(160), exact)
      .input('prefix', sql.NVarChar(321), prefix)
      .query(patientSearchStatement(config.externalPatients.sqlServer.view));
    return parseHospitalPatients(result.recordset);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Hospital patient lookup is unavailable. Check the HMS connection or register the patient manually.', 502, 'UPSTREAM_ERROR');
  }
}

export async function closeHospitalSqlServer() {
  const pending = poolPromise;
  poolPromise = undefined;
  if (pending) await pending.then((pool) => pool.close()).catch(() => undefined);
}
