import { useState } from 'react'

// ─── DATA ───────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'samples', label: 'Samples' },
  { id: 'orders', label: 'Orders' },
  { id: 'results', label: 'Results' },
  { id: 'patients', label: 'Patients' },
  { id: 'instruments', label: 'Instruments' },
  { id: 'qc', label: 'QC' },
  { id: 'reports', label: 'Reports' },
]

const STATS = [
  { label: 'Samples Received', value: 312, sub: '+28 this hour', color: '#5b4fcf', bg: '#ede9ff' },
  { label: 'Results Pending', value: 87, sub: '14 STAT priority', color: '#0f766e', bg: '#ccfbf1' },
  { label: 'Critical Flags', value: 7, sub: '3 unacknowledged', color: '#be123c', bg: '#ffe4e6' },
  { label: 'TAT Compliance', value: '94%', sub: 'Target: ≥90%', color: '#b45309', bg: '#fef3c7' },
]

const SAMPLES = [
  { id: 'S-240918-0041', patient: 'Chen, Margaret', type: 'Serum', tests: ['LFT', 'CMP', 'TSH'], time: '08:14', priority: 'STAT', status: 'In Progress', dept: 'Chemistry' },
  { id: 'S-240918-0042', patient: 'Okafor, James', type: 'EDTA', tests: ['CBC', 'PT/INR'], time: '08:31', priority: 'Routine', status: 'Pending', dept: 'Haematology' },
  { id: 'S-240918-0043', patient: 'Rivera, Sofia', type: 'Urine', tests: ['UA', 'UCx'], time: '08:45', priority: 'Routine', status: 'Complete', dept: 'Microbiology' },
  { id: 'S-240918-0044', patient: 'Nakamura, Hiro', type: 'Serum', tests: ['Troponin', 'CK-MB', 'BNP'], time: '09:02', priority: 'STAT', status: 'In Progress', dept: 'Immunoassay' },
  { id: 'S-240918-0045', patient: 'Adeyemi, Funke', type: 'Serum', tests: ['HbA1c', 'Lipids'], time: '09:17', priority: 'Routine', status: 'Pending', dept: 'Chemistry' },
  { id: 'S-240918-0046', patient: 'Walsh, Patrick', type: 'EDTA', tests: ['CBC', 'CMP'], time: '09:28', priority: 'Routine', status: 'Complete', dept: 'Haematology' },
  { id: 'S-240918-0047', patient: 'Gupta, Priya', type: 'Serum', tests: ['Ferritin', 'B12'], time: '09:41', priority: 'Urgent', status: 'In Progress', dept: 'Chemistry' },
]

const CRITICALS = [
  { id: 'R-00412', patient: 'Nakamura, Hiro', test: 'Troponin I', value: '4.82 ng/mL', flag: 'HH', ref: '<0.04', time: '09:18', ack: false },
  { id: 'R-00398', patient: 'Chen, Margaret', test: 'Potassium', value: '6.8 mmol/L', flag: 'HH', ref: '3.5–5.1', time: '08:52', ack: false },
  { id: 'R-00371', patient: 'Petrov, Dmitri', test: 'Glucose', value: '1.9 mmol/L', flag: 'LL', ref: '4.0–10.0', time: '07:44', ack: true },
  { id: 'R-00355', patient: 'Osei, Kwame', test: 'WBC', value: '0.8 ×10⁹/L', flag: 'LL', ref: '4.5–11.0', time: '07:12', ack: true },
]

const INSTRUMENTS = [
  { name: 'Cobas c702', type: 'Chemistry', status: 'Running', pct: 78, queue: 34, color: '#0f766e' },
  { name: 'Cobas e801', type: 'Immunoassay', status: 'Running', pct: 62, queue: 18, color: '#0f766e' },
  { name: 'ADVIA 2120i', type: 'Haematology', status: 'Running', pct: 45, queue: 12, color: '#0f766e' },
  { name: 'BACTEC FX', type: 'Microbiology', status: 'Maintenance', pct: 0, queue: 0, color: '#b45309' },
  { name: 'BN ProSpec', type: 'Protein', status: 'Running', pct: 31, queue: 7, color: '#0f766e' },
  { name: 'Cobas 6800', type: 'Molecular', status: 'Offline', pct: 0, queue: 0, color: '#be123c' },
]

