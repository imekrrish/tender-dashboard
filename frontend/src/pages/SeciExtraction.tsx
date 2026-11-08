import {useEffect,useState} from 'react';
import {api} from '../services/api';
type Criterion={criterion_id:string;tender_id:string;category:string;requirement:string;conditions?:string;source_url:string;page?:number;quote:string};
type Duplicate={tender_id:string;tn_tender_id:string;title:string};
type Decisions=Record<string,'replace'|'skip'>;
type TenderField='title'|'scope'|'product'|'country'|'publication_date'|'closing_date'|'mounting_tech';
type Tender = Partial<Record<TenderField,string|null>> & {tender_id:string;url:string;eligibility?:Record<string,unknown>};
type Selection = {tender_id:string;corrections:Partial<Record<TenderField,string>>};
type ImportResult = {duplicates?:Duplicate[];imported?:string[]};
type Job={id:string;source_url:string;tender_limit:number;status:string;progress:string;error?:string;created_at:string;result?:{
  tenders?:Tender[];
  criteria?:Criterion[];
  sources?:{tender_id?:string;url?:string;title?:string;status?:string}[];
  warnings?:string[];
  discovered?:number;
  duplicates?:Duplicate[];
  batch?:{offset:number;links:string[]};
}};
const reviewFields: {key:TenderField;label:string}[] = [
  {key:'title',label:'Tender title'}, {key:'scope',label:'Scope'}, {key:'product',label:'Product'},
  {key:'country',label:'Country'}, {key:'publication_date',label:'Publication date (YYYY-MM-DD)'},
  {key:'closing_date',label:'Closing date and time (IST)'}, {key:'mounting_tech',label:'Mounting technology (optional)'},
];
type Change={tender_id:string;action:string;title:string;fields?:{field:string;before:unknown;after:unknown}[]};
type Preview={id:string;already_imported:boolean;summary:{new:number;updates:number;criteria:number;summaries?:number;documents?:number;skipped:number;changes:Change[]}};
const fail=(e:unknown)=>(e as {response?:{data?:{error?:string}}}).response?.data?.error || 'Request failed. Please retry.';
function DuplicateChoices({duplicates, decisions, setDecisions, onEdit, onContinue, busy, importing = false, continueLabel}:{
  duplicates:Duplicate[];
  decisions:Decisions;
  setDecisions:(choices:Decisions)=>void;
  onEdit:(id:string)=>Promise<boolean>;
  onContinue:()=>void;
  busy:boolean;
  importing?:boolean;
  continueLabel?:string;
}) {
  return <div className="radar-extract-result">
    <h4>Existing SECI tenders</h4>
    <p>Choose what to do with each match. Editing an existing tender skips it in this batch.</p>
    {duplicates.map(duplicate => <div key={duplicate.tender_id} className="radar-form-actions">
      <label>{duplicate.tender_id} · {duplicate.title}
        <select aria-label={`Action for ${duplicate.tender_id}`} disabled={busy} value={decisions[duplicate.tender_id] ?? ''}
          onChange={event => {
            const next = {...decisions};
            if (event.target.value === 'replace' || event.target.value === 'skip') next[duplicate.tender_id] = event.target.value;
            else delete next[duplicate.tender_id];
            setDecisions(next);
          }}>
          <option value="">Choose an action</option>
          <option value="replace">{importing ? 'Update from approved rows' : 'Extract again for replacement'}</option>
          <option value="skip">Skip and continue</option>
        </select>
      </label>
      <button type="button" disabled={busy} onClick={async () => {
        if (!await onEdit(duplicate.tn_tender_id)) return;
        setDecisions({...decisions, [duplicate.tender_id]:'skip'});
      }}>Edit existing</button>
    </div>)}
    <button type="button" className="radar-primary" disabled={busy || duplicates.some(row => !decisions[row.tender_id])} onClick={onContinue}>
      {continueLabel ?? (importing ? 'Preview selected changes' : 'Continue extraction')}
    </button>
  </div>;
}

