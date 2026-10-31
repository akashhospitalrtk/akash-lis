import { useEffect, useState, type FormEvent } from 'react';
import { api, download } from '../api';
import { formatDate } from '../lib';

type OutsideReportRecord = {
  id: string;
  order_id: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
  accession_no: string;
  uhid?: string | null;
  patient_name: string;
  mobile?: string | null;
  lab_name: string;
  reference?: string | null;
};

async function searchOutsideReports(query: string) {
  return api<{ reports: OutsideReportRecord[] }>(`/outside-lab/reports?q=${encodeURIComponent(query)}`);
}

function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OutsideReports({ onOpenOrder }: { onOpenOrder: (orderId: string) => void }) {
  const [query, setQuery] = useState('');
  const [reports, setReports] = useState<OutsideReportRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load(search = query) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await searchOutsideReports(search.trim());
      setReports(result.reports);
      if (!result.reports.length) setMessage(search.trim() ? 'No outside reports match this search.' : 'No outside reports have been uploaded yet.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load outside reports.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(''); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await load(query);
  }

  async function retrieve(report: OutsideReportRecord) {
    setError('');
    try {
      await download(`/orders/${report.order_id}/outside-lab/reports/${report.id}`, report.filename);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not download the outside report.');
    }
  }

  return <section className="page outside-reports-page">
    <div className="page-heading">
      <div>
        <p className="eyebrow">Patient document archive</p>
        <h1>Outside reports</h1>
        <p className="muted">Find original reports received from other laboratories by patient name, UHID, accession number, mobile, lab name or filename.</p>
      </div>
    </div>
    <section className="card outside-reports-card">
      <form className="outside-reports-search" onSubmit={submit}>
        <label className="field">
          <span>Search outside reports</span>
          <input value={query} maxLength={160} onChange={event => setQuery(event.target.value)} placeholder="Patient, UHID, accession, lab or filename" />
        </label>
        <button disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
        <button type="button" className="secondary" disabled={busy && !reports.length} onClick={() => { setQuery(''); void load(''); }}>Clear</button>
      </form>
      <p className="hint">Upload new files from Results → open the patient's order → Outside laboratory. Supported files: PDF, JPG and PNG, maximum 10 MB per file. Original files are stored with the order in the LIS database and included in database backups.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="muted" role="status">{message}</p>}
      <div className="outside-reports-table-wrap">
        <table className="outside-reports-table">
          <thead><tr><th>Patient / order</th><th>Outside lab</th><th>Original file</th><th>Uploaded</th><th>Actions</th></tr></thead>
          <tbody>
            {reports.map(report => <tr key={report.id}>
              <td><strong>{report.patient_name}</strong><small>{report.uhid ? `UHID ${report.uhid} · ` : ''}{report.accession_no}</small>{report.mobile && <small>{report.mobile}</small>}</td>
              <td>{report.lab_name}<small>{report.reference ? `Reference: ${report.reference}` : 'No external reference recorded'}</small></td>
              <td><strong>{report.filename}</strong><small>{report.mime_type} · {sizeLabel(report.size)}</small></td>
              <td>{formatDate(report.created_at, true)}</td>
              <td><div className="outside-report-actions"><button type="button" className="secondary" onClick={() => onOpenOrder(report.order_id)}>Open order</button><button type="button" onClick={() => void retrieve(report)}>Download</button></div></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p className="hint">Showing up to 200 matching files, newest first. Reports remain linked to their order; access is restricted to laboratory staff roles permitted by the LIS.</p>
    </section>
  </section>;
}
