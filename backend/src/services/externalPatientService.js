import { config } from '../config.js';

export async function findExternalPatients(query) {
  if (!config.externalPatients.url) {
    const error = new Error('External patient lookup is not configured. Add HOSPITAL_PATIENT_API_URL to enable it.');
    error.status = 503;
    throw error;
  }
  const url = new URL(config.externalPatients.url);
  url.searchParams.set('query', query);
  const response = await fetch(url, {
    headers: config.externalPatients.token ? { Authorization: `Bearer ${config.externalPatients.token}` } : {}
  });
  if (!response.ok) throw new Error(`Hospital patient lookup returned ${response.status}.`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.items || [];
}
