import {useEffect,useState} from 'react';
import {api} from '../services/api';
import {SourceLink, tenderCapacity, TenderTables, type EligibilityEntry} from './TenderTables';
type Duplicate={tender_id:string;tn_tender_id:string;title:string};
type Decisions=Record<string,'replace'|'skip'>;
type TenderField='title'|'scope'|'product'|'country'|'publication_date'|'closing_date'|'mounting_tech';
type Tender = Partial<Record<TenderField,string|null>> & {
  tender_id:string;url:string;current_status?:string;eligibility_entries?:EligibilityEntry[];
  tn_tender_id?:string;ref_number?:string;total_capacity_mw?:number;storage_capacity_mwh?:number;
};
type Selection = {tender_id:string;corrections:Partial<Record<TenderField,string>>};
type ImportResult = {duplicates?:Duplicate[];imported?:string[]};
type Job={id:string;source_url:string;tender_limit:number;status:string;progress:string;error?:string;created_at:string;result?:{
  tenders?:Tender[];
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
const workbooks = [
  {kind:'tenders',label:'Tenders'}, {kind:'technical',label:'Technical Eligibility'}, {kind:'financial',label:'Financial & Contractual'},
];
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
          <option value="replace">{importing ? 'Update from imported data' : 'Extract again for replacement'}</option>
          <option value="skip">Skip and continue</option>
        </select>
      </label>
      <button type="button" disabled={busy} onClick={async () => {
        if (!await onEdit(duplicate.tn_tender_id)) return;
        setDecisions({...decisions, [duplicate.tender_id]:'skip'});
      }}>Edit existing</button>
    </div>)}
    <button type="button" className="radar-primary" disabled={busy || duplicates.some(row => !decisions[row.tender_id])} onClick={onContinue}>
      {continueLabel ?? (importing ? 'Import with these choices' : 'Continue extraction')}
    </button>
  </div>;
}

