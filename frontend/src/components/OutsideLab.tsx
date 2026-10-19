import { useEffect, useState } from 'react';
import { api, download } from '../api';
import { hasRole, formatDate } from '../lib';
import type { User } from '../types';

type Report = { id:string; filename:string; size:number; created_at:string };
type Data = { referral: { lab_name:string; reference:string; sent_at:string|null; notes:string }|null; reports:Report[] };
export function OutsideLab({ orderId, user }: { orderId:string; user:User }) {
  const [data,setData]=useState<Data>({referral:null,reports:[]});
  const [labName,setLabName]=useState(''); const [reference,setReference]=useState(''); const [sentAt,setSentAt]=useState(''); const [notes,setNotes]=useState('');
  const [file,setFile]=useState<File|null>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [message,setMessage]=useState('');
  const canEdit=hasRole(user,'ADMIN','TECHNICIAN');
  const path=`/orders/${orderId}/outside-lab`;
  async function load() { const next=await api<Data>(path); setData(next); return next; }
  useEffect(()=> { let active=true; api<Data>(path).then(next=> { if(!active)return; setData(next);setLabName(next.referral?.lab_name||'');setReference(next.referral?.reference||'');setNotes(next.referral?.notes||''); const date=next.referral?.sent_at ? new Date(next.referral.sent_at):null; setSentAt(date?new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16):''); }).catch(e=>{if(active)setError(e.message);});return()=>{active=false;}; },[path]);
  async function save() { setBusy(true);setError('');setMessage('');try { await api(path,{method:'PUT',body:JSON.stringify({labName,reference,sentAt:sentAt?new Date(sentAt).toISOString():null,notes})});await load();setMessage('Outside laboratory details saved.'); }catch(e){setError(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);} }
  async function upload() { if(!file)return;setBusy(true);setError('');setMessage('');try{if(file.size>10*1024*1024)throw new Error('Maximum report size is 10 MB.');await api(`${path}/reports`,{method:'POST',headers:{'Content-Type':file.type,'X-Report-Filename':encodeURIComponent(file.name)},body:file});await load();setFile(null);setMessage('Original outside report stored in LIS.');}catch(e){setError(e instanceof Error?e.message:'Upload failed.');}finally{setBusy(false);} }
  async function getReport(report:Report) { setError('');try{await download(`${path}/reports/${report.id}`,report.filename);}catch(e){setError(e instanceof Error?e.message:'Download failed.');} }
  return <section className="card outside-lab"><div className="section-title"><h2>Outside laboratory</h2><a href="http://122.161.198.159:88/Admin_General/das-cli.aspx" target="_blank" rel="noopener noreferrer">Open sample portal ↗</a></div>
    <p className="hint">Record samples sent to another lab and keep their original report here. To issue a report on our letterhead, enter the supplied values in the result fields below, save and authorize as usual. Uploading a file does not authorize results.</p>
    {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="notice" role="status">{message}</p>}
    <div className="form-grid"><label>Outside laboratory name<input maxLength={160} value={labName} disabled={!canEdit||busy} onChange={e=>setLabName(e.target.value)} /></label><label>External reference / accession<input maxLength={120} value={reference} disabled={!canEdit||busy} onChange={e=>setReference(e.target.value)} /></label><label>Sample sent at<input type="datetime-local" value={sentAt} disabled={!canEdit||busy} onChange={e=>setSentAt(e.target.value)} /></label><label>Sent tests / notes<textarea maxLength={2000} value={notes} disabled={!canEdit||busy} onChange={e=>setNotes(e.target.value)} /></label></div>
    {canEdit&&<div className="toolbar-actions"><button type="button" disabled={busy||!labName.trim()} onClick={()=>void save()}>Save outside lab details</button></div>}
    {canEdit&&data.referral&&<div className="outside-upload"><label>Original report (PDF, JPG or PNG, up to 10 MB)<input key={file?'selected':'empty'} type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)} /></label><button type="button" disabled={busy||!file} onClick={()=>void upload()}>Upload report</button></div>}
    {data.reports.length?<ul>{data.reports.map(report=><li key={report.id}><button className="text-button" type="button" onClick={()=>void getReport(report)}>{report.filename}</button><small> · {Math.ceil(report.size/1024)} KB · {formatDate(report.created_at,true)}</small></li>)}</ul>:<p className="muted">No outside reports uploaded yet.</p>}
  </section>;
}
