import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatAge, formatDate, hasRole } from '../lib';
import type { Order, ClinicalNote, User } from '../types';
import { DoctorNotes } from './DoctorNotes';

type OrderPage = { items: Order[]; hasMore: boolean; page: number };
const statusLabel = (order: Order) => order.status === 'AUTHORIZED' ? 'Published' : order.amendment_count ? 'Amendment in progress' : order.status === 'COMPLETED' ? 'Awaiting authorization' : (order.sample_status || 'REGISTERED').replaceAll('_', ' ').toLowerCase();

export function DoctorWorkspace({ user, orderId, onSelect, onReport }: { user: User; orderId?: string; onSelect: (id?: string) => void; onReport: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrderPage>({ items: [], hasMore: false, page: 1 });
  const [order, setOrder] = useState<Order | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { setNote(''); setMessage(''); setOrder(null); }, [orderId]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = window.setTimeout(() => {
      const request = orderId ? api<Order>(`/clinical/orders/${orderId}`, { signal: controller.signal }).then((value) => { if (active) setOrder(value); })
        : api<OrderPage>(`/clinical/orders?query=${encodeURIComponent(query)}&status=${status}&page=${page}`, { signal: controller.signal }).then((value) => { if (active) setData(value); });
      void request.catch((reason: Error) => { if (active) { setOrder(null); setData({ items: [], hasMore: false, page }); setError(reason.message); } }).finally(() => { if (active) setLoading(false); });
    }, orderId ? 0 : 250);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [orderId, query, status, page, refresh]);
  useEffect(() => { const timer = window.setInterval(() => setRefresh((value) => value + 1), 30000); return () => window.clearInterval(timer); }, []);
  async function saveNote() {
    if (!orderId || !note.trim()) return;
    setBusy(true); setError('');
    try {
      const saved = await api<ClinicalNote>(`/clinical/orders/${orderId}/notes`, { method: 'POST', body: JSON.stringify({ body: note }) });
      setOrder((current) => current ? { ...current, clinical_notes: [...(current.clinical_notes || []), saved] } : current);
      setNote(''); setMessage('Clinical note added. It will appear on the report with your name and time.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add clinical note.'); }
    finally { setBusy(false); }
  }
  return <section className="page doctor-workspace">
    <div className="page-heading"><div><p className="eyebrow">Doctor workspace · Hospital-wide access</p><h1>{orderId ? 'Patient & order' : 'Patients & report status'}</h1><p className="muted">{user.departments?.map((d) => d.name).join(' · ') || 'Clinical care'} · Status refreshes every 30 seconds</p></div><div className="toolbar-actions">{orderId && <button className="secondary" disabled={busy} onClick={() => onSelect()}>Back to patients</button>}<button className="secondary" disabled={loading || busy} onClick={() => setRefresh((value) => value + 1)}>Refresh status</button></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}
    {!orderId && <><div className="card doctor-filters"><label className="field"><span>Find patient or report</span><input value={query} placeholder="Patient name, UHID or accession number" onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></label><label className="field"><span>Report status</span><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="ALL">All statuses</option><option value="PENDING">In progress</option><option value="COMPLETED">Awaiting authorization</option><option value="AUTHORIZED">Published</option></select></label></div>
      {loading ? <p role="status">Loading patients…</p> : <div className="card table-wrap"><table className="doctor-table"><thead><tr><th>Patient</th><th>Investigations</th><th>Registered</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td><strong>{item.patient_name}</strong><small>{item.uhid || 'No UHID'} · {item.accession_no}</small></td><td>{typeof item.tests === 'string' ? item.tests : ''}</td><td>{formatDate(item.sample_date)}</td><td><span className={`status status-${item.status.toLowerCase()}`}>{statusLabel(item)}</span></td><td><button className="secondary" onClick={() => onSelect(item.id)}>View patient</button></td></tr>)}</tbody></table>{!data.items.length && <p className="empty-state">No matching patient orders.</p>}</div>}
      <div className="doctor-pagination"><button className="secondary" disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button className="secondary" disabled={!data.hasMore || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div></>}
    {orderId && loading && !order && <p role="status">Loading patient…</p>}
    {orderId && order && <><div className="card doctor-patient"><div><h2>{order.patient_name}</h2><p>{order.uhid || 'No UHID'} · {formatAge(order)} · {order.gender || 'Sex not recorded'}</p><small>{order.accession_no} · {formatDate(order.sample_date, true)}</small><p>{typeof order.tests === 'string' ? order.tests : ''}</p></div><div><strong>{statusLabel(order)}</strong><p className="muted">{order.status === 'AUTHORIZED' ? `Published ${formatDate(order.authorized_at, true)}` : 'Results will be available after laboratory authorization.'}</p><button disabled={order.status !== 'AUTHORIZED' || loading || busy} onClick={() => onReport(order.id)}>View results & report</button></div></div>
      <section className="card doctor-notes-panel"><h2>Doctor clinical notes</h2><p className="muted">Notes appear on the report with their author and time. Add a new entry to correct an earlier note.</p><DoctorNotes notes={order.clinical_notes || []} />
        {hasRole(user, 'DOCTOR', 'ADMIN') && <form className="stack" onSubmit={(e) => { e.preventDefault(); void saveNote(); }}><label className="field"><span>Add clinical note</span><textarea required maxLength={5000} disabled={busy} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Record your clinical assessment or follow-up note" /></label><small>{note.length}/5000 characters · Saved as {user.fullName}</small><button disabled={busy || !note.trim()}>{busy ? 'Saving…' : 'Add note to report'}</button></form>}
      </section></>}
  </section>;
}
