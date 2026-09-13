import { AppError } from '../core/AppError.js';
import { config } from '../config/env.js';

export async function findExternalPatients(query: string) {
  if (!config.externalPatients.url) {
    throw new AppError('External patient lookup is not configured. Add HOSPITAL_PATIENT_API_URL to enable it.', 503, 'SERVICE_UNAVAILABLE');
  }
  const url = new URL(config.externalPatients.url);
  url.searchParams.set('query', query);
  const response = await fetch(url, {
    headers: config.externalPatients.token ? { Authorization: `Bearer ${config.externalPatients.token}` } : {}
  });
  if (!response.ok) throw new AppError('Hospital patient lookup is unavailable. Please try again.', 502, 'UPSTREAM_ERROR');
  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.items || [];
}
