import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../database/pool.js';
import { config } from '../config/env.js';
import { indiaCatalogue, catalogueVersion, catalogueSources } from '../data/indiaCatalogue.js';
import { importIndiaCatalogue, previewIndiaCatalogue } from '../services/indiaCatalogueService.js';

const args = process.argv.slice(2);
function option(flag: string) {
  const index=args.indexOf(flag);
  if(index<0) return undefined;
  const value=args[index+1];
  if(!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return value;
}
try {
  const out=option('--export');
  if(out) {
    const output=path.resolve(out);
    await fs.mkdir(output,{recursive:true});
    await fs.writeFile(path.join(output,'india-catalogue.json'),JSON.stringify({version:catalogueVersion,sources:catalogueSources,profiles:indiaCatalogue},null,2)+'\n');
    const fields=['profileCode','profileName','department','specimen','parameterCode','parameterName','resultType','unit','method','referenceRanges','options','formula','description'];
    const csv=(values:unknown[])=>values.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',');
    const rows=indiaCatalogue.flatMap(profile=>profile.parameters.map(parameter=>csv([profile.code,profile.name,profile.department,profile.specimenType,parameter.code,parameter.name,parameter.resultKind,parameter.unit,parameter.method,JSON.stringify(parameter.referenceRanges),parameter.selectOptions.join('; '),parameter.calculationFormula,parameter.description])));
    await fs.writeFile(path.join(output,'india-catalogue.csv'),'\uFEFF'+[csv(fields),...rows].join('\r\n')+'\r\n');
    console.log(JSON.stringify({exported:output,profiles:indiaCatalogue.length,parameters:rows.length}));
  } else {
    const target=new URL(config.databaseUrl);
    if(!['db','127.0.0.1','localhost'].includes(target.hostname)) throw new Error('This importer is restricted to the local LIS database.');
    if(args.includes('--apply')) {
      const destination=option('--snapshot');
      if(!destination) throw new Error('--apply requires --snapshot <new JSON path> for a recoverable catalogue copy.');
      const result=await importIndiaCatalogue(async data=>{
        await fs.writeFile(path.resolve(destination),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
      });
      console.log(JSON.stringify({version:result.version,added:result.added.length,parameters:result.added.reduce((sum,p)=>sum+p.parameters,0),skipped:result.skipped,snapshot:destination}));
    } else {
      const plan=await previewIndiaCatalogue();
      console.log(JSON.stringify({mode:'preview',version:catalogueVersion,add:plan.add.length,parameters:plan.add.reduce((sum,p)=>sum+p.parameters.length,0),departments:[...new Set(plan.add.map(p=>p.department))],skipped:plan.skipped}));
    }
  }
} catch(error) {
  console.error(error instanceof Error?error.message:'Catalogue operation failed');
  process.exitCode=1;
} finally {
  await pool.end();
}
