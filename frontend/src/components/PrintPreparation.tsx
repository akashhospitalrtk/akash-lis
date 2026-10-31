import { useEffect, useRef, useState } from 'react';
import { api, download, fetchDocument } from '../api';
import { isDetailOrder, hasRole } from '../lib';
import type { Order, User } from '../types';

type PrintMode = 'color' | 'bw';

export function PrintPreparation({ order, user, onBack, onUpdated }: {
  order: Order | null;
  user: User;
  onBack: () => void;
  onUpdated: (order: Order) => void;
}) {
  const detailed = isDetailOrder(order) ? order : null;
  const [mode, setMode] = useState<PrintMode>('color');
  const [pdfUrl, setPdfUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const canPrint = Boolean(detailed && detailed.status === 'AUTHORIZED' && hasRole(user, 'ADMIN', 'AUTHORIZER', 'DOCTOR'));

  useEffect(() => {
    if (!detailed || !canPrint) return;
    let active = true;
    let nextUrl = '';
    setLoading(true);
    setPreviewReady(false);
    setError('');
    setPdfUrl('');
    void fetchDocument(`/clinical/orders/${detailed.id}/report.pdf?mode=${mode}`)
      .then(({ blob }) => {
        if (blob.type !== 'application/pdf') throw new Error('The server did not return a PDF report.');
        nextUrl = URL.createObjectURL(blob);
        if (active) setPdfUrl(nextUrl);
        else URL.revokeObjectURL(nextUrl);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not prepare the report.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [detailed?.id, canPrint, mode]);

  function printSelected() {
    if (!pdfUrl || !previewReady || busy || !detailed) return;
    const frame = iframeRef.current;
    if (frame?.contentWindow) {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } else {
      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    }
    setBusy(true);
    void api<Order>(`/clinical/orders/${detailed.id}/print`, { method: 'POST' })
      .then(onUpdated)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Print request could not be recorded.'))
      .finally(() => setBusy(false));
  }

  async function downloadSelected() {
    if (!detailed || !pdfUrl) return;
    setBusy(true);
    setError('');
    try {
      await download(`/clinical/orders/${detailed.id}/report.pdf?mode=${mode}`, `${detailed.accession_no}${mode === 'bw' ? '-black-white' : ''}.pdf`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not download the selected PDF.');
    } finally {
      setBusy(false);
    }
  }

  if (!detailed) return <section className="page empty-state"><h1>No report selected</h1><p>Open an authorized report first.</p><button onClick={onBack}>Back</button></section>;

  return <section className="page print-preparation">
    <div className="print-preparation-heading">
      <div>
        <p className="eyebrow">Print preparation</p>
        <h1>Print laboratory report</h1>
        <p>{detailed.patient_name} · Accession {detailed.accession_no}</p>
      </div>
      <span className="status status-authorized">Authorized report</span>
    </div>
    <div className="print-preparation-toolbar">
      <button type="button" className="secondary" onClick={onBack}>Back to report</button>
      <div className="print-mode-choices" role="group" aria-label="Select print colour mode">
        <button type="button" className={mode === 'bw' ? 'selected' : ''} aria-pressed={mode === 'bw'} onClick={() => setMode('bw')} disabled={loading || busy}>
          <span className="print-mode-swatch print-mode-swatch-bw" aria-hidden="true" />
          <span><strong>Black &amp; White</strong><small>Grayscale, lower ink use</small></span>
        </button>
        <button type="button" className={mode === 'color' ? 'selected' : ''} aria-pressed={mode === 'color'} onClick={() => setMode('color')} disabled={loading || busy}>
          <span className="print-mode-swatch print-mode-swatch-color" aria-hidden="true" />
          <span><strong>Color</strong><small>Original letterhead colours</small></span>
        </button>
      </div>
      <div className="print-actions">
        <button type="button" className="secondary" onClick={() => void downloadSelected()} disabled={!pdfUrl || loading || busy}>Download selected PDF</button>
        <button type="button" onClick={printSelected} disabled={!pdfUrl || !previewReady || loading || busy}>{busy ? 'Preparing…' : 'Print selected report'}</button>
      </div>
    </div>
    {!canPrint && <p className="notice">Only an authorized report can be printed.</p>}
    {error && <p className="form-error">{error}</p>}
    {loading && <p className="loading">Preparing {mode === 'bw' ? 'black-and-white' : 'color'} PDF…</p>}
    {pdfUrl && <section className="print-preview-panel" aria-label="Selected report preview">
      <div className="print-preview-caption"><strong>{mode === 'bw' ? 'Black & White preview' : 'Color preview'}</strong><span>A4 · Actual size (100%)</span></div>
      <iframe ref={iframeRef} title="Selected laboratory report print preview" src={pdfUrl} onLoad={() => setPreviewReady(true)} />
      <a href={pdfUrl} target="_blank" rel="noopener noreferrer">Open PDF in a new tab</a>
    </section>}
    <p className="print-preparation-note">Choose the paper size and printer in the browser print dialog. For best alignment, use A4 and Actual size (100%).</p>
  </section>;
}
