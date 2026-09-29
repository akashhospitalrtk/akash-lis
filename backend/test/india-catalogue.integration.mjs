import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import pg from 'pg';
import express from 'express';
import jwt from 'jsonwebtoken';

// Creates and removes ONLY a fresh, uniquely named disposable database.
const original=new URL(process.env.DATABASE_URL || '');
assert.ok(['db','127.0.0.1','localhost'].includes(original.hostname));
assert.equal(process.env.LIS_CATALOGUE_ISOLATED_CHECK,'1');
const database=`lis_catalogue_${Date.now()}_test`;
assert.match(database,/^lis_catalogue_\d+_test$/);
const admin=new pg.Client({connectionString:original.href});
await admin.connect();
let created=false,pool,server;
try {
  await admin.query(`CREATE DATABASE "${database}"`); created=true;
  const testUrl=new URL(original);testUrl.pathname=`/${database}`;
  process.env.DATABASE_URL=testUrl.href;
  ({pool}=await import('../dist/src/database/pool.js'));
  const schema=await fs.readFile(new URL('../../database/001_schema.sql',import.meta.url),'utf8').catch(()=>fs.readFile('/app/database/001_schema.sql','utf8'));
  await pool.query(schema);
  const {importIndiaCatalogue,previewIndiaCatalogue}=await import('../dist/src/services/indiaCatalogueService.js');
  const {createProfile}=await import('../dist/src/services/profileService.js');
  const {profileSchema}=await import('../dist/src/schemas/profileSchemas.js');
  const actor=(await pool.query("INSERT INTO users (username,password_hash,full_name,role) VALUES ('catalogue_fixture','not-a-login','Synthetic catalogue operator','ADMIN') RETURNING id")).rows[0];
  const technician=(await pool.query("INSERT INTO users (username,password_hash,full_name,role) VALUES ('catalogue_tech','not-a-login','Synthetic technician','TECHNICIAN') RETURNING id")).rows[0];
  const input=profileSchema.parse({code:'LIVER',name:'Existing configured liver test',department:'Custom',parameters:[{code:'CUSTOM',name:'Existing parameter',resultKind:'NUMERIC',unit:'custom',method:'User method',referenceRanges:[{low:1,high:2}]}]});
  await createProfile(input,actor.id);
  await pool.query("UPDATE test_profiles SET active=false WHERE code='LIVER'");
  const before=(await pool.query('SELECT * FROM profile_parameters ORDER BY id')).rows;
  const beforeProfiles=(await pool.query('SELECT * FROM test_profiles ORDER BY id')).rows;
  const planned=await previewIndiaCatalogue();
  let snapshot;
  await assert.rejects(importIndiaCatalogue(async()=>{throw new Error('Snapshot failure');},actor.id),/Snapshot failure/);
  assert.equal((await pool.query('SELECT count(*)::int n FROM test_profiles')).rows[0].n,1);
  // Force a failure after some insertions to prove the whole transaction rolls back.
  await pool.query("ALTER TABLE test_profiles ADD CONSTRAINT synthetic_import_failure CHECK (code <> 'TG')");
  await assert.rejects(importIndiaCatalogue(async()=>{},actor.id));
  assert.equal((await pool.query('SELECT count(*)::int n FROM test_profiles')).rows[0].n,1);
  await pool.query('ALTER TABLE test_profiles DROP CONSTRAINT synthetic_import_failure');
  const results=await Promise.all([importIndiaCatalogue(async data=>{snapshot=data;},actor.id),importIndiaCatalogue(async()=>{},actor.id)]);
  assert.equal(results.reduce((sum,r)=>sum+r.added.length,0),planned.add.length);
  assert.deepEqual((await pool.query('SELECT * FROM profile_parameters WHERE id=ANY($1::uuid[]) ORDER BY id',[before.map(x=>x.id)])).rows,before);
  assert.deepEqual((await pool.query('SELECT * FROM test_profiles WHERE id=ANY($1::uuid[]) ORDER BY id',[beforeProfiles.map(x=>x.id)])).rows,beforeProfiles);
  assert.ok(snapshot);
  assert.equal((await importIndiaCatalogue(async()=>{throw new Error('No snapshot needed on rerun');},actor.id)).added.length,0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM catalogue_audit_events WHERE details->>'source'='india-common-2026-09-28-v1'")).rows[0].n,planned.add.length);
  const {profileRoutes}=await import('../dist/src/routes/profileRoutes.js');
  const {orderRoutes}=await import('../dist/src/routes/orderRoutes.js');
  const {errorHandler}=await import('../dist/src/middleware/errorHandler.js');
  const {config}=await import('../dist/src/config/env.js');
  const token=jwt.sign({id:actor.id,role:'ADMIN'},config.jwtSecret);
  const techToken=jwt.sign({id:technician.id,role:'TECHNICIAN'},config.jwtSecret);
  const app=express();app.use(express.json());app.use('/api',profileRoutes);app.use('/api',orderRoutes);app.use(errorHandler);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  async function request(url,method='GET',body,auth=token) {
    const response=await fetch(base+url,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const json=await response.json().catch(()=>null);return {status:response.status,data:json?.data??json};
  }
  const catalogue=await request('/catalogue/profiles');assert.equal(catalogue.status,200);
  assert.equal(catalogue.data.length,planned.add.length+1);
  const test=catalogue.data.find(p=>p.code==='UR_ACR');
  const order=await request('/orders','POST',{patientName:'Synthetic catalogue import check',sampleDate:new Date().toISOString(),profileIds:[test.id],entryMode:'RESULTS'});
  assert.equal(order.status,201,JSON.stringify(order.data));
  const tests=order.data.tests;
  assert.ok(tests[0].results.every(p=>p.result_value===null));
  const albumin=tests[0].results.find(p=>p.parameter_code==='UR_MICROALB');
  const creat=tests[0].results.find(p=>p.parameter_code==='UR_CREAT');
  const saved=await request(`/orders/${order.data.id}/results`,'PUT',{results:[{id:albumin.id,value:'20'},{id:creat.id,value:'100'}]});
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  const populated=await request(`/orders/${order.data.id}`);
  assert.equal(Number(populated.data.tests[0].results.find(p=>p.parameter_code==='ACR').result_value),20);
  const {indiaCatalogue}=await import('../dist/src/data/indiaCatalogue.js');
  const edit=structuredClone(indiaCatalogue.find(p=>p.code==='UR_ACR'));
  edit.parameters[0].method='Synthetic edited method';
  assert.equal((await request(`/catalogue/profiles/${test.id}`,'PUT',edit,techToken)).status,403);
  assert.equal((await request(`/catalogue/profiles/${test.id}`,'PUT',edit)).status,200);
  const retained=await request(`/orders/${order.data.id}`);
  assert.equal(retained.data.tests[0].results.find(p=>p.parameter_code==='UR_MICROALB').method,albumin.method);
  console.log(JSON.stringify({passed:true,added:planned.add.length,checks:['schema','snapshot failure rollback','mid-import rollback','concurrent import idempotency','existing rows and archived profiles unchanged','audit','authenticated catalogue API','technician denied edit','new order snapshots','empty initial results','unit-aware formula result','editable methods','prior order method retained']}));
} finally {
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(pool) await pool.end();
  if(created) await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
}
