import { useState } from 'react';
import { api } from '../api';
import type { Order, Profile, User } from '../types';
import { isDetailOrder } from '../lib';

export function OrderActions({ order, user, onUpdated, onDeleted, hasUnsaved }: { order: Order; user: User; onUpdated: (order: Order) => void; onDeleted: () => void; hasUnsaved: boolean }) {
  const [action, setAction] = useState<'tests' | 'references' | 'delete' | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canEdit = order.status !== 'AUTHORIZED' && ['ADMIN', 'TECHNICIAN'].includes(user.role);
  async function open(next: typeof action) {
    if (hasUnsaved && !window.confirm('There are unsaved result edits. Continuing will discard them when the action is applied. Continue?')) return;
    setError(''); setReason(''); setQuery('');
    if (next === 'tests') {
      setBusy(true);
      try { setProfiles(await api<Profile[]>('/profiles')); setSelected(isDetailOrder(order) ? order.tests.map((t) => t.profile_id) : []); }
      catch (e) { setError(e instanceof Error ? e.message : 'Cannot load tests.'); return; }
      finally { setBusy(false); }
    }
    setAction(next);
  }
  async function apply() {
    setBusy(true); setError('');
    try {
      if (action === 'delete') { await api(`/orders/${order.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }); onDeleted(); }
      else {
        const updated = await api<Order>(`/orders/${order.id}/${action === 'tests' ? 'tests' : 'refresh-references'}`, { method: action === 'tests' ? 'PUT' : 'POST', body: JSON.stringify({ reason, profileIds: selected }) });
        onUpdated(updated);
      }
      setAction(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not apply the change.'); }
    finally { setBusy(false); }
  }
  const removed = isDetailOrder(order) ? order.tests.filter((t) => !selected.includes(t.profile_id)) : [];
  return <section className="order-actions">
    <div className="toolbar-actions">{canEdit && <><button className="secondary" disabled={busy} onClick={() => void open('tests')}>Change tests</button><button className="secondary" disabled={busy} onClick={() => void open('references')}>Refresh reference ranges</button></>}{user.role === 'ADMIN' && <button className="text-button" disabled={busy} onClick={() => void open('delete')}>Delete report</button>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {action && <form className="card order-action-panel" onSubmit={(event) => { event.preventDefault(); void apply(); }}>
      <h2>{action === 'tests' ? 'Change ordered tests' : action === 'references' ? 'Refresh reference ranges' : 'Delete report'}</h2>
      {action === 'tests' ? <><p>Retained tests keep their saved results. Added tests start blank and may require a different specimen; confirm collection before entering results.</p><label className="field"><span>Find investigation</span><input value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="order-test-options">{profiles.filter((p) => `${p.name} ${p.code} ${p.department}`.toLowerCase().includes(query.toLowerCase())).map((p) => <label key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={() => setSelected((ids) => ids.includes(p.id) ? ids.filter((id) => id !== p.id) : [...ids, p.id])} />{p.name} <small>{p.department} · {p.specimen_type}</small></label>)}</div>{isDetailOrder(order) && order.tests.filter((t) => !profiles.some((p) => p.id === t.profile_id)).map((t) => <label key={t.id}><input type="checkbox" checked={selected.includes(t.profile_id)} onChange={() => setSelected((ids) => ids.includes(t.profile_id) ? ids.filter((id) => id !== t.profile_id) : [...ids, t.profile_id])} />{t.profile_name} (archived)</label>)}{removed.length > 0 && <p className="notice">Will remove: {removed.map((t) => t.profile_name).join(', ')}. Their saved results will be retained in audit history.</p>}</> : action === 'references' ? <p>Copy the latest catalogue ranges and interpretation notes into this report and recalculate flags. Measured values stay unchanged. This requires matching units and result types.</p> : <p>Remove {order.accession_no} for {order.patient_name} from active worklists and reports. The stored results and audit history will be retained. Previously printed copies cannot be recalled here.</p>}
      <label className="field"><span>Reason *</span><textarea required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="toolbar-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setAction(null)}>Cancel</button><button disabled={busy || (action === 'tests' && !selected.length)}>{busy ? 'Applying…' : action === 'delete' ? 'Confirm delete report' : 'Apply changes'}</button></div>
    </form>}
  </section>;
}
