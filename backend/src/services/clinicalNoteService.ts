import { pool, type DbClient } from '../database/pool.js';

export type ClinicalNote = { id: string; order_id: string; author_id: string; author_name: string; author_designation: string | null; body: string; created_at: Date };
export async function listClinicalNotes(id: string, client: DbClient = pool) {
  return (await client.query<ClinicalNote>('SELECT * FROM clinical_notes WHERE order_id = $1 ORDER BY created_at, id', [id])).rows;
}
