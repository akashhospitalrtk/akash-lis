import { formatDate } from '../lib';
import type { ClinicalNote } from '../types';

export function DoctorNotes({ notes }: { notes: ClinicalNote[] }) {
  if (!notes.length) return <p className="muted">No doctor clinical notes yet.</p>;
  return <div className="doctor-note-list">{notes.map((note) => <article key={note.id} className="doctor-note"><strong>{note.author_name}{note.author_designation ? ` · ${note.author_designation}` : ''}</strong><small>{formatDate(note.created_at, true)}</small><p>{note.body}</p></article>)}</div>;
}
