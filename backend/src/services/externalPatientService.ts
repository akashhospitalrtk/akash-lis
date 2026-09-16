import { AppError } from '../core/AppError.js';
import { config } from '../config/env.js';
import { findSqlServerPatients } from '../integrations/hospitalSqlServer.js';

export async function findExternalPatients(query: string) {
  if (config.externalPatients.provider === 'mssql') return findSqlServerPatients(query);
  if (config.externalPatients.provider === 'disabled') throw new AppError('Hospital patient lookup is disabled. Register the patient manually.', 503, 'SERVICE_UNAVAILABLE');
  if (!config.externalPatients.url) {
    throw new AppError('External patient lookup is not configured. Add HOSPITAL_PATIENT_API_URL to enable it.', 503, 'SERVICE_UNAVAILABLE');
  }
  const url = new URL(config.externalPatients.url);
  url.searchParams.set('query', query);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: config.externalPatients.token ? { Authorization: `Bearer ${config.externalPatients.token}` } : {}
  });
  if (!response.ok) throw new AppError('Hospital patient lookup is unavailable. Please try again.', 502, 'UPSTREAM_ERROR');
  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.items || [];
}
