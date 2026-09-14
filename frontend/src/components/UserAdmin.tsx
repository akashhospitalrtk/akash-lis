import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { roleLabel } from '../lib';
import type { Department, Role, User } from '../types';

type ManagedUser = { id: string; username: string; full_name: string; role: Role; designation?: string | null; signature_label?: string | null; active: boolean; departments: Department[] };
const blank = () => ({ fullName: '', username: '', password: '', role: 'TECHNICIAN' as Role, designation: '', signatureLabel: '', departmentIds: [] as string[], active: true });
const grants: Record<Role, string> = {
  ADMIN: 'Laboratory administration, patient access and staff management.',
  IT: 'Manage departments and clinical staff accounts. No patient or report access.',
  DOCTOR: 'patient.view · result.view · report.print · report.download · status.view · clinical_notes.write. Hospital-wide access; published results only.',
  TECHNICIAN: 'Register patients, receive samples and enter results.',
  AUTHORIZER: 'Review, authorize, print and download laboratory reports.'
};
export function UserAdmin({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const roles: Role[] = currentUser.role === 'ADMIN' ? ['DOCTOR', 'TECHNICIAN', 'AUTHORIZER', 'IT', 'ADMIN'] : ['DOCTOR', 'TECHNICIAN', 'AUTHORIZER'];
  async function load() {
    try { const [accounts, groups] = await Promise.all([api<ManagedUser[]>('/users'), api<Department[]>('/departments')]); setUsers(accounts); setDepartments(groups); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load staff.'); }
  }
  useEffect(() => { void load(); }, []);
  function edit(account: ManagedUser) {
    setEditing(account.id); setError(''); setMessage('');
    setForm({ fullName: account.full_name, username: account.username, password: '', role: account.role, designation: account.designation || '', signatureLabel: account.signature_label || '', active: account.active, departmentIds: account.departments.map((d) => d.id) });
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      await api(editing ? `/users/${editing}` : '/users', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(form) });
      setMessage(editing ? 'Staff access updated. Changes apply on the next request.' : 'Staff account created. Share credentials privately with this person.');
      setEditing(null); setForm(blank()); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save staff account.'); }
    finally { setBusy(false); }
  }
  async function addDepartment(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try { await api('/departments', { method: 'POST', body: JSON.stringify({ name: departmentName }) }); setDepartmentName(''); await load(); setMessage('Department created.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create department.'); }
    finally { setBusy(false); }
  }
  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Access control</p><h1>Staff & departments</h1></div><p className="muted">Individual accounts, assigned roles and department membership.</p></div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}
    <div className="user-layout">
      <section className="card"><h2>{editing ? 'Edit staff access' : 'Create staff account'}</h2>
        <form className="stack" onSubmit={submit}>
          <label className="field"><span>Full name</span><input required maxLength={120} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
          <label className="field"><span>Username</span><input required minLength={3} maxLength={60} disabled={Boolean(editing)} autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          {!editing && <label className="field"><span>Initial password</span><input required minLength={8} maxLength={200} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>}
          <label className="field"><span>Role</span><select aria-label="Role" disabled={editing === currentUser.id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
          <p className="permission-preview">{grants[form.role]}</p>
          <fieldset className="department-options"><legend>Assigned departments</legend>{departments.length ? departments.map((department) => <label key={department.id}><input type="checkbox" checked={form.departmentIds.includes(department.id)} onChange={(e) => setForm({ ...form, departmentIds: e.target.checked ? [...form.departmentIds, department.id] : form.departmentIds.filter((id) => id !== department.id) })} />{department.name}</label>) : <p className="muted">Create departments below to assign staff.</p>}</fieldset>
          <small>Departments identify staff affiliation. Doctors can view patients across the whole hospital.</small>
          <label className="field"><span>Designation</span><input maxLength={120} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></label>
          {['ADMIN', 'AUTHORIZER'].includes(form.role) && <label className="field"><span>Laboratory signature label</span><input maxLength={160} value={form.signatureLabel} onChange={(e) => setForm({ ...form, signatureLabel: e.target.value })} /></label>}
          {editing && <label className="inline-check"><input type="checkbox" disabled={editing === currentUser.id} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Account active</label>}
          <div className="toolbar-actions"><button disabled={busy}>{busy ? 'Saving…' : editing ? 'Save access' : 'Create user'}</button>{editing && <button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(null); setForm(blank()); }}>Cancel</button>}</div>
        </form>
      </section>
      <section className="card"><h2>Staff accounts</h2><div className="user-list">{users.map((account) => <div key={account.id}><strong>{account.full_name}</strong><span>{account.username} · {roleLabel(account.role)} · {account.active ? 'Active' : 'Disabled'}</span><small>{account.departments.map((d) => d.name).join(', ') || 'No department assigned'}</small>{(currentUser.role === 'ADMIN' || !['ADMIN', 'IT'].includes(account.role)) && <button className="text-button" disabled={busy} onClick={() => edit(account)} aria-label={`Edit ${account.full_name}`}>Edit access</button>}</div>)}</div>
        <form onSubmit={addDepartment} className="stack department-create"><h2>Departments</h2><label className="field"><span>New department</span><input required minLength={2} maxLength={80} value={departmentName} placeholder="e.g. Medicine, Pediatrics" onChange={(e) => setDepartmentName(e.target.value)} /></label><button className="secondary" disabled={busy}>Add department</button></form>
      </section>
    </div>
  </section>;
}
