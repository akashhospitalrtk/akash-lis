import { FormEvent, useState } from 'react';
import { download } from '../api';

const today = new Date().toISOString().slice(0, 10);

export function RecordsExport() {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState<'ALL' | 'AUTHORIZED'>('ALL');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(''); setMessage('');
    if (!from || !to) { setError('Choose both a start date and an end date before exporting.'); return; }
    if (from > to) { setError('The end date must not be before the start date.'); return; }
    if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 30) { setError('Export up to 31 days at a time. Choose a shorter date range.'); return; }
    setBusy(true);
    try {
      const { rowCount } = await download(`/records/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=${status}`, `lis-records-${from}-to-${to}.csv`);
      setMessage(rowCount ? `CSV download started with ${rowCount} test-result row${rowCount === 1 ? '' : 's'}. Store it only in the approved, access-controlled records location.` : 'No records matched this date range and status. A CSV with column headings was downloaded; choose All order states or a different date range.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not export records.');
    } finally { setBusy(false); }
  }

  return <section className="page export-page"><div className="page-heading"><div><p className="eyebrow">Controlled administrative export</p><h1>Laboratory records export</h1><p className="muted">One CSV row is created for every ordered test parameter and its result.</p></div></div>
    <section className="card export-card"><form className="stack" onSubmit={submit}><div className="form-grid"><label>From date<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To date<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label>Records to include<select value={status} onChange={(event) => setStatus(event.target.value as 'ALL' | 'AUTHORIZED')}><option value="ALL">All order states</option><option value="AUTHORIZED">Authorized reports only</option></select></label></div><p className="notice">For safety and performance, export one month at a time. Each export is recorded in the administrator audit log. CSV is useful for review and record lists; it is not a replacement for encrypted database backups or issued reports.</p>{error && <p className="form-error">{error}</p>}{message && <p className="success-message">{message}</p>}<div className="form-actions"><button disabled={busy}>{busy ? 'Preparing export…' : 'Download records CSV'}</button></div></form></section>
  </section>;
}
