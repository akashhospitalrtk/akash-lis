import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Page } from '../hooks/useNavigation';

type DailyPoint = { date: string; orders: number; tests: number };
type StatusCount = { status: 'PENDING' | 'COMPLETED' | 'AUTHORIZED'; count: number };
type TopTest = { code: string; name: string; count: number };
type DashboardData = {
  from: string;
  to: string;
  metrics: { orders: number; tests: number; pending: number; completed: number; authorized: number; abnormalResults: number; avgTurnaroundHours: number | null };
  daily: DailyPoint[];
  statuses: StatusCount[];
  topTests: TopTest[];
};

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('en-IN', options).format(new Date(`${value}T00:00:00`));
}

const statusMeta = {
  PENDING: { label: 'Awaiting results', color: '#c8831b' },
  COMPLETED: { label: 'Ready for authorization', color: '#7465d2' },
  AUTHORIZED: { label: 'Authorized', color: '#178575' }
} as const;

function VolumeChart({ points }: { points: DailyPoint[] }) {
  const width = 760;
  const height = 252;
  const left = 40;
  const right = 12;
  const top = 16;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...points.map((point) => point.orders));
  const tickStep = Math.max(1, Math.ceil(maximum / 3));
  const ticks = [0, tickStep, tickStep * 2, tickStep * 3].filter((tick, index, values) => tick <= maximum || index === 0);
  const x = (index: number) => left + (points.length < 2 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => top + plotHeight - (value / maximum) * plotHeight;
  const linePoints = points.map((point, index) => `${x(index)},${y(point.orders)}`).join(' ');
  const areaPath = points.length
    ? `M ${x(0)} ${top + plotHeight} L ${points.map((point, index) => `${x(index)} ${y(point.orders)}`).join(' L ')} L ${x(points.length - 1)} ${top + plotHeight} Z`
    : '';
  const labelEvery = Math.max(1, Math.ceil((points.length - 1) / 5));

  return <div className="analytics-chart-wrap">
    <svg className="analytics-volume-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily registered orders over the selected date range">
      <defs><linearGradient id="dashboard-volume-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#5b4fcf" stopOpacity=".18" /><stop offset="100%" stopColor="#5b4fcf" stopOpacity=".015" /></linearGradient></defs>
      {ticks.map((tick) => <g key={tick}>
        <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="analytics-grid-line" />
        <text x={left - 10} y={y(tick) + 4} textAnchor="end" className="analytics-axis-label">{tick}</text>
      </g>)}
      {areaPath && <path d={areaPath} fill="url(#dashboard-volume-fill)" />}
      {points.length > 1 && <polyline points={linePoints} fill="none" className="analytics-chart-line" />}
      {points.map((point, index) => <g key={point.date}>
        <circle cx={x(index)} cy={y(point.orders)} r={points.length > 40 ? 2 : 3.5} className="analytics-chart-point"><title>{`${formatDate(point.date, { weekday: 'short', day: 'numeric', month: 'short' })}: ${point.orders} orders, ${point.tests} tests`}</title></circle>
        {(index === 0 || index === points.length - 1 || index % labelEvery === 0) && <text x={x(index)} y={height - 9} textAnchor="middle" className="analytics-axis-label">{formatDate(point.date, { day: 'numeric', month: 'short' })}</text>}
      </g>)}
      {!points.length && <text x={width / 2} y={height / 2} textAnchor="middle" className="analytics-axis-label">No registrations in this period</text>}
    </svg>
  </div>;
}

function StatusChart({ statuses }: { statuses: StatusCount[] }) {
  const total = statuses.reduce((sum, status) => sum + status.count, 0);
  let end = 0;
  const slices = statuses.filter((status) => status.count > 0).map((status) => {
    const start = end;
    end += status.count / total * 100;
    return `${statusMeta[status.status].color} ${start}% ${end}%`;
  });
  const gradient = total ? `conic-gradient(${slices.join(', ')})` : 'var(--lis-subtle)';
  return <div className="analytics-status-content">
    <div className="analytics-donut" style={{ background: gradient }} aria-hidden="true"><div><strong>{total}</strong><span>orders</span></div></div>
    <div className="analytics-status-legend">
      {(['PENDING', 'COMPLETED', 'AUTHORIZED'] as const).map((key) => {
        const count = statuses.find((status) => status.status === key)?.count ?? 0;
        return <div key={key}><span className="analytics-legend-name"><i style={{ background: statusMeta[key].color }} />{statusMeta[key].label}</span><strong>{count}</strong></div>;
      })}
    </div>
  </div>;
}