const BARS = [
  { h: '06', v: 28 }, { h: '07', v: 54 }, { h: '08', v: 87 },
  { h: '09', v: 63 }, { h: '10', v: 41 }, { h: '11', v: 35 }, { h: '12', v: 18 },
]

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────

function Tag({ children, color = '#1a1a2e', bg = '#e8e6e0' }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <span className="inline-block font-mono text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
      style={{ color, background: bg }}>
      {children}
    </span>
  )
}

function StatusPill({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    'In Progress': ['#5b4fcf', '#ede9ff'],
    'Pending': ['#b45309', '#fef3c7'],
    'Complete': ['#374151', '#e8e6e0'],
  }
  const [c, b] = map[s] ?? ['#374151', '#e8e6e0']
  return <Tag color={c} bg={b}>{s}</Tag>
}

function PriTag({ p }: { p: string }) {
  const map: Record<string, [string, string]> = {
    'STAT': ['#be123c', '#ffe4e6'],
    'Urgent': ['#b45309', '#fef3c7'],
    'Routine': ['#374151', '#e8e6e0'],
  }
  const [c, b] = map[p] ?? ['#374151', '#e8e6e0']
  return <Tag color={c} bg={b}>{p}</Tag>
}

function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 18, circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={44} height={44} viewBox="0 0 44 44">
      <circle cx={22} cy={22} r={r} fill="none" stroke="#e8e6e0" strokeWidth={4} />
      <circle cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 22 22)" />
      <text x={22} y={26} textAnchor="middle" fontSize={9} fontFamily="JetBrains Mono" fontWeight={700} fill={color}>{pct}%</text>
    </svg>
  )
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

