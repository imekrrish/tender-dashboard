import {useEffect,useState} from 'react';
import {api} from '../services/api';
type Criterion={criterion_id:string;tender_id:string;category:string;requirement:string;conditions?:string;source_url:string;page?:number;quote:string};
type Job={id:string;source_url:string;status:string;progress:string;error?:string;created_at:string;result?:{tenders:unknown[];criteria:Criterion[];warnings:string[];discovered:number}};
type Change={tender_id:string;action:string;title:string;fields?:{field:string;before:unknown;after:unknown}[]};
type Preview={id:string;already_imported:boolean;summary:{new:number;updates:number;criteria:number;skipped:number;changes:Change[]}};
const fail=(e:unknown)=>(e as {response?:{data?:{error?:string}}}).response?.data?.error || 'Request failed. Please retry.';
export function SeciExtraction({adminKey,onImported}:{adminKey:string;onImported:()=>void}) {
  const [url,setUrl]=useState('https://www.seci.co.in/tenders'),[limit,setLimit]=useState(5);
  const [jobs,setJobs]=useState<Job[]>([]),[job,setJob]=useState<Job|null>(null);
  const [selected,setSelected]=useState(''),[configured,setConfigured]=useState<boolean|null>(null);
  const [files,setFiles]=useState<Record<string,File>>({}),[preview,setPreview]=useState<Preview|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const auth={headers:{Authorization:`Bearer ${adminKey}`}};
  useEffect(()=>{
    let active=true;
    async function refresh(){try{
      const [status,list]=await Promise.all([api.get('/radar/admin/seci/status',auth),api.get('/radar/admin/seci/jobs',auth)]);
      if(!active)return;setConfigured(status.data.configured);setJobs(list.data);
      const id=selected || list.data[0]?.id;
      if(id){const detail=await api.get(`/radar/admin/seci/jobs/${id}`,auth);if(active)setJob(detail.data);}
    }catch(e){if(active)setError(fail(e));}}
    void refresh();const timer=setInterval(refresh,4000);
    return()=>{active=false;clearInterval(timer);};
  // The admin key is kept in memory; no credential is persisted in the browser.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[adminKey,selected]);
  async function start(){setBusy(true);setError('');setNotice('');try{
    const {data}=await api.post('/radar/admin/seci/jobs',{url,limit},auth);setSelected(data.id);setJob(data);
  }catch(e){setError(fail(e));}finally{setBusy(false);}}
  async function download(kind:string){if(!job)return;setBusy(true);setError('');try{
    const {data}=await api.get(`/radar/admin/seci/jobs/${job.id}/${kind}.xlsx`,{...auth,responseType:'blob'});
    const objectUrl=URL.createObjectURL(data),a=document.createElement('a');a.href=objectUrl;a.download=`${kind}-review.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  }catch(e){setError(fail(e));}finally{setBusy(false);}}
  async function inspect(){setBusy(true);setError('');setNotice('');setPreview(null);try{
    const body=new FormData();for(const kind of ['tenders','technical','financial'])body.append(kind,files[kind]);
    setPreview((await api.post('/radar/admin/seci/review/preview',body,auth)).data);
  }catch(e){setError(fail(e));}finally{setBusy(false);}}
  async function commit(){if(!preview)return;setBusy(true);setError('');try{
    const {data}=await api.post(`/radar/admin/seci/review/${preview.id}/commit`,{},auth);
    setNotice(data.already_imported?'These files were already imported.':`Imported ${data.summary.new} new tenders, ${data.summary.updates} updates and ${data.summary.criteria} eligibility conditions.`);
    setPreview({...preview,already_imported:true});onImported();
  }catch(e){setError(fail(e));}finally{setBusy(false);}}
  return <section className="radar-extraction">
    <h3>SECI tender extraction</h3><p>Extract → download three files → verify and mark rows Approved → upload together → preview → import.</p>
    {configured===false&&<p role="status" className="radar-error">Extraction needs OPENAI_API_KEY in the backend environment. Your API key stays on the server.</p>}
    <form className="radar-extract-form" onSubmit={e=>{e.preventDefault();void start();}}>
      <label>SECI tender URL<input type="url" required value={url} onChange={e=>setUrl(e.target.value)}/></label>
      <label>Tenders to process<input type="number" min={1} max={25} value={limit} onChange={e=>setLimit(Number(e.target.value))}/></label>
      <button className="radar-primary" disabled={busy||configured!==true}>Start extraction</button>
    </form>
    <p>Start with 5 tenders. Downloads include document links, page references and review notes. Missing or inaccessible information is flagged for review.</p>
    {jobs.length>0&&<label>Recent extractions<select value={selected||jobs[0]?.id||''} onChange={e=>{setSelected(e.target.value);setJob(null);}}>{jobs.map(j=><option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleString()} · {j.status} · {j.id.slice(0,8)}</option>)}</select></label>}
    {job&&<div className="radar-extract-result"><p role="status"><strong>{job.status.toUpperCase()}</strong> · {job.progress}</p>{job.error&&<p role="alert">{job.error}</p>}
      {job.result&&<><p>{job.result.tenders.length} tenders · {job.result.criteria.length} eligibility conditions · {job.result.discovered} tenders discovered</p>
        {['completed','partial'].includes(job.status)&&<div className="radar-form-actions">{['tenders','technical','financial'].map(kind=><button key={kind} disabled={busy} onClick={()=>download(kind)}>Download {kind==='tenders'?'tenders':`${kind} eligibility`}</button>)}</div>}
        {job.result.warnings.length>0&&<details><summary>{job.result.warnings.length} extraction notes — review before approving</summary><ul>{job.result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}
        <details><summary>Preview extracted eligibility</summary>{['Technical','Financial','General'].map(category=><section key={category}><h4>{category} eligibility</h4>{job.result!.criteria.filter(c=>c.category===category).map(c=><p key={c.criterion_id}><strong>{c.tender_id}:</strong> {c.requirement}<br/>{c.conditions}<br/><a href={c.source_url} target="_blank" rel="noopener noreferrer">Source{c.page?` · PDF page ${c.page}`:''} ↗</a></p>)}</section>)}</details>
      </>}
    </div>}
    <h3>Import reviewed files</h3><p>Keep all headers and IDs. Set Review Status to Approved for accepted rows. Pending and Rejected rows are skipped. General conditions belong in the technical file. Omitted rows are retained in the database; to correct a superseded condition, edit its existing row and keep its Criterion ID.</p>
    <div className="radar-extract-files">{['tenders','technical','financial'].map(kind=><label key={kind}>{kind==='tenders'?'Tenders':`${kind[0].toUpperCase()+kind.slice(1)} eligibility`}<input type="file" accept=".xlsx" disabled={busy} onChange={e=>{const file=e.target.files?.[0];setFiles(prev=>{const next={...prev};if(file)next[kind]=file;else delete next[kind];return next;});setPreview(null);setNotice('');}}/></label>)}</div>
    <button disabled={busy||Object.keys(files).length!==3} onClick={inspect}>{busy?'Working…':'Validate and preview import'}</button>
    {preview&&<div className="radar-extract-result"><p><strong>{preview.summary.new} new · {preview.summary.updates} updates · {preview.summary.criteria} eligibility conditions · {preview.summary.skipped} skipped rows</strong></p>
      {preview.already_imported?<p>These files have already been imported.</p>:<><div className="radar-table-wrap"><table><thead><tr><th>Tender</th><th>Action</th><th>Changes</th></tr></thead><tbody>{preview.summary.changes.map(c=><tr key={c.tender_id}><td>{c.tender_id}<span>{c.title}</span></td><td>{c.action}</td><td>{c.fields?.map(f=><span key={f.field}>{f.field}: {String(f.before??'—')} → {String(f.after??'—')}</span>)}</td></tr>)}</tbody></table></div><p>Confirm to write approved records to the database. This preview expires after 30 minutes.</p><button className="radar-primary" disabled={busy} onClick={commit}>Confirm import</button></>}
    </div>}
    {notice&&<p role="status">{notice}</p>}{error&&<p className="radar-error" role="alert">{error}</p>}
  </section>;
}
