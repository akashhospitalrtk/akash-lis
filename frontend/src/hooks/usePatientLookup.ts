import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

export type PatientResult = { id: string; uhid?: string; name?: string; patientName?: string; age?: number; ageYears?: number; age_years?: number; age_value?: number; age_unit?: string; gender?: string; mobile?: string; referringDoctor?: string; referring_doctor?: string; patientType?: string; patient_type?: string };
export type PatientSuggestion = PatientResult & { source: 'HOSPITAL' | 'LIS' };
const limit = 5;

function combinePatients(hospital: PatientResult[], history: PatientResult[], query: string): PatientSuggestion[] {
  const normalized = query.toLocaleLowerCase();
  const rank = (patient: PatientResult) => [patient.uhid, patient.mobile, patient.name || patient.patientName]
    .findIndex((value) => value?.toLocaleLowerCase() === normalized);
  const seen = new Set<string>();
  return [
    ...hospital.map((patient): PatientSuggestion => ({ ...patient, source: 'HOSPITAL' })),
    ...history.map((patient): PatientSuggestion => ({ ...patient, source: 'LIS' }))
  ].filter((patient) => {
    const key = patient.uhid?.trim().toLocaleLowerCase() || `${patient.source}:${patient.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (rank(a) < 0 ? 3 : rank(a)) - (rank(b) < 0 ? 3 : rank(b))
    || (a.name || a.patientName || '').localeCompare(b.name || b.patientName || '')
    || a.id.localeCompare(b.id)).slice(0, limit);
}

export function usePatientLookup() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PatientSuggestion[]>([]);
  const [message, setMessage] = useState('');
  const [searching, setSearching] = useState(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController>();
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const deadline = useRef<ReturnType<typeof setTimeout>>();

  const cancel = useCallback(() => {
    sequence.current += 1;
    clearTimeout(debounce.current);
    clearTimeout(deadline.current);
    controller.current?.abort();
  }, []);

  const run = useCallback(async (value: string) => {
    cancel();
    setSuggestions([]);
    setMessage('');
    if (!value) { setSearching(false); return; }
    const current = sequence.current;
    const request = new AbortController();
    controller.current = request;
    // Bound the whole lookup; still display LIS results as soon as they arrive.
    deadline.current = setTimeout(() => request.abort(), 35000);
    setSearching(true);
    let hospital: PatientResult[] = [], history: PatientResult[] = [];
    const failures: string[] = [];
    let completed = 0;
    const load = async (source: 'HOSPITAL' | 'LIS') => {
      try {
        const path = source === 'HOSPITAL' ? '/external-patients' : '/patient-history';
        const rows = await api<PatientResult[]>(`${path}?query=${encodeURIComponent(value)}&match=prefix&limit=${limit}`, { signal: request.signal });
        if (!Array.isArray(rows)) throw new Error('Patient lookup returned an invalid response.');
        if (source === 'HOSPITAL') hospital = rows; else history = rows;
      } catch (reason) {
        const fallback = `${source === 'HOSPITAL' ? 'Hospital' : 'Laboratory'} patient lookup is unavailable. Please retry.`;
        failures.push(reason instanceof Error && reason.name !== 'AbortError' ? reason.message : fallback);
      }
      if (sequence.current !== current) return;
      completed += 1;
      const results = combinePatients(hospital, history, value);
      setSuggestions(results);
      const status = results.length
        ? `Choose a patient below.${results.length === limit ? ' Showing five matches; keep typing to narrow the list.' : ''}`
        : completed === 2 && !failures.length ? 'No matching patient found. You can register a new patient below.' : '';
      setMessage([status, ...new Set(failures)].filter(Boolean).join(' '));
      if (completed === 2) { clearTimeout(deadline.current); setSearching(false); }
    };
    await Promise.all([load('LIS'), load('HOSPITAL')]);
  }, [cancel]);

  useEffect(() => {
    if (query.trim()) debounce.current = setTimeout(() => void run(query.trim()), 300);
    return cancel;
  }, [query, cancel, run]);

  function change(value: string) {
    cancel();
    setQuery(value);
    setSuggestions([]);
    setMessage('');
    setSearching(false);
  }
  function dismiss(message = '', clearQuery = false) {
    cancel();
    setSuggestions([]);
    setSearching(false);
    setMessage(message);
    if (clearQuery) setQuery('');
  }
  return { query, suggestions, message, searching, change, dismiss, search: () => run(query.trim()) };
}