function Sidebar({ active, onNav }: { active: string; onNav: (id: string) => void }) {
  return (
    <aside className="flex flex-col w-52 shrink-0" style={{ background: '#1a1a2e', color: '#e8e6e0' }}>
      {/* Wordmark */}
      <div className="px-6 pt-7 pb-5">
        <div className="font-serif text-xl text-white leading-none italic mb-0.5">LabSys</div>
        <div className="font-mono text-[8px] uppercase tracking-[0.2em]" style={{ color: '#6b6b8a' }}>
          Central Pathology · v4.2
        </div>
      </div>

      {/* Live indicator */}
      <div className="mx-5 mb-5 px-3 py-2.5 rounded-lg flex items-center gap-2.5"
        style={{ background: '#0f1024', border: '1px solid #2a2a4a' }}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: '#34d399' }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#34d399' }} />
        </span>
        <div>
          <div className="font-mono text-[9px] font-semibold" style={{ color: '#34d399' }}>LIVE</div>
          <div className="font-mono text-[8px]" style={{ color: '#4a4a6a' }}>Last sync 0:04s</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3">
        {NAV.map(item => {
          const isActive = active === item.id
          return (
            <button key={item.id} onClick={() => onNav(item.id)}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all"
              style={{
                background: isActive ? '#5b4fcf' : 'transparent',
                color: isActive ? '#ffffff' : '#6b6b8a',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#c8c4e8' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#6b6b8a' }}
            >
              <span className="font-sans text-[13px] font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-5 py-5 border-t" style={{ borderColor: '#2a2a4a' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0"
            style={{ background: '#5b4fcf', color: '#fff' }}>EL</div>
          <div>
            <div className="font-sans text-[12px] font-semibold text-white">E. Larsson</div>
            <div className="font-mono text-[9px] uppercase tracking-widest" style={{ color: '#4a4a6a' }}>Lab Scientist</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

// ─── TOPBAR ──────────────────────────────────────────────────────────────────

function TopBar() {
  return (
    <div className="flex items-center justify-between px-7 py-3.5 border-b shrink-0"
      style={{ background: '#f5f4f0', borderColor: '#e0ddd5' }}>
      <div>
        <h1 className="font-serif italic text-[20px] leading-none" style={{ color: '#1a1a2e' }}>Dashboard</h1>
        <p className="font-mono text-[9px] uppercase tracking-[0.15em] mt-1" style={{ color: '#9e9b94' }}>
          Fri 18 Sep 2026 · 09:47 · Morning Shift
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border"
          style={{ background: '#fff', borderColor: '#e0ddd5' }}>
          <span className="text-[11px]" style={{ color: '#9e9b94' }}>⌕</span>
          <input className="font-mono text-[11px] bg-transparent outline-none w-36"
            style={{ color: '#1a1a2e' }}
            placeholder="Search patient…" />
        </div>
        <button className="relative w-9 h-9 flex items-center justify-center rounded-lg border"
          style={{ background: '#fff', borderColor: '#e0ddd5' }}>
          <span className="text-sm">🔔</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2"
            style={{ background: '#be123c', borderColor: '#f5f4f0' }} />
        </button>
      </div>
    </div>
  )
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

function Dashboard() {
  const [acked, setAcked] = useState(new Set(['R-00371', 'R-00355']))
  const [activeTab, setActiveTab] = useState<'all' | 'stat' | 'pending'>('all')

  const filtered = SAMPLES.filter(s => {
    if (activeTab === 'stat') return s.priority === 'STAT'
    if (activeTab === 'pending') return s.status === 'Pending'
    return true
  })

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ background: '#f5f4f0' }}>

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 mb-5 lg:grid-cols-4">
        {STATS.map(s => (
          <div key={s.label} className="rounded-xl p-5 border"
            style={{ background: '#fff', borderColor: '#e0ddd5' }}>
            <div className="flex items-start justify-between mb-3">
              <div className="font-sans text-[11px] font-medium" style={{ color: '#9e9b94' }}>{s.label}</div>
              <div className="w-2 h-2 rounded-full mt-0.5" style={{ background: s.color }} />
            </div>
            <div className="font-serif italic text-3xl leading-none mb-1.5" style={{ color: s.color }}>{s.value}</div>
            <div className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm inline-block"
              style={{ color: s.color, background: s.bg }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Sample table — 2 cols */}
        <div className="lg:col-span-2 rounded-xl border overflow-hidden"
          style={{ background: '#fff', borderColor: '#e0ddd5' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#f0ede6' }}>
            <span className="font-sans text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>Sample Queue</span>
            <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: '#f5f4f0' }}>
              {(['all', 'stat', 'pending'] as const).map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className="font-mono text-[9px] uppercase tracking-widest px-3 py-1.5 rounded-md transition-all"
                  style={{
                    background: activeTab === t ? '#5b4fcf' : 'transparent',
                    color: activeTab === t ? '#fff' : '#9e9b94',
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #f0ede6' }}>
                  {['Sample', 'Patient', 'Dept', 'Tests', 'Time', 'Priority', 'Status'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-mono text-[9px] uppercase tracking-widest font-medium"
                      style={{ color: '#9e9b94' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={s.id}
                    className="transition-colors cursor-pointer"
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f5f4f0' : 'none' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#faf9f6'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px] font-semibold" style={{ color: '#5b4fcf' }}>{s.id.slice(-4)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-sans text-[12px] font-medium" style={{ color: '#1a1a2e' }}>{s.patient}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px]" style={{ color: '#9e9b94' }}>{s.dept}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.tests.map(t => (
                          <span key={t} className="font-mono text-[9px] px-1.5 py-0.5 rounded-sm"
                            style={{ background: '#f5f4f0', color: '#6b6b8a' }}>{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px]" style={{ color: '#9e9b94' }}>{s.time}</span>
                    </td>
                    <td className="px-4 py-3"><PriTag p={s.priority} /></td>
                    <td className="px-4 py-3"><StatusPill s={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* Throughput */}
          <div className="rounded-xl border p-5" style={{ background: '#fff', borderColor: '#e0ddd5' }}>
            <div className="font-sans text-[13px] font-semibold mb-4" style={{ color: '#1a1a2e' }}>Hourly Throughput</div>
            <div className="flex items-end gap-1.5 h-16 mb-2">
              {BARS.map((d, i) => {
                const max = Math.max(...BARS.map(b => b.v))
                const isNow = i === 3
                return (
                  <div key={d.h} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full relative" style={{ height: 48 }}>
                      <div className="absolute bottom-0 w-full rounded-t-sm transition-all"
                        style={{
                          height: `${(d.v / max) * 100}%`,
                          background: isNow ? '#5b4fcf' : '#e8e6e0',
                        }} />
                    </div>
                    <span className="font-mono text-[8px]" style={{ color: isNow ? '#5b4fcf' : '#c8c4e0' }}>{d.h}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: '#f0ede6' }}>
              <span className="font-mono text-[9px]" style={{ color: '#9e9b94' }}>Peak: 87 @ 08:00</span>
              <span className="font-mono text-[9px]" style={{ color: '#9e9b94' }}>Avg: 47/hr</span>
            </div>
          </div>

          {/* Critical results */}
          <div className="rounded-xl border overflow-hidden flex-1" style={{ background: '#fff', borderColor: '#e0ddd5' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#f0ede6' }}>
              <span className="font-sans text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>Critical Results</span>
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm"
                style={{ color: '#be123c', background: '#ffe4e6' }}>
                {CRITICALS.filter(r => !acked.has(r.id)).length} pending
              </span>
            </div>
            <div className="divide-y" style={{ borderColor: '#f5f4f0' }}>
              {CRITICALS.map(r => (
                <div key={r.id} className="px-5 py-3.5 transition-opacity"
                  style={{ opacity: acked.has(r.id) ? 0.45 : 1 }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-sans text-[12px] font-medium truncate" style={{ color: '#1a1a2e' }}>{r.patient}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-[10px]" style={{ color: '#9e9b94' }}>{r.test}</span>
                        <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm"
                          style={{ color: '#be123c', background: '#ffe4e6' }}>{r.flag}</span>
                        <span className="font-mono text-[11px] font-semibold" style={{ color: '#be123c' }}>{r.value}</span>
                      </div>
                      <div className="font-mono text-[9px] mt-1" style={{ color: '#c8c4e0' }}>Ref: {r.ref}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="font-mono text-[9px]" style={{ color: '#c8c4e0' }}>{r.time}</span>
                      {!acked.has(r.id) && (
                        <button
                          onClick={() => setAcked(prev => new Set([...prev, r.id]))}
                          className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1.5 rounded-md font-semibold transition-colors"
                          style={{ background: '#5b4fcf', color: '#fff' }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#4a3fbe'}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#5b4fcf'}
                        >
                          ACK
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Instruments */}
      <div className="mt-4 rounded-xl border overflow-hidden" style={{ background: '#fff', borderColor: '#e0ddd5' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#f0ede6' }}>
          <span className="font-sans text-[13px] font-semibold" style={{ color: '#1a1a2e' }}>Instrument Status</span>
          <div className="flex items-center gap-4">
            {[['Running', '#0f766e', '#ccfbf1'], ['Maintenance', '#b45309', '#fef3c7'], ['Offline', '#be123c', '#ffe4e6']].map(([label, c, bg]) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: c as string }} />
                <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: '#9e9b94' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px" style={{ background: '#f0ede6' }}>
          {INSTRUMENTS.map(inst => (
            <div key={inst.name} className="flex items-center gap-4 px-5 py-4"
              style={{ background: '#fff' }}>
              <Ring pct={inst.pct} color={inst.color} />
              <div className="flex-1 min-w-0">
                <div className="font-sans text-[13px] font-semibold mb-0.5" style={{ color: '#1a1a2e' }}>{inst.name}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest mb-2" style={{ color: '#9e9b94' }}>{inst.type}</div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: inst.color }} />
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-widest" style={{ color: inst.color }}>{inst.status}</span>
                  {inst.queue > 0 && (
                    <span className="font-mono text-[9px]" style={{ color: '#9e9b94' }}>· {inst.queue} queued</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [active, setActive] = useState('dashboard')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f5f4f0' }}>
      <Sidebar active={active} onNav={setActive} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        {active === 'dashboard'
          ? <Dashboard />
          : (
            <div className="flex-1 flex items-center justify-center" style={{ background: '#f5f4f0' }}>
              <div className="text-center">
                <div className="font-serif italic text-4xl mb-3" style={{ color: '#e0ddd5' }}>
                  {NAV.find(n => n.id === active)?.label}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: '#c8c4e0' }}>
                  Module not loaded in demo
                </div>
              </div>
            </div>
          )}
      </main>
    </div>
  )
}
