import { AppError } from '../core/AppError.js';
import { config } from '../config/env.js';
import { findSqlServerPatients } from '../integrations/hospitalSqlServer.js';

export async function findExternalPatients(query: string, options: { limit?: number; match?: 'exact' | 'prefix' } = {}) {
  if (config.externalPatients.provider === 'mssql') return findSqlServerPatients(query, options);
  if (config.externalPatients.provider === 'disabled') throw new AppError('Hospital patient lookup is disabled. Register the patient manually.', 503, 'SERVICE_UNAVAILABLE');
  if (!config.externalPatients.url) {
    throw new AppError('External patient lookup is not configured. Add HOSPITAL_PATIENT_API_URL to enable it.', 503, 'SERVICE_UNAVAILABLE');
  }
  const url = new URL(config.externalPatients.url);
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(options.limit ?? 20));
  url.searchParams.set('match', options.match ?? 'exact');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: config.externalPatients.token ? { Authorization: `Bearer ${config.externalPatients.token}` } : {}
  });
  if (!response.ok) throw new AppError('Hospital patient lookup is unavailable. Please try again.', 502, 'UPSTREAM_ERROR');
  const payload = await response.json();
  const items = Array.isArray(payload) ? payload : payload.items || [];
  return items.slice(0, options.limit ?? 20);
}
