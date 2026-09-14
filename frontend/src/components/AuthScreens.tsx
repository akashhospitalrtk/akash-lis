import { FormEvent, useState } from 'react';
import { api, setToken } from '../api';
import type { User } from '../types';

type SessionPayload = { token: string; user: User };

function submitError(error: unknown) { return error instanceof Error ? error.message : 'Could not complete that request.'; }

export function SetupScreen({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [form, setForm] = useState({ fullName: '', username: '', password: '', designation: 'Laboratory Administrator', signatureLabel: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const session = await api<SessionPayload>('/auth/bootstrap', { method: 'POST', body: JSON.stringify(form) });
      setToken(session.token); onSuccess(session.user);
    } catch (reason) { setError(submitError(reason)); } finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">First-time setup</p><h1>Create the laboratory administrator</h1><p className="muted">This account manages staff roles and departments, including doctors, technicians, authorizers and hospital IT.</p>
    <form onSubmit={submit} className="stack"><Field label="Full name" autoFocus value={form.fullName} onChange={(fullName) => setForm({ ...form, fullName })} /><Field label="Username" value={form.username} onChange={(username) => setForm({ ...form, username })} /><Field label="Password" type="password" hint="At least 8 characters" value={form.password} onChange={(password) => setForm({ ...form, password })} /><Field label="Designation" value={form.designation} onChange={(designation) => setForm({ ...form, designation })} /><Field label="Report signature label (optional)" value={form.signatureLabel} onChange={(signatureLabel) => setForm({ ...form, signatureLabel })} />
      {error && <p className="form-error">{error}</p>}<button disabled={busy}>{busy ? 'Creating account…' : 'Create administrator'}</button>
    </form></section></main>;
}

export function LoginScreen({ onSuccess }: { onSuccess: (user: User) => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const session = await api<SessionPayload>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); setToken(session.token); onSuccess(session.user); }
    catch (reason) { setError(submitError(reason)); } finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Laboratory Information System</p><h1>Welcome back</h1><p className="muted">Sign in to start today’s laboratory work.</p><form onSubmit={submit} className="stack"><Field label="Username" autoFocus value={username} onChange={setUsername} /><Field label="Password" type="password" value={password} onChange={setPassword} />{error && <p className="form-error">{error}</p>}<button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></section></main>;
}

export function Field({ label, value, onChange, type = 'text', hint, autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; hint?: string; autoFocus?: boolean }) {
  return <label className="field"><span>{label}</span><input required={label !== 'Designation' && !label.includes('optional')} autoFocus={autoFocus} type={type} value={value} onChange={(event) => onChange(event.target.value)} />{hint && <small>{hint}</small>}</label>;
}