export function Dashboard({ onNavigate, canRegister, canManageCatalogue }: { onNavigate: (page: Page) => void; canRegister: boolean; canManageCatalogue: boolean }) {
  const today = localDate();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (from > to) {
      setData(null);
      setError('The end date must be on or after the start date.');
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError('');
    void api<DashboardData>(`/analytics/dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { signal: controller.signal })
      .then((result) => { setData(result); setUpdatedAt(new Date()); })
      .catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message || 'Dashboard data could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [from, to, refreshVersion]);

  const periodLabel = useMemo(() => from === to ? formatDate(from, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : `${formatDate(from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${formatDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`, [from, to]);
  const maxTopTest = Math.max(1, ...(data?.topTests.map((test) => test.count) ?? []));

  function dateRange(days: number) {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);
    return { from: localDate(startDate), to: localDate(endDate) };
  }
  function chooseRange(days: number) { const range = dateRange(days); setFrom(range.from); setTo(range.to); }
  const isPreset = (days: number) => { const range = dateRange(days); return from === range.from && to === range.to; };

  return <section className="page dashboard-page">
      <div className="dashboard-heading">
      <div><p className="eyebrow">Laboratory intelligence</p><h1>Operations overview</h1><p className="muted">Daily activity, report progress, and investigation demand in one place.</p></div>
      <div className="dashboard-actions">{canRegister && <button type="button" className="secondary" onClick={() => onNavigate('register')}>＋ New order</button>}<button type="button" className="dashboard-refresh" aria-label="Refresh dashboard" title="Refresh dashboard" onClick={() => setRefreshVersion((value) => value + 1)} disabled={loading}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.8-3L3 11m0-5v5h5M4 13a8 8 0 0 0 14.8 3L21 13m0 5v-5h-5" /></svg></button></div>
    </div>

    <div className="dashboard-toolbar">
      <div className="dashboard-presets" aria-label="Choose dashboard date range">
        <button type="button" className={isPreset(1) ? 'selected' : ''} onClick={() => chooseRange(1)}>Today</button>
        <button type="button" className={isPreset(7) ? 'selected' : ''} onClick={() => chooseRange(7)}>7 days</button>
        <button type="button" className={isPreset(30) ? 'selected' : ''} onClick={() => chooseRange(30)}>30 days</button>
      </div>
      <div className="dashboard-date-range">
        <label>From <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label>
        <span aria-hidden="true">to</span>
        <label>To <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
      </div>
    </div>

    {error && <div className="dashboard-error" role="alert">{error}<button type="button" onClick={() => setRefreshVersion((value) => value + 1)}>Try again</button></div>}
    <div className={`dashboard-content${loading ? ' dashboard-loading' : ''}`} aria-busy={loading}>
      <div className="dashboard-period-row"><span>{periodLabel}</span><span>{loading ? 'Updating…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}</span></div>

      <div className="dashboard-kpis">
        <article className="dashboard-kpi kpi-indigo"><span>Registered orders</span><strong>{data?.metrics.orders ?? '—'}</strong><small>Patient visits</small><i aria-hidden="true">↗</i></article>
        <article className="dashboard-kpi kpi-teal"><span>Test panels</span><strong>{data?.metrics.tests ?? '—'}</strong><small>Investigations ordered</small><i aria-hidden="true">⌕</i></article>
        <article className="dashboard-kpi kpi-amber"><span>Awaiting results</span><strong>{data?.metrics.pending ?? '—'}</strong><small>Pending reports</small><i aria-hidden="true">◷</i></article>
        <article className="dashboard-kpi kpi-green"><span>Authorized</span><strong>{data?.metrics.authorized ?? '—'}</strong><small>Reports released</small><i aria-hidden="true">✓</i></article>
      </div>

      <div className="dashboard-charts-grid">
        <article className="analytics-card analytics-volume-card">
          <div className="analytics-card-heading"><div><h2>Daily workload</h2><p>Order volume by sample date</p></div><span className="analytics-chart-key"><i /> Orders</span></div>
          {data && <VolumeChart points={data.daily} />}
        </article>
        <article className="analytics-card analytics-status-card">
          <div className="analytics-card-heading"><div><h2>Report status</h2><p>Status of orders in this period</p></div></div>
          {data && <StatusChart statuses={data.statuses} />}
        </article>
      </div>

      <div className="dashboard-detail-grid">
        <article className="analytics-card analytics-tests-card">
          <div className="analytics-card-heading"><div><h2>Top investigations</h2><p>Most frequently ordered panels</p></div>{canManageCatalogue && <button type="button" className="text-button" onClick={() => onNavigate('catalogue')}>View catalogue</button>}</div>
          {data?.topTests.length ? <div className="analytics-test-list">{data.topTests.map((test) => <div className="analytics-test-row" key={test.code}>
            <span className="analytics-test-label"><strong>{test.name}</strong><small>{test.code}</small></span><span className="analytics-test-track"><i style={{ width: `${Math.max(4, test.count / maxTopTest * 100)}%` }} /></span><strong className="analytics-test-count">{test.count}</strong>
          </div>)}</div> : <p className="analytics-empty">No investigation activity in this period.</p>}
        </article>
        <article className="analytics-card analytics-insights-card">
          <div className="analytics-card-heading"><div><h2>Operational insights</h2><p>Selected period summary</p></div></div>
          <div className="analytics-insight"><span>Avg. receive to authorization</span><strong>{data?.metrics.avgTurnaroundHours != null ? <>{data.metrics.avgTurnaroundHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} <small>hrs</small></> : '—'}</strong><p>For authorized reports in this sample cohort</p></div>
          <div className="analytics-insight"><span>Flagged result values</span><strong>{data?.metrics.abnormalResults ?? '—'}</strong><p>Results carrying an abnormal or critical flag</p></div>
          <button type="button" className="analytics-worklist-link" onClick={() => onNavigate('worklist')}>Open sample worklist <span aria-hidden="true">→</span></button>
        </article>
      </div>
      <p className="dashboard-footnote">Orders are grouped by sample date. Turnaround time uses the sample received and report authorization timestamps.</p>
    </div>
  </section>;
}