function ExtractedReview({job,busy,onImport,onEdit}:{
  job:Job;
  busy:boolean;
  onImport:(selection:Selection[],decisions?:Decisions)=>Promise<ImportResult>;
  onEdit:(id:string)=>Promise<boolean>;
}) {
  const [excluded,setExcluded]=useState<string[]>([]);
  const [imported,setImported]=useState<string[]>([]);
  const [edits,setEdits]=useState<Record<string,Selection['corrections']>>({});
  const [duplicates,setDuplicates]=useState<Duplicate[]>([]);
  const [decisions,setDecisions]=useState<Decisions>({});
  const tenders=job.result?.tenders ?? [];
  const selected=tenders.filter(tender=>!excluded.includes(tender.tender_id) && !imported.includes(tender.tender_id));
  async function runImport(choices:Decisions = {}) {
    const rows=selected.map(tender=>({tender_id:tender.tender_id,corrections:edits[tender.tender_id] ?? {}}));
    const result=await onImport(rows,choices);
    setDuplicates(result.duplicates ?? []);
    if (result.imported) {
      const importedIds=result.imported;
      setImported(previous=>[...previous,...importedIds]);
      setExcluded(previous=>[...previous,...Object.keys(choices).filter(id=>choices[id]==='skip')]);
    }
  }
  return <div>
    <h4>Check and import</h4>
    <p>Keep the tenders you want to import selected. Review their details, eligibility and document links below.</p>
    {tenders.map(tender=>{
      const id=tender.tender_id, corrections=edits[id] ?? {};
      const saved=imported.includes(id);
      const criteria=job.result?.criteria?.filter(item=>item.tender_id===id) ?? [];
      const sources=job.result?.sources?.filter(source=>source.tender_id===id && source.url && source.url!==tender.url) ?? [];
      const value=(key:TenderField)=>corrections[key] ?? tender[key] ?? '';
      const needsDetails=reviewFields.some(({key})=>key!=='mounting_tech' && (!value(key).trim() || /^n\/?a$/i.test(value(key).trim())));
      return <div key={id} className="radar-seci-review-row">
        <label className="radar-seci-select">
          <input type="checkbox" checked={!excluded.includes(id)} disabled={busy||saved}
            onChange={event=>{
              setExcluded(previous=>event.target.checked ? previous.filter(item=>item!==id) : [...previous,id]);
              setDuplicates([]);setDecisions({});
            }}/>
          <span><strong>{value('title') || id}</strong> · {id}{saved&&' · Imported'}</span>
        </label>
        <p><a href={tender.url} target="_blank" rel="noopener noreferrer">SECI source ↗</a> · {criteria.length} eligibility conditions · {sources.length} linked documents
          {value('closing_date')&&<> · Closes {value('closing_date')}</>}</p>
        <details open={needsDetails || undefined}>
          <summary>{needsDetails ? 'Fill missing tender details' : 'Check or edit tender details'}</summary>
          <div className="radar-extract-files">{reviewFields.map(({key,label})=><label key={key}>{label}
            <input value={value(key)} disabled={busy||saved} onChange={event=>{
              const text=event.target.value;
              setEdits(previous=>({...previous,[id]:{...previous[id],[key]:text}}));
              setDuplicates([]);setDecisions({});
            }}/>
          </label>)}</div>
        </details>
        {(criteria.length>0 || sources.length>0 || Object.keys(tender.eligibility ?? {}).length>0) && <details>
          <summary>Eligibility and documents</summary>
          {Object.entries(tender.eligibility ?? {}).filter(([,value])=>value!=null).map(([key,value])=><p key={key}><strong>{key.replaceAll('_',' ')}</strong> · {String(value)}</p>)}
          {criteria.map(item=><p key={item.criterion_id}><strong>{item.category}</strong> · {item.requirement}{item.conditions&&<> · {item.conditions}</>} · <a href={item.source_url} target="_blank" rel="noopener noreferrer">Source{item.page ? ` (page ${item.page})` : ''} ↗</a></p>)}
          {sources.map(source=><p key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || 'Document'} ↗</a>{source.status && ` · ${source.status}`}</p>)}
        </details>}
      </div>;
    })}
    {duplicates.length>0&&<DuplicateChoices duplicates={duplicates} decisions={decisions} setDecisions={setDecisions}
      onEdit={onEdit} onContinue={()=>void runImport(decisions)} busy={busy} importing continueLabel="Import with these choices"/>}
    {!duplicates.length&&<button type="button" className="radar-primary" disabled={busy||!selected.length} onClick={()=>void runImport()}>
      {busy ? 'Working…' : `Import selected (${selected.length})`}
    </button>}
  </div>;
}

