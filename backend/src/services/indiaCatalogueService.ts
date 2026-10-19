import { withTransaction, type DbClient } from '../database/pool.js';
import { indiaCatalogue, catalogueAliases, catalogueVersion } from '../data/indiaCatalogue.js';
import { planParameters, writeParameters } from './catalogueService.js';
import { catalogueAudit, addSystemAudit } from './auditService.js';
import { profileSchema, type ProfileInput } from '../schemas/profileSchemas.js';

type Existing = { id: string; code: string; name: string };
const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
export function planIndiaCatalogue(existing: Existing[], source: ProfileInput[] = indiaCatalogue) {
  const sourceCodes = new Set<string>();
  const add: ProfileInput[] = [];
  const skipped: { code: string; existingCode: string; reason: string }[] = [];
  for (const input of source) {
    const profile = profileSchema.parse(input);
    if (sourceCodes.has(profile.code)) throw new Error(`Duplicate catalogue code: ${profile.code}`);
    sourceCodes.add(profile.code);
    const aliases = (catalogueAliases[profile.code] || [profile.code]).map(normalize);
    const match = existing.find(item => aliases.includes(normalize(item.code)) || normalize(item.name) === normalize(profile.name));
    if (match) skipped.push({code:profile.code,existingCode:match.code,reason:'Existing code, known alias or identical name; preserved'});
    else add.push(profile);
  }
  return { add, skipped };
}
async function existingProfiles(client: DbClient) {
  return (await client.query<Existing>('SELECT id, code, name FROM test_profiles ORDER BY code')).rows;
}
export async function previewIndiaCatalogue() {
  return withTransaction(async client => planIndiaCatalogue(await existingProfiles(client)));
}
export async function importIndiaCatalogue(snapshot: (data: unknown) => Promise<void>, actorId: string | null = null) {
  return withTransaction(async client => {
    // Serialize catalogue writers during the short import; one transaction prevents
    // partially visible profiles and duplicate imports, including concurrent reruns.
    await client.query('LOCK TABLE test_profiles, profile_parameters IN SHARE ROW EXCLUSIVE MODE');
    const plan = planIndiaCatalogue(await existingProfiles(client));
    if (!plan.add.length) return { version:catalogueVersion, added:[], skipped:plan.skipped };
    await snapshot({ version:catalogueVersion, capturedAt:new Date().toISOString(),
      profiles:(await client.query('SELECT * FROM test_profiles ORDER BY id')).rows,
      parameters:(await client.query('SELECT * FROM profile_parameters ORDER BY id')).rows,
    });
    const added: {id:string;code:string;parameters:number}[] = [];
    for (const profile of plan.add) {
      const row = (await client.query<{id:string}>(`INSERT INTO test_profiles
        (code,name,department,specimen_type,turnaround_time,instructions,description)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [profile.code,profile.name,profile.department,profile.specimenType || null,profile.turnaroundTime || null,profile.instructions || null,profile.description || null])).rows[0];
      await writeParameters(client,row.id,planParameters([],profile.parameters));
      await catalogueAudit(client,row.id,actorId,'INVESTIGATION_CREATED',{source:catalogueVersion,code:profile.code,parameters:profile.parameters.length,configuration:'Editable common methods; adult example intervals where supplied'});
      added.push({id:row.id,code:profile.code,parameters:profile.parameters.length});
    }
    await addSystemAudit(client,actorId,'CATALOGUE_IMPORTED',{source:catalogueVersion,added,skipped:plan.skipped});
    return {version:catalogueVersion,added,skipped:plan.skipped};
  });
}
