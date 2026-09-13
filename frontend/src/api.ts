export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string, public readonly details?: { path: string; message: string }[]) {
    super(message); this.name = 'ApiError';
  }
}
const baseUrl = import.meta.env.VITE_API_URL || '/api';

export function getToken() { return localStorage.getItem('lis_token'); }
export function setToken(token: string) { localStorage.setItem('lis_token', token); }
export function clearToken() { localStorage.removeItem('lis_token'); }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message || `Request failed (${response.status})`, response.status, body.code, body.details);
  if (body.success === true && 'data' in body) return body.data as T;
  // Permit an older API during a rolling local restart.
  return body as T;
}

export async function download(path: string, fallbackFilename: string) {
  const token = getToken();
  const response = await fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.message || `Download failed (${response.status})`, response.status, body.code, body.details);
  }
  const filename = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1] || fallbackFilename;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename, rowCount: Number(response.headers.get('X-Export-Row-Count') || 0) };
}