export function SeciExtraction({adminKey,onImported,onEditExisting}:{adminKey:string;onImported:()=>void;onEditExisting:(id:string)=>Promise<void>}) {
  const [url,setUrl]=useState('https://www.seci.co.in/tenders'),[limit,setLimit]=useState(5);
  const [jobs,setJobs]=useState<Job[]>([]),[job,setJob]=useState<Job|null>(null);
  const [selected,setSelected]=useState(''),[configured,setConfigured]=useState<boolean|null>(null);
  const [files,setFiles]=useState<Record<string,File>>({}),[preview,setPreview]=useState<Preview|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [jobDecisions,setJobDecisions]=useState<Decisions>({});
  const [importDuplicates,setImportDuplicates]=useState<Duplicate[]>([]);
  const [importDecisions,setImportDecisions]=useState<Decisions>({});
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
    const {data}=await api.post('/radar/admin/seci/jobs',{url,limit},auth);setSelected(data.id);setJob(data);setJobDecisions({});
  }catch(e){setError(fail(e));}finally{setBusy(false);}}
  async function next() {
    if (!job) return;
    setBusy(true);setError('');setNotice('');
    try {
      const {data}=await api.post(`/radar/admin/seci/jobs/${job.id}/next`,{},auth);
      setSelected(data.id);setJob(data);setJobDecisions({});
    } catch (e) {setError(fail(e));} finally {setBusy(false);}
  }
  async function importSelection(selection:Selection[],decisions:Decisions = {}):Promise<ImportResult> {
    if (!job) return {};
    setBusy(true);setError('');setNotice('');
    try {
      const {data}=await api.post(`/radar/admin/seci/jobs/${job.id}/import/preview`,{selection,decisions},auth);
      if (data.duplicates) return {duplicates:data.duplicates};
      if (data.skipped_all) {setNotice('All selected tenders were skipped.');return {imported:[]};}
      const result=data.already_imported ? data : (await api.post(`/radar/admin/seci/review/${data.id}/commit`,{},auth)).data;
      setNotice(result.already_imported ? 'This selection was already imported.' :
        `Imported ${result.summary.new} new tenders and ${result.summary.updates} updates.`);
      onImported();
      return {imported:result.summary.changes.map((change:Change)=>change.tender_id)};
    } catch (e) {setError(fail(e));} finally {setBusy(false);}
    return {};
  }
  async function resume() {
    if (!job) return;
    setBusy(true);setError('');
    try {
      const {data} = await api.post(`/radar/admin/seci/jobs/${job.id}/duplicates`, {decisions:jobDecisions}, auth);
      setJob(data);
      setJobDecisions({});
    } catch (e) {setError(fail(e));} finally {setBusy(false);}
  }
  async function editExisting(id:string) {
    setBusy(true);setError('');
    try {await onEditExisting(id);return true;} catch (e) {setError(fail(e));return false;} finally {setBusy(false);}
  }
  async function download(kind:string){if(!job)return;setBusy(true);setError('');try{
    const {data}=await api.get(`/radar/admin/seci/jobs/${job.id}/${kind}.xlsx`,{...auth,responseType:'blob'});
    const objectUrl=URL.createObjectURL(data),a=document.createElement('a');a.href=objectUrl;a.download=`${kind}-review.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  }catch(e){setError(fail(e));}finally{setBusy(false);}}
  async function inspect(decisions:Decisions = {}){setBusy(true);setError('');setNotice('');setPreview(null);try{
    const body=new FormData();for(const kind of ['tenders','technical','financial'])body.append(kind,files[kind]);
    if (Object.keys(decisions).length) body.append('decisions', JSON.stringify(decisions));
    const {data} = await api.post('/radar/admin/seci/review/preview',body,auth);
    setImportDuplicates(data.duplicates ?? []);
    if (data.skipped_all) setNotice('All matching tenders were skipped. No rows were imported.');
    else if (!data.duplicates) setPreview(data);
  }catch(e){setError(fail(e));}finally{setBusy(false);}}
  async function commit(){if(!preview)return;setBusy(true);setError('');try{
    const {data}=await api.post(`/radar/admin/seci/review/${preview.id}/commit`,{},auth);
    setNotice(data.already_imported?'These files were already imported.':`Imported ${data.summary.new} new tenders, ${data.summary.updates} updates and ${data.summary.criteria} eligibility conditions.`);
    setPreview({...preview,already_imported:true});onImported();
  }catch(e){setError(fail(e));}finally{setBusy(false);}}
  const batch=job?.result?.batch;
  const batchEnd=batch && job ? Math.min(batch.offset + job.tender_limit,batch.links.length) : 0;
  const canReview=!!job?.result?.tenders?.length && ['completed','partial'].includes(job.status);
  const canContinue=!!batch && !!job && ['completed','partial','skipped'].includes(job.status);
  return <section className="radar-extraction">
    <h3>SECI tender extraction</h3><p>Extract a batch, check the tenders here, then import the ones you select.</p>
    {configured===false&&<p role="status" className="radar-error">Extraction needs OPENAI_API_KEY in the backend environment. Your API key stays on the server.</p>}
    <form className="radar-extract-form" onSubmit={e=>{e.preventDefault();void start();}}>
      <label>SECI tender URL<input type="url" required value={url} onChange={e=>setUrl(e.target.value)}/></label>
      <label>Tenders to process<input type="number" min={1} max={25} value={limit} onChange={e=>setLimit(Number(e.target.value))}/></label>
      <button className="radar-primary" disabled={busy||configured!==true}>Extract first batch</button>
    </form>
    <p>Each tender may contain several linked documents. Use Next batch to continue through the same listing.</p>
    {jobs.length>0&&<label>Recent extractions<select value={selected||jobs[0]?.id||''} onChange={e=>{setSelected(e.target.value);setJob(null);setJobDecisions({});}}>{jobs.map(j=><option key={j.id} value={j.id}>{new Date(j.created_at).toLocaleString()} · {j.status} · {j.id.slice(0,8)}</option>)}</select></label>}
    {job&&<div className="radar-extract-result"><p role="status"><strong>{job.status.toUpperCase()}</strong> · {job.progress}</p>{job.error&&<p role="alert">{job.error}</p>}
      {job.status === 'awaiting_review' && !!job.result?.duplicates?.length &&
        <DuplicateChoices duplicates={job.result.duplicates} decisions={jobDecisions} setDecisions={setJobDecisions}
          onEdit={editExisting} onContinue={resume} busy={busy}/>}
      {batch&&<p>Listing items {batch.offset+1}–{batchEnd} of {batch.links.length}</p>}
      {!!job.result?.warnings?.length&&<details><summary>{job.result.warnings.length} extraction notes</summary>
        <ul>{job.result.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>
      </details>}
      {canReview&&<ExtractedReview key={job.id} job={job} busy={busy} onImport={importSelection} onEdit={editExisting}/>}
      {canContinue&&batch&&(batchEnd<batch.links.length ?
        <button type="button" disabled={busy||configured!==true} onClick={()=>void next()}>
          Next {Math.min(job.tender_limit,batch.links.length-batchEnd)} (items {batchEnd+1}–{Math.min(batchEnd+job.tender_limit,batch.links.length)})
        </button> : <p>End of this listing.</p>)}
      {canReview&&<details><summary>Download Excel copies</summary><div className="radar-form-actions">
        {['tenders','technical','financial'].map(kind=><button key={kind} disabled={busy} onClick={()=>download(kind)}>Download {kind==='tenders'?'tenders':`${kind} eligibility`}</button>)}
      </div></details>}
    </div>}
    <details>
      <summary>Import edited Excel files (optional)</summary>
    <h3>Import reviewed files</h3><p>Keep Tender ID, TN_tenderID and all headers. NA means unavailable. Mark the tender, eligibility summary, criteria and document rows you want to import as Approved. The preview shows changes before you confirm.</p>
    <div className="radar-extract-files">{['tenders','technical','financial'].map(kind=><label key={kind}>{kind==='tenders'?'Tenders':`${kind[0].toUpperCase()+kind.slice(1)} eligibility`}<input type="file" accept=".xlsx" disabled={busy} onChange={e=>{const file=e.target.files?.[0];setFiles(prev=>{const next={...prev};if(file)next[kind]=file;else delete next[kind];return next;});setPreview(null);setNotice('');setImportDuplicates([]);setImportDecisions({});}}/></label>)}</div>
    <button disabled={busy||Object.keys(files).length!==3} onClick={()=>inspect()}>{busy?'Working…':'Validate and preview import'}</button>
    {importDuplicates.length>0&&<DuplicateChoices duplicates={importDuplicates} decisions={importDecisions}
      setDecisions={setImportDecisions} onEdit={editExisting} onContinue={()=>inspect(importDecisions)} busy={busy} importing/>}
    {preview&&<div className="radar-extract-result"><p><strong>{preview.summary.new} new · {preview.summary.updates} updates · {preview.summary.criteria} eligibility conditions · {preview.summary.summaries ?? 0} summaries · {preview.summary.documents ?? 0} documents · {preview.summary.skipped} skipped rows</strong></p>
      {preview.already_imported?<p>These files have already been imported.</p>:<><div className="radar-table-wrap"><table><thead><tr><th>Tender</th><th>Action</th><th>Changes</th></tr></thead><tbody>{preview.summary.changes.map(c=><tr key={c.tender_id}><td>{c.tender_id}<span>{c.title}</span></td><td>{c.action}</td><td>{c.fields?.map(f=><span key={f.field}>{f.field}: {String(f.before??'—')} → {String(f.after??'—')}</span>)}</td></tr>)}</tbody></table></div><p>Confirm to write approved records to the database. This preview expires after 30 minutes.</p><button className="radar-primary" disabled={busy} onClick={commit}>Confirm import</button></>}
    </div>}
    </details>
    {notice&&<p role="status">{notice}</p>}{error&&<p className="radar-error" role="alert">{error}</p>}
  </section>;
}
