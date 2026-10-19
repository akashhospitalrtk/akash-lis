import { useState } from 'react';

export function CustomSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const [custom, setCustom] = useState(false);
  return <label className="field"><span>{label}</span><select aria-label={label} value={custom ? '__custom' : value} onChange={(event) => { const next = event.target.value; setCustom(next === '__custom'); if (next !== '__custom') onChange(next); }}>
    <option value="">Choose…</option>{[...new Set([...options, value].filter(Boolean))].map((option) => <option key={option}>{option}</option>)}<option value="__custom">+ Add custom…</option>
  </select>{custom && <input autoFocus aria-label={`Custom ${label.toLowerCase()}`} maxLength={80} value={value} onChange={(event) => onChange(event.target.value)} placeholder={`Enter custom ${label.toLowerCase()}`} />}</label>;
}
