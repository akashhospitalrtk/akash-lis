// Run from the backend directory against PostgreSQL with CREATE DATABASE rights.
// Creates and removes its own disposable database; never writes to the LIS database.
import assert from 'node:assert/strict';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dbName=`outside_lab_${randomUUID().replaceAll('-','')}_test`;
const admin=new pg.Pool({connectionString:process.env.DATABASE_URL});
let server, pool;
try {
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url=new URL(process.env.DATABASE_URL);url.pathname=`/${dbName}`;process.env.DATABASE_URL=url.toString();
  const built = file => pathToFileURL(path.resolve('dist/src',file)).href;
  ({pool}=await import(built('database/pool.js')));
  const {config}=await import(built('config/env.js'));
  const {createApp}=await import(built('app.js'));
  await pool.query(await fs.readFile('./database/001_schema.sql','utf8'));
  const users={};
  for(const role of ['ADMIN','TECHNICIAN','AUTHORIZER','DOCTOR']) {
    const row=(await pool.query('INSERT INTO users(username,password_hash,full_name,role,roles) VALUES($1,$2,$3,$4,$5) RETURNING id',[role,'unused','Synthetic '+role,role,[role]])).rows[0];
    users[role]=jwt.sign({id:row.id,role},config.jwtSecret);
    if(role==='ADMIN')users.adminId=row.id;
  }
  const orders=[];
  for(let n=0;n<2;n++)orders.push((await pool.query("INSERT INTO lab_orders(accession_no,patient_source,patient_name,sample_date,created_by) VALUES($1,'MANUAL','Synthetic outside patient',NOW(),$2) RETURNING id",[`OUTSIDE-${n}`,users.adminId])).rows[0].id);
  server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api/orders/`;
  const path=orders[0]+'/outside-lab';
  async function request(path,role='ADMIN',method='GET',body,headers={}) {
    return fetch(base+path,{method,headers:{...(role?{Authorization:`Bearer ${users[role]}`}:{ }),...headers},body});
  }
  assert.equal((await request(path,null)).status,401);
  assert.equal((await request(path,'DOCTOR')).status,403);
  const pdf=Buffer.from('%PDF-1.4\nSynthetic outside report\n%%EOF');
  const headers={'Content-Type':'application/pdf','X-Report-Filename':encodeURIComponent('Outside report.pdf')};
  assert.equal((await request(path+'/reports','TECHNICIAN','POST',pdf,headers)).status,409);
  assert.equal((await request(path,'TECHNICIAN','PUT',JSON.stringify({labName:'Synthetic referral lab',reference:'REF-123',sentAt:new Date().toISOString(),notes:'Send-out test'}),{'Content-Type':'application/json'})).status,200);
  assert.equal((await request(path+'/reports','AUTHORIZER','POST',pdf,headers)).status,403);
  assert.equal((await request(path+'/reports','TECHNICIAN','POST','invalid pdf',headers)).status,400);
  assert.equal((await request(path+'/reports','TECHNICIAN','POST',Buffer.alloc(10*1024*1024+1),headers)).status,413);
  assert.equal((await request(path+'/reports','TECHNICIAN','POST',pdf,headers)).status,201);
  const data=(await (await request(path,'AUTHORIZER')).json()).data;
  assert.equal(data.referral.reference,'REF-123');assert.equal(data.reports.length,1);
  const downloaded=await request(path+'/reports/'+data.reports[0].id,'AUTHORIZER');
  assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),pdf);
  assert.equal((await request(orders[1]+'/outside-lab/reports/'+data.reports[0].id)).status,404);
  assert.equal((await pool.query('SELECT status FROM lab_orders WHERE id=$1',[orders[0]])).rows[0].status,'PENDING');
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE order_id=$1 AND event_type IN ('OUTSIDE_LAB_REFERRAL_SAVED','OUTSIDE_REPORT_UPLOADED')",[orders[0]])).rows[0].n,2);
  await pool.query('UPDATE lab_orders SET deleted_at=NOW() WHERE id=$1',[orders[0]]);
  assert.equal((await request(path+'/reports/'+data.reports[0].id)).status,404);
  console.log('Outside-lab integration passed: referral, upload, download, access controls, isolation, limits, audit, and unchanged authorization.');
} finally {
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  if(pool)await pool.end();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await admin.end();
}
