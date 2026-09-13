export type ClinicalNoteSuggestion = { text: string; sources: string[] };

type Props = { label: string; value: string; onChange: (value: string) => void; suggestion?: ClinicalNoteSuggestion };

export function ClinicalNotesEditor({ label, value, onChange, suggestion }: Props) {
  return <details className="catalogue-optional clinical-notes-editor">
    <summary>Clinical notes {value.trim() ? '(included on report)' : '(optional)'}</summary>
    <label className="field"><span>{label}</span><textarea rows={5} maxLength={5000} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Clinical significance, interpretation and relevant test limitations" /><small>General test information printed below the results. Use patient remarks for case-specific findings. Clear this field to omit it.</small></label>
    <div className="clinical-note-tools"><small>{value.length}/5000 characters</small>{suggestion && <button type="button" className="text-button" onClick={() => onChange(suggestion.text)}>Use suggested clinical note</button>}</div>
    {suggestion && <p className="clinical-note-sources">Suggested note references: {suggestion.sources.map((source, index) => <a key={source} href={source} target="_blank" rel="noreferrer">Source {index + 1}</a>)}. Review wording for your laboratory.</p>}
    {value.trim() && <div className="clinical-note-preview"><small>Report preview</small><p>{value}</p></div>}
  </details>;
}
