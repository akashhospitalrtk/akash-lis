import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { formatAge, formatDate, hasRole } from '../lib';
import type { Order, User } from '../types';

const today = new Date().toISOString().slice(0, 10);

export function Worklist({ onOpen, reloadKey, user }: { onOpen: (id: string, destination?: 'entry' | 'report') => void; reloadKey: number; user: User }) {
  const [date, setDate] = useState(today); const [status, setStatus] = useState('ALL'); const [sampleStatus, setSampleStatus] = useState('ALL'); const [query, setQuery] = useState(''); const [orders, setOrders] = useState<Order[]>([]); const [selected, setSelected] = useState<string[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [accepting, setAccepting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setOrders(await api<Order[]>(`/worklist?date=${date}&status=${status}&sampleStatus=${sampleStatus}&query=${encodeURIComponent(query)}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load worklist.'); } finally { setLoading(false); }
  }, [date, status, sampleStatus, query]);
  useEffect(() => { void load(); }, [load, reloadKey]);
  const counts = { PENDING: orders.filter((order) => order.status === 'PENDING').length, COMPLETED: orders.filter((order) => order.status === 'COMPLETED').length, AUTHORIZED: orders.filter((order) => order.status === 'AUTHORIZED').length, PRINTED: orders.filter((order) => order.printed_at).length };
  const registered = orders.filter((order) => order.sample_status === 'REGISTERED').map((order) => order.id);
  const canAccept = hasRole(user, 'ADMIN', 'TECHNICIAN');
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  function toggleAll() { setSelected((current) => current.length === registered.length ? [] : registered); }
  async function acceptSamples(orderIds: string[] = selected) {
    if (!orderIds.length) return;
    setAccepting(true); setError('');
    try { const response = await api<{ accepted: number }>('/orders/samples/accept', { method: 'POST', body: JSON.stringify({ orderIds }) }); setSelected((current) => current.filter((id) => !orderIds.includes(id))); await load(); if (!response.accepted) setError('The selected samples were already accepted or are no longer available.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not accept samples.'); }
    finally { setAccepting(false); }
  }
  return <section className="page"><div className="page-heading"><div><p className="eyebrow">Step 2 of 4: specimen receipt</p><h1>Sample reception</h1><p className="muted">After creating an order, accept its specimen here. Then open the collected order for result entry.</p></div><button className="secondary" onClick={() => void load()}>Refresh</button></div>
    <div className="stat-row" aria-label="Report counts for current filters">{Object.entries(counts).map(([label, count]) => <button key={label} className={`stat ${status === label ? 'active' : ''}`} aria-pressed={status === label} onClick={() => setStatus(status === label ? 'ALL' : label)}><strong>{loading || error ? '\u2014' : count}</strong><span>{label.toLowerCase()}</span></button>)}</div>
    <div className="queue-heading"><h2>Sample queue</h2><span>Counts reflect the current filters</span></div>
    <div className="filters"><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Report status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All reports</option><option value="PENDING">Pending entry</option><option value="COMPLETED">Ready to authorize</option><option value="AUTHORIZED">Authorized</option><option value="PRINTED">Printed</option></select></label><label>Sample status<select value={sampleStatus} onChange={(event) => setSampleStatus(event.target.value)}><option value="ALL">All samples</option><option value="REGISTERED">Registered</option><option value="COLLECTED">Collected</option><option value="IN_PROCESS">In process</option><option value="RESULTS_PENDING">Results pending</option><option value="APPROVED">Approved</option><option value="DELIVERED">Delivered</option></select></label><label className="grow">Search accession, UHID or patient<input placeholder="Type to search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(); }} /></label></div>
    {canAccept && registered.length > 0 && <div className="batch-actions"><label><input type="checkbox" checked={registered.length > 0 && selected.length === registered.length} onChange={toggleAll} /> Select registered samples ({registered.length})</label><button disabled={!selected.length || accepting} onClick={() => void acceptSamples()}>{accepting ? 'Accepting…' : `Accept ${selected.length || ''} sample${selected.length === 1 ? '' : 's'}`}</button></div>}
    {error && <p className="form-error">{error}</p>}
    <div className="table-wrap sample-worklist"><table><thead><tr><th /><th>Accession</th><th>Patient</th><th>Tests</th><th>Registered</th><th>Workflow</th><th /></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="empty">Loading worklist…</td></tr> : error ? <tr><td colSpan={7} className="empty">Worklist unavailable. Refresh to try again.</td></tr> : orders.length === 0 ? <tr><td colSpan={7} className="empty">No orders match this view.</td></tr> : orders.map((order) => <tr key={order.id}><td>{canAccept && order.sample_status === 'REGISTERED' && <input aria-label={`Select ${order.accession_no} for sample acceptance`} type="checkbox" checked={selected.includes(order.id)} onChange={() => toggle(order.id)} />}</td><td><strong>{order.accession_no}</strong><small>{order.uhid || 'No UHID'}</small>{Number(order.amendment_count || 0) > 0 && <small className="amendment-marker">Amendment #{order.amendment_count}</small>}</td><td>{order.patient_name}<small>{[formatAge(order), order.gender, order.mobile].filter(Boolean).join(' · ')}</small></td><td>{typeof order.tests === 'string' ? order.tests : ''}</td><td>{formatDate(order.sample_date, true)}</td><td><Status value={order.sample_status || 'REGISTERED'} /><Status value={order.status} /></td><td className="actions">{hasRole(user, 'ADMIN', 'AUTHORIZER') && order.sample_status === 'REGISTERED' && <button className="text-button" onClick={() => onOpen(order.id, 'entry')}>Review / delete</button>}{order.sample_status === 'REGISTERED' ? canAccept ? <button className="text-button" disabled={accepting} onClick={() => void acceptSamples([order.id])}>Accept sample</button> : <span className="muted">Awaiting reception</span> : <button className="text-button" onClick={() => onOpen(order.id, 'entry')}>{order.sample_status === 'COLLECTED' ? 'Start' : order.status === 'PENDING' ? 'Enter' : 'Review'}</button>}{order.status === 'AUTHORIZED' && <button className="text-button" onClick={() => onOpen(order.id, 'report')}>Report</button>}</td></tr>)}</tbody></table></div>
  </section>;
}

export function Status({ value }: { value: string }) { return <span className={`status status-${value.toLowerCase()}`}>{value.toLowerCase()}</span>; }