function ExtractedReview({job,busy,onImport,onEdit,onDownload}:{
  job:Job;
  busy:boolean;
  onDownload:(kind:string)=>void;
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
  const value=(tender:Tender,key:TenderField)=>edits[tender.tender_id]?.[key] ?? tender[key] ?? '';
  return <div>
    <TenderTables showEligibility rows={tenders.map(tender=>({
      key:tender.tender_id, tenderId:tender.tender_id, title:value(tender,'title'), product:value(tender,'product'),
      capacity:tenderCapacity(tender.total_capacity_mw,tender.storage_capacity_mwh),
      deadline:value(tender,'closing_date'), source:tender.url, eligibility:tender.eligibility_entries,
      selected:!excluded.includes(tender.tender_id), selectionDisabled:busy||imported.includes(tender.tender_id),
      status:imported.includes(tender.tender_id) ? 'Imported' : tender.current_status,
      needsDetails:reviewFields.some(({key})=>key!=='mounting_tech' && /^(?:n\/?a)?$/i.test(value(tender,key).trim())),
    }))} onSelect={(id,checked)=>{
      setExcluded(previous=>checked ? previous.filter(item=>item!==id) : [...previous,id]);
      setDuplicates([]);setDecisions({});
    }} renderDetails={id=>{
      const tender=tenders.find(item=>item.tender_id===id)!;
      const sources=job.result?.sources?.filter(source=>source.tender_id===id && source.url && source.url!==tender.url) ?? [];
      return <div className="radar-expanded-body">
        <dl>
          {tender.ref_number&&<div><dt>Reference</dt><dd>{tender.ref_number}</dd></div>}
          {tender.tn_tender_id&&<div><dt>Internal ID</dt><dd>{tender.tn_tender_id}</dd></div>}
        </dl>
        <div className="radar-extract-files">{reviewFields.map(({key,label})=><label key={key}>{label}
          <input value={value(tender,key)} disabled={busy||imported.includes(id)} onChange={event=>{
            const text=event.target.value;
            setEdits(previous=>({...previous,[id]:{...previous[id],[key]:text}}));
            setDuplicates([]);setDecisions({});
          }}/>
        </label>)}</div>
        {sources.length>0&&<ul>{sources.map((source,index)=><li key={index}>
          <SourceLink url={source.url} label={source.title || 'Document'}/>
        </li>)}</ul>}
      </div>;
    }} download={<details className="radar-tender-download"><summary>Download Excel</summary>
      <div>{workbooks.map(({kind,label})=><button key={kind} type="button" disabled={busy}
        onClick={()=>onDownload(kind)}>{label}</button>)}</div>
    </details>}/>
    {duplicates.length>0&&<DuplicateChoices duplicates={duplicates} decisions={decisions} setDecisions={setDecisions}
      onEdit={onEdit} onContinue={()=>void runImport(decisions)} busy={busy} importing continueLabel="Import with these choices"/>}
    {!duplicates.length&&<button type="button" className="radar-primary" disabled={busy||!selected.length} onClick={()=>void runImport()}>
      {busy ? 'Working…' : `Import selected (${selected.length})`}
    </button>}
  </div>;
}

export function SeciExtraction({adminKey,onImported,onViewSaved,onEditExisting}:{adminKey:string;onImported:()=>void;onViewSaved:()=>void;onEditExisting:(id:string)=>Promise<void>}) {
  const [url,setUrl]=useState('https://www.seci.co.in/tenders'),[limit,setLimit]=useState(5);
  const [jobs,setJobs]=useState<Job[]>([]),[job,setJob]=useState<Job|null>(null);
  const [selected,setSelected]=useState(''),[configured,setConfigured]=useState<boolean|null>(null);
  const [files,setFiles]=useState<Record<string,File>>({});
  const [hasImported,setHasImported]=useState(false);
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
      setHasImported(true);onImported();
      return {imported:result.summary.changes.map((change:{tender_id:string})=>change.tender_id)};
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
    const objectUrl=URL.createObjectURL(data),a=document.createElement('a');a.href=objectUrl;a.download=`${workbooks.find(workbook=>workbook.kind===kind)?.label ?? kind}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  }catch(e){setError(fail(e));}finally{setBusy(false);}}
  async function importFiles(decisions:Decisions = {}) {
    setBusy(true);setError('');setNotice('');
    try {
      const body=new FormData();
      for(const {kind} of workbooks) body.append(kind,files[kind]);
      if (Object.keys(decisions).length) body.append('decisions', JSON.stringify(decisions));
      const {data} = await api.post('/radar/admin/seci/review/preview',body,auth);
      setImportDuplicates(data.duplicates ?? []);
      if (data.duplicates) return;
      if (data.skipped_all) {setNotice('All matching tenders were skipped.');return;}
      const result=data.already_imported ? data : (await api.post(`/radar/admin/seci/review/${data.id}/commit`,{},auth)).data;
      setNotice(result.already_imported ? 'These files were already imported.' :
        `Imported ${result.summary.new} new tenders and ${result.summary.updates} updates.`);
      setHasImported(true);onImported();
    } catch(e) {setError(fail(e));} finally {setBusy(false);}
  }
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
      {canReview&&<ExtractedReview key={job.id} job={job} busy={busy} onImport={importSelection} onEdit={editExisting} onDownload={download}/>}
      {canContinue&&batch&&(batchEnd<batch.links.length ?
        <button type="button" disabled={busy||configured!==true} onClick={()=>void next()}>
          Next {Math.min(job.tender_limit,batch.links.length-batchEnd)} (items {batchEnd+1}–{Math.min(batchEnd+job.tender_limit,batch.links.length)})
        </button> : <p>End of this listing.</p>)}
    </div>}
    <details>
      <summary>Import Excel</summary>
      <p>Choose the three files from the same extraction, then import them together.</p>
      <div className="radar-extract-files">{workbooks.map(({kind,label})=><label key={kind}>{label}
        <input type="file" accept=".xlsx" disabled={busy} onChange={event=>{
          const file=event.target.files?.[0];
          setFiles(previous=>{const next={...previous};if(file)next[kind]=file;else delete next[kind];return next;});
          setNotice('');setImportDuplicates([]);setImportDecisions({});
        }}/>
      </label>)}</div>
      {importDuplicates.length ? <DuplicateChoices duplicates={importDuplicates} decisions={importDecisions}
        setDecisions={setImportDecisions} onEdit={editExisting} onContinue={()=>void importFiles(importDecisions)} busy={busy} importing/>
        : <button type="button" className="radar-primary" disabled={busy||Object.keys(files).length!==3}
          onClick={()=>void importFiles()}>{busy?'Working…':'Import Excel'}</button>}
    </details>
    {hasImported&&<button type="button" onClick={onViewSaved}>View saved tenders</button>}
    {notice&&<p role="status">{notice}</p>}{error&&<p className="radar-error" role="alert">{error}</p>}
  </section>;
}
