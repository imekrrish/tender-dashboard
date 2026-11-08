import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { Header } from '../components/layout/Header';
import { KpiCard } from '../components/dashboard/KpiCard';
import { Sun, BatteryCharging, Hourglass, CheckCircle2 } from 'lucide-react';
import './ProcurementRadar.css';
import {SeciExtraction} from './SeciExtraction';
import {eligibilityLabels, eligibilityValue, SourceLink, tenderCapacity, TenderTables, type EligibilityEntry} from './TenderTables';

type RecordData = Record<string, string | number | boolean | null>;
type Field = { type: string; required: boolean; generated: boolean };
type Definition = { resources: Record<string, [string,string]>; schema: Record<string, Record<string,Field>>; statuses: string[] };
type Tender = RecordData & { id: string; title: string; tender_id: string; current_status: string; tender_close_date: string };
type Detail = {documents: RecordData[]; corrigenda: RecordData[]; eligibility_entries: EligibilityEntry[]};
type Catalogs = Record<string, RecordData[]>;
const emptyFilters = {status:'Open',search:'',product_ids:'',scope_id:'',region_id:'',country_id:'',authority_id:''};
const catalogFilters = [['scope_id','Contract Scope','scopes','scope_id'],['region_id','Region','regions','region_id'],['country_id','Country','countries','country_id'],['authority_id','Issuing Authority','authorities','authority_id']];
const labels = (key: string) => key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const number = (v: unknown) => v == null ? '—' : Number(v).toLocaleString('en-IN',{maximumFractionDigits:2});
const date = (v: unknown) => v ? new Date(String(v)).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}) : '—';
const message = (e: unknown) => (e as {response?:{data?:{error?:string}}})?.response?.data?.error || 'Unable to connect to the backend. Please retry.';
const safeUrl = (value: unknown) => { try { const u = new URL(String(value)); return ['https:','http:'].includes(u.protocol) ? u.href : undefined; } catch { return undefined; } };
const resourceTitles: Record<string,string> = {products:'Product Segments',scopes:'Contract Scopes',authorities:'Issuing Authorities',regions:'Regions',countries:'Countries',tenders:'Tenders',eligibility:'Eligibility',documents:'Documents',corrigenda:'Corrigenda'};
const masterColumns: Record<string,string[]> = {products:['code','name','description','is_active'],scopes:['code','name','description','is_active'],authorities:['code','name','portal_url'],regions:['code','name'],countries:['iso_code','name','region_id'],tenders:['tender_id','title','current_status','tender_open_date','tender_close_date','id'],eligibility:['tender_id','emd_currency','emd_amount','desired_turnover'],documents:['document_title','doc_type','document_bucket_url'],corrigenda:['corrigendum_no','issue_date','new_close_date','summary_of_changes']};
const eligibilityFields:Record<string,string[]>={Financial:['tender_id','emd_currency','emd_amount','emd_mode','desired_turnover','net_worth_requirement','working_capital_requirement','estimated_project_value','performance_bg_pct','tender_document_fee','performance_bg_terms','estimated_project_value_terms'],Technical:['tender_id','manufacturer','min_manf_capacity_mw','certifications','min_installed_capacity_mw','technical_track_record_text'],General:['tender_id','ld_clause','ld_cap_pct','no_of_partners_allowed']};
const referenceFields: Record<string,[string,string]> = {
  region_id:['regions','region_id'],country_id:['countries','country_id'],authority_id:['authorities','authority_id'],
  product_id:['products','product_id'],scope_id:['scopes','scope_id'],tender_id:['tenders','id'],
};
const notice = 'The information presented in this dashboard is curated and maintained within the TaiyangNews database for market tracking and preliminary screening purposes only. While every effort is made to maintain accuracy, tender specifications, eligibility criteria, values, corrigenda, and submission cutoffs are subject to unilateral changes by the respective issuing authorities. Bidders and participating parties must consult official procurement portals and download official tender documents (RfS / NIT / BOQ / Addenda) before making commercial decisions or submitting bids. This dashboard serves solely as an initial discovery step.';

export function ProcurementRadar() {
  const [view,setView] = useState<'dashboard'|'masters'>('dashboard');
  const [filters,setFilters] = useState(emptyFilters);
  const [catalogs,setCatalogs] = useState<Catalogs>({});
  const [statuses,setStatuses] = useState<string[]>([]);
  const [rows,setRows] = useState<Tender[]>([]);
  const [summary,setSummary] = useState<RecordData>({});
  const [analytics,setAnalytics] = useState<Record<string,number|null>>();
  const [offset,setOffset] = useState(0);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);
  const [adminKey,setAdminKey] = useState('');
  const [keyInput,setKeyInput] = useState('');
  const [definition,setDefinition] = useState<Definition | null>(null);
  const [resource,setResource] = useState('products');
  const [eligibilitySection,setEligibilitySection]=useState('Financial');
  const [adminRows,setAdminRows] = useState<RecordData[]>([]);
  const [references,setReferences] = useState<Catalogs>({});
  const [editor,setEditor] = useState<{id?:string; data:RecordData} | null>(null);
  const [busy,setBusy] = useState(false);
  const [adminError,setAdminError] = useState('');
  const [uploadNotice,setUploadNotice] = useState('');
  const auth = {headers:{Authorization:`Bearer ${adminKey}`}};

  useEffect(()=> { let active = true;
    api.get('/radar/catalogs').then(({data})=> {if(active) {setCatalogs(data);setStatuses(data.statuses);}}).catch(e=> {if(active)setError(message(e));});
    return ()=> {active=false;};
  },[revision]);
  useEffect(()=> { const controller = new AbortController(); setLoading(true);setError('');
    const timer = setTimeout(()=> api.get('/radar/tenders',{params:{...filters,offset,limit:50,include_analytics:true},signal:controller.signal})
      .then(({data})=> {setRows(data.data);setSummary(data.summary);setAnalytics(data.eligibility_analytics);})
      .catch(e=> {if(!controller.signal.aborted) {setRows([]);setSummary({});setAnalytics(undefined);setError(message(e));}})
      .finally(()=> {if(!controller.signal.aborted)setLoading(false);}),200);
    return ()=> {clearTimeout(timer);controller.abort();};
  },[filters,offset,revision]);
  useEffect(()=> { if(!adminKey || !definition)return; let active=true;setAdminError('');
    Promise.all([api.get(`/radar/admin/${resource}`,auth),api.get('/radar/admin/tenders',auth)])
    .then(([list,tenders])=> {if(active) {setAdminRows(list.data);setReferences({...catalogs,tenders:tenders.data});}})
    .catch(e=> {if(active)setAdminError(message(e));});
    return ()=> {active=false;};
  },[adminKey,definition,resource,revision,catalogs]);
  useEffect(()=> { const escape=(event:KeyboardEvent)=> {if(event.key==='Escape') setEditor(null);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  useEffect(()=> {
    if(!editor)return;
    const previous=document.activeElement as HTMLElement | null;
    const dialog=document.querySelector<HTMLElement>('.radar-overlay [role=dialog]');
    const focusable=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea')||[]);
    focusable()[0]?.focus();
    const trap=(event:KeyboardEvent)=> {if(event.key!=='Tab')return;const list=focusable();const first=list[0],last=list[list.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
    document.addEventListener('keydown',trap);return()=> {document.removeEventListener('keydown',trap);previous?.focus();};
  },[!!editor]);
  useEffect(()=> {
    const refresh=()=> {if(document.visibilityState==='visible')setRevision(x=>x+1);};
    const timer=window.setInterval(refresh,60000);window.addEventListener('focus',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[]);
  const changeFilter = (key:string,value:string)=> {setFilters(prev=>({...prev,[key]:value,...(key==='region_id'?{country_id:''}:{})}));setOffset(0);};
  async function login() {setBusy(true);setAdminError('');try{const {data}=await api.get('/radar/admin/schema',{headers:{Authorization:`Bearer ${keyInput}`}});setDefinition(data);setAdminKey(keyInput);setKeyInput('');}catch(e){setAdminError(message(e));}finally{setBusy(false);}}
  async function downloadTemplate() {
    try { const {data}=await api.get('/radar/admin/tenders/template.xlsx',{...auth,responseType:'blob'});
      const url=URL.createObjectURL(data), link=document.createElement('a');link.href=url;link.download='tenders-template.xlsx';link.click();URL.revokeObjectURL(url);
    } catch(e) {setAdminError(message(e));}
  }
  async function uploadTenders(file:File) {
    setBusy(true);setAdminError('');setUploadNotice('');
    try {const form=new FormData();form.append('file',file);const {data}=await api.post('/radar/admin/tenders/upload',form,auth);setUploadNotice(`${data.imported} tenders uploaded successfully.`);setRevision(x=>x+1);}
    catch(e) {setAdminError(message(e));}finally {setBusy(false);}
  }
  async function save() {if(!editor || !definition)return;setBusy(true);setAdminError('');try {
    const fields=definition.schema[definition.resources[resource][0]], payload:RecordData={};
    for(const [key,value] of Object.entries(editor.data)) {if(!fields[key] || fields[key].generated || key==='current_status' || resource==='eligibility'&&!eligibilityFields[eligibilitySection].includes(key))continue;if(value === '' || value == null) {if(editor.id)payload[key]=null;continue;}payload[key]=/NUMERIC|INT/.test(fields[key].type)?Number(value):value;}
    if(editor.id)await api.put(`/radar/admin/${resource}/${editor.id}`,payload,auth);else await api.post(`/radar/admin/${resource}`,payload,auth);
    setEditor(null);setRevision(x=>x+1);
  }catch(e){setAdminError(message(e));}finally{setBusy(false);}}
  async function remove(row:RecordData) {if(!definition)return;const pk=definition.resources[resource][1];if(!window.confirm(`Delete ${row.name || row.title || row[pk]}? Related tender details may also be deleted.`))return;setBusy(true);try{await api.delete(`/radar/admin/${resource}/${row[pk]}`,auth);setRevision(x=>x+1);}catch(e){setAdminError(message(e));}finally{setBusy(false);}}
  async function exportExcel() {try{const {data}=await api.get('/radar/export.xlsx',{params:filters,responseType:'blob'});const url=URL.createObjectURL(data);const link=document.createElement('a');link.href=url;link.download='procurement-radar.xlsx';link.click();URL.revokeObjectURL(url);}catch{setError('Excel download failed. Check the database connection and retry.');}}
  const total=Number(summary.total || 0);
  const activeColumns=resource==='eligibility'?eligibilityFields[eligibilitySection].slice(0,6):masterColumns[resource]||['code','name'];
  const displayCell=(row:RecordData,key:string)=> {const value=row[key];if(key==='region_id')return catalogs.regions?.find(r=>r.region_id===value)?.name||'—';if(key==='tender_id'&&resource!=='tenders')return references.tenders?.find(r=>r.id===value)?.tender_id||value||'—';if(key.endsWith('_date'))return date(value);if(typeof value==='boolean')return value?'Active':'Inactive';return value??'—';};

  const filterSidebar = (
      <div className="radar-filters"><div className="radar-section-title"><h2>Filter Navigator</h2><button onClick={()=>{setFilters(emptyFilters);setOffset(0);}}>Reset</button></div>
        <label>Quick Search<input placeholder="Title, ID, or Keywords..." value={filters.search} onChange={e=>changeFilter('search',e.target.value)}/></label>
        <label>Tender Status<select value={filters.status} onChange={e=>changeFilter('status',e.target.value)}><option value="All">All Statuses</option>{statuses.map(s=><option key={s} value={s}>{s==='Open'?'Open (Active Bids)':s==='Awarded'?'Awarded / Closed':s}</option>)}</select></label>
        <fieldset className="radar-product-filter"><legend>Product Segment <small>Master Managed</small></legend>{(catalogs.products||[]).filter(row=>row.is_active!==false || filters.product_ids.split(',').includes(String(row.product_id))).map(row=>{const id=String(row.product_id),selected=filters.product_ids?filters.product_ids.split(','):[];return <label key={id}><input type="checkbox" checked={!selected.length||selected.includes(id)} onChange={e=>{const all=(catalogs.products||[]).filter(p=>p.is_active!==false).map(p=>String(p.product_id));const current=selected.length?selected:all;const next=e.target.checked?[...new Set([...current,id])]:current.filter(x=>x!==id);changeFilter('product_ids',next.length===all.length?'':next.join(','));}}/><span>{row.name}</span></label>;})}<p>Clear all selections to include every segment.</p></fieldset>
        {catalogFilters.map(([key,label,catalog,pk])=><label key={key}>{label}{key==='product_id'&&<small>Categories</small>}<select value={filters[key as keyof typeof filters]} onChange={e=>changeFilter(key,e.target.value)}><option value="">All {label === 'Country'?'countries':label === 'Issuing Authority'?'authorities':label === 'Contract Scope'?'scopes':'regions'}</option>{(catalogs[catalog]||[]).filter(row=>key!=='country_id'||!filters.region_id||row.region_id===filters.region_id).map(row=><option key={String(row[pk])} value={String(row[pk])}>{row.name}</option>)}</select></label>)}

      </div>
  );

  return <div className="radar">
    <DashboardLayout header={<Header title="TaiyangNews Procurement Radar" subtitle="Solar PV, Floating Solar & BESS Intelligence" activeModule="tenders" onModuleChange={()=>{}} onRefresh={()=>setRevision(x=>x+1)} showRefresh={false} navigation={<nav className="radar-view-tabs" aria-label="Procurement views"><button className={view==='dashboard'?'selected':''} onClick={()=>setView('dashboard')}>Tender Dashboard</button><button className={view==='masters'?'selected':''} onClick={()=>setView('masters')}>Master Tables (CRUD) <small>Admin</small></button></nav>} actions={<><span className="radar-header-count">Filtered: <strong>{loading?'…':`${total} ${filters.status==='Open'?'Open ':''}Bids`}</strong></span><button className="radar-export" disabled={loading||!!error} onClick={exportExcel}>Download Excel</button></>}/>} sidebar={view==='dashboard'?filterSidebar:<div className="radar-master-nav"><h2>Master Catalogs</h2>{['products','scopes','authorities','regions','countries'].map(key=><button key={key} className={resource===key?'selected':''} onClick={()=>{setResource(key);setEditor(null);}}>{resourceTitles[key]} <span>{catalogs[key]?.length??0}</span></button>)}</div>}>

    {view==='dashboard'?<div className="radar-dashboard">

      <div className="radar-main">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard label="Pipeline Solar PV / FPV" value={loading?'…':`${number(summary.solar_mw)} MW`} subtitle="Includes FPV + BESS" icon={<Sun className="w-4 h-4"/>}/>
          <KpiCard label="Pipeline Storage (BESS)" value={loading?'…':`${number(summary.storage_mwh)} MWh`} subtitle={`${number(summary.storage_mw)} MW aggregate rating`} icon={<BatteryCharging className="w-4 h-4"/>} accent="bg-amber-50 text-amber-600"/>
          <KpiCard label="Expiring in < 14 Days" value={loading?'…':`${number(summary.expiring)} Bids`} subtitle="Action on EMD / Bid bonds" icon={<Hourglass className="w-4 h-4"/>} accent="bg-rose-50 text-rose-600"/>
          <KpiCard label="Filtered Records" value={loading?'…':`${number(summary.total)} Tenders`} subtitle={filters.status==='Open'?'Default Filter: Open':`Status: ${filters.status}`} icon={<CheckCircle2 className="w-4 h-4"/>}/>
        </div>
        <EligibilityAnalytics total={total} counts={analytics} loading={loading} failed={!!error}/>
        {Number(summary.imported_samples)>0&&<div className="radar-sample-note"><p>{number(summary.imported_samples)} sample records. Verify dates, eligibility and document links on the official portal.</p></div>}
        <details className="radar-notice"><summary>Bidder advisory</summary><p>{notice}</p></details>
        {error&&<div role="alert" className="radar-error">{error}<button onClick={()=>setRevision(x=>x+1)}>Retry</button></div>}
        <section className="radar-tracker" aria-busy={loading}><div className="radar-section-title"><div><h2>Tender Intelligence Tracker</h2><p>{loading?'Loading…':`${total} Records`} · Sorted by: Due Date (Soonest first)</p></div></div>
          <TenderTables rows={rows.map(row=>({
            key:row.id, tenderId:row.tender_id, title:row.title, product:String(row.product ?? ''),
            capacity:tenderCapacity(row.storage_capacity_mw ?? row.total_capacity_mw,row.storage_capacity_mwh),
            status:row.current_status, deadline:date(row.tender_close_date), source:String(row.link_to_tender ?? ''),
          }))} loading={loading} empty="No tenders match these filters."
            renderDetails={id=><SavedTenderDetails key={id} tender={rows.find(row=>row.id===id)!}/>}/>
          <div className="radar-pagination"><span>{total?`${offset+1}–${Math.min(offset+rows.length,total)} of ${total}`:'0 Records'}</span><button disabled={!offset||loading} onClick={()=>setOffset(x=>Math.max(0,x-50))}>Previous</button><button disabled={offset+50>=total||loading} onClick={()=>setOffset(x=>x+50)}>Next</button></div>
        </section>
      </div>
    </div>:<div className="radar-admin"><h2>Master Catalogs</h2>
      {!adminKey?<form className="radar-login" onSubmit={e=>{e.preventDefault();login();}}><h3>Admin access</h3><label>4-digit PIN<input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" required value={keyInput} onChange={e=>setKeyInput(e.target.value)}/></label><p>Enter your PIN to edit records.</p><button className="radar-primary" disabled={busy}>Sign in</button>{adminError&&<p role="alert">{adminError}</p>}</form>:<>
      <div className="radar-catalog-tabs">{definition&&Object.keys(definition.resources).map(key=><button className={resource===key?'selected':''} key={key} onClick={()=>{setResource(key);setEditor(null);setAdminRows([]);}}>{resourceTitles[key]||labels(key)}{catalogs[key]&&` · ${catalogs[key].length}`}</button>)}<button onClick={()=>{setAdminKey('');setDefinition(null);setAdminRows([]);setEditor(null);}}>Sign out</button></div>
      <div className="radar-section-title"><div><h3>Master Table: {resourceTitles[resource]||labels(resource)}</h3><p>{({products:"Manage taxonomy for Solar PV, Floating Solar, Storage, and Hybrid variants.",scopes:"Manage procurement delivery types (Turnkey EPC, RESCO, Tariff-Based, etc.)",authorities:"Manage off-takers, national agencies, and utilities issuing tenders.",regions:"Manage geographic taxonomy and regional grouping.",countries:"Manage geographic taxonomy and regional grouping."} as Record<string,string>)[resource]}</p></div><button className="radar-primary" onClick={()=>{setAdminError('');setEditor({data:{}});}}>Add New Entry</button></div>
      {resource==='tenders'&&<SeciExtraction adminKey={adminKey} onImported={()=>setRevision(x=>x+1)}
        onViewSaved={()=>{setFilters({...emptyFilters,status:'All'});setOffset(0);setView('dashboard');}} onEditExisting={async id=>{
        const {data}=await api.get<RecordData>(`/radar/admin/seci/existing/${id}`,auth);
        setAdminError('');setEditor({id,data});
      }}/>}
      {resource==='tenders'&&<section className="radar-bulk-upload"><h3>Bulk upload tenders</h3><p>Upload the SECI Tenders template directly (keep all 33 column headers), or use DB_Samples_rows with Tenders_Master, Eligibility, Documents and Auction_BI. The optional Notes tab is ignored. SECI deadlines use India time (IST); missing capacity, state and PV type stay unknown. New SECI products, scopes and authorities are added automatically. Maximum 1,000 rows / 5 MB. Invalid or duplicate records cancel the whole upload.</p><p>Future opening dates are Upcoming. Tenders are Open from their opening date until the closing date/time passes, then Archived.</p><button disabled={busy} onClick={downloadTemplate}>Download Excel template</button><label> {busy?'Uploading…':'Upload Excel'}<input type="file" accept=".xlsx,.xls" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)uploadTenders(file);}}/></label>{uploadNotice&&<p role="status">{uploadNotice}</p>}</section>}
      {resource==='eligibility'&&<div className="radar-catalog-tabs" aria-label="Eligibility categories">{['Financial','Technical','General'].map(category=><button key={category} className={eligibilitySection===category?'selected':''} onClick={()=>{setEligibilitySection(category);setEditor(null);}}>{category} eligibility</button>)}</div>}
      {adminError&&<p className="radar-error" role="alert">{adminError}</p>}
      <div className="radar-table-wrap"><table><thead><tr>{activeColumns.map(key=><th key={key}>{key==='region_id'?'Region Assigned':resource==='tenders'&&key==='id'?'TN_tenderID':labels(key)}</th>)}<th>Actions</th></tr></thead><tbody>{adminRows.map(row=>{const pk=definition!.resources[resource][1];return <tr key={String(row[pk])}>{activeColumns.map(key=><td key={key}>{key.endsWith('_url')&&safeUrl(row[key])?<a className="radar-link" href={safeUrl(row[key])} target="_blank" rel="noopener noreferrer">Open link ↗</a>:displayCell(row,key)}</td>)}<td><button onClick={()=>{setAdminError('');setEditor({id:String(row[pk]),data:row});}}>Edit</button><button className="radar-danger" disabled={busy} onClick={()=>remove(row)}>Delete</button></td></tr>;})}{!adminRows.length&&<tr><td colSpan={activeColumns.length+1} className="radar-empty">No entries. Add your first record.</td></tr>}</tbody></table></div>
      </>}
    </div>}
    </DashboardLayout>
    <footer>© 2026 TaiyangNews. All rights reserved. Data intended solely for preliminary discovery.<br/>Always cross-check critical submission dates and eligibility benchmarks on the respective official portals.</footer>
    {editor&&definition&&<div className="radar-overlay"><form className="radar-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-title" onSubmit={e=>{e.preventDefault();save();}}><div className="radar-section-title"><h2 id="editor-title">{editor.id?'Edit':'Add'} {labels(resource)}</h2><button type="button" onClick={()=>setEditor(null)} aria-label="Close editor">✕</button></div><div className="radar-editor-grid">{Object.entries(definition.schema[definition.resources[resource][0]]).filter(([key,f])=>key!=='current_status' && !f.generated && !(editor.id&&key===definition.resources[resource][1]) && (resource!=='eligibility'||eligibilityFields[eligibilitySection].includes(key))).map(([key,field])=> {
      const val=editor.data[key], ref=field.type==='UUID'?referenceFields[key]:undefined;
      const update=(v:string|boolean)=>setEditor(prev=>prev?{...prev,data:{...prev.data,[key]:v}}:null);
      return <label key={key}>{labels(key)}{field.required?' *':''}{field.type==='TEXT[]'?<textarea value={Array.isArray(val)?val.join('\n'):String(val??'')} placeholder="One tag per line" onChange={e=>setEditor(prev=>prev?{...prev,data:{...prev.data,[key]:e.target.value.split('\n').map(v=>v.trim()).filter(Boolean)} as RecordData}:null)}/>:ref?<select required={field.required} value={String(val??'')} onChange={e=>update(e.target.value)}><option value="">Select…</option>{(references[ref[0]]||[]).map(r=><option key={String(r[ref[1]])} value={String(r[ref[1]])}>{r.name||r.title||r.tender_id}</option>)}</select>:field.type==='tender_status_enum'?<select required value={String(val??'Open')} onChange={e=>update(e.target.value)}><option value="">Select…</option>{definition.statuses.map(s=><option key={s}>{s}</option>)}</select>:field.type==='BOOLEAN'?<select value={val==null?'':String(val)} onChange={e=>update(e.target.value===''?'':e.target.value==='true')}><option value="">Default</option><option value="true">Yes</option><option value="false">No</option></select>:field.type==='TEXT'?<textarea value={String(val??'')} onChange={e=>update(e.target.value)}/>:<input required={field.required} type={/NUMERIC|INT/.test(field.type)?'number':field.type==='DATE'?'date':field.type==='TIMESTAMPTZ'?'datetime-local':'text'} min={key==='latitude'?-90:key==='longitude'?-180:/NUMERIC|INT/.test(field.type)?0:undefined} max={key==='latitude'?90:key==='longitude'?180:undefined} step={field.type==='INT'?1:'any'} value={field.type==='DATE'&&val?String(val).slice(0,10):field.type==='TIMESTAMPTZ'&&val?toLocal(String(val)):String(val??'')} onChange={e=>update(field.type==='TIMESTAMPTZ'&&e.target.value?new Date(e.target.value).toISOString():e.target.value)}/>}</label>;
    })}</div>{adminError&&<p role="alert" className="radar-error">{adminError}</p>}<div className="radar-form-actions"><button type="button" onClick={()=>setEditor(null)}>Cancel</button><button className="radar-primary" disabled={busy}>{busy?'Saving…':'Save'}</button></div></form></div>}
  </div>;
}
const eligibilityCharts = [
  {key:'technical',category:'Technical',benchmark:['median_capacity','Median minimum track record',' MW'],metrics:[
    ['track_record','Project track record'], ['manufacturer','Manufacturer / OEM'], ['certifications','Certifications'],
  ]},
  {key:'financial',category:'Financial',benchmark:['median_security','Median performance guarantee','%'],metrics:[
    ['bid_security','Bid security (EMD)'], ['turnover','Minimum turnover'], ['net_worth','Minimum net worth'], ['performance_security','Performance security'],
  ]},
  {key:'contractual',category:'General',benchmark:['median_ld_cap','Median liquidated damages cap','%'],metrics:[
    ['liquidated_damages','Liquidated damages'], ['consortium','Consortium size limit'],
  ]},
];

function EligibilityAnalytics({total,counts,loading,failed}: {
  total:number; counts?:Record<string,number|null>; loading:boolean; failed:boolean;
}) {
  return <section className="radar-eligibility-analytics" aria-labelledby="eligibility-analytics-title" aria-busy={loading}>
    <div className="radar-section-title"><div>
      <h2 id="eligibility-analytics-title">Eligibility Analytics</h2>
      <p>{loading ? 'Loading…' : failed ? 'Eligibility analytics are unavailable.' : total
        ? `Requirements recorded across ${number(total)} matching tenders`
        : 'No tenders match these filters.'}</p>
    </div></div>
    {!loading&&!failed&&total>0&&counts&&<div className="radar-eligibility-charts">
      {eligibilityCharts.map(({key,category,metrics,benchmark:[field,label,unit]})=><article key={key} className="radar-eligibility-card">
        <h3>{eligibilityLabels[category]}</h3>
        <p><strong>{number(counts[key])}</strong> of {number(total)} tenders</p>
        <ul>{metrics.map(([metric,label])=>{
          const count = counts[`${key}_${metric}`] ?? 0;
          return <li key={metric}>
            <div><span>{label}</span><strong>{number(count)}</strong></div>
            <progress value={count} max={total} aria-label={`${label}: ${count} of ${total} tenders`}/>
          </li>;
        })}</ul>
        {counts[`${key}_${field}`]!=null&&<div className="radar-eligibility-benchmark">
          <span>{label}</span><strong>{number(counts[`${key}_${field}`])}{unit}</strong>
        </div>}
      </article>)}
    </div>}
    {!loading&&!failed&&total>0&&counts&&<p className="radar-eligibility-note">Bars count recorded fields. Category totals also include sourced clauses. Medians use recorded numeric values.</p>}
  </section>;
}

const expandedFields = [
  ['Reference','ref_number'], ['Issuing authority','authority'], ['Scope','scope'], ['Country','country'],
  ['State','state'], ['Capacity (MW)','total_capacity_mw'], ['Storage Power (MW)','storage_capacity_mw'],
  ['Storage (MWh)','storage_capacity_mwh'], ['Opens','tender_open_date'], ['Internal ID','id'],
  ['Module Technology','module_tech'], ['Mounting Technology','mounting_tech'], ['Interconnection','interconnection'],
];

function SavedTenderDetails({tender}: {tender:Tender}) {
  const [detail,setDetail] = useState<Detail>();
  const [failed,setFailed] = useState(false);
  useEffect(()=>{
    const controller = new AbortController();
    api.get<Detail>(`/radar/tenders/${tender.id}`,{signal:controller.signal})
      .then(({data})=>setDetail(data)).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
    return ()=>controller.abort();
  },[tender.id]);
  return <div className="radar-expanded-body">
    <dl>{expandedFields.filter(([,key])=>tender[key]!=null && tender[key]!=='').map(([label,key])=><div key={key}>
      <dt>{label}</dt><dd>{key==='tender_open_date' ? date(tender[key]) : String(tender[key])}</dd>
    </div>)}</dl>
    {detail&&Object.entries(eligibilityLabels).map(([category,label])=>{
      const entries = (detail.eligibility_entries ?? []).filter(entry=>entry.category===category);
      if (!entries.length) return null;
      return <details className="radar-tender-eligibility" key={category}>
        <summary>{label} · {entries.length}</summary>
        <ul>{entries.map(entry=>{
          const value = eligibilityValue(entry);
          return <li key={entry.id}><strong>{entry.requirement}</strong>{value!=null&&<> · {value}</>}
            {entry.period&&<> · {entry.period}</>}
            {entry.conditions&&<p>{entry.conditions}</p>}
            {entry.evidence&&<p>Evidence · {entry.evidence}</p>}
            {entry.source_url&&<> · <SourceLink url={entry.source_url} page={entry.page}/></>}
          </li>;
        })}</ul>
      </details>;
    })}
    <strong>Source documents</strong>
    {failed ? <p>Could not load eligibility and documents. Reopen the row to retry.</p> : !detail ? <p>Loading documents…</p> :
      <ul>{detail.documents.map(doc=><li key={String(doc.doc_id)}>
        <SourceLink url={String(doc.document_bucket_url ?? '')} label={String(doc.document_title ?? 'Document')}/>
      </li>)}{detail.corrigenda.map((amendment,index)=><li key={index}>
        Corrigendum {amendment.corrigendum_no} · {amendment.summary_of_changes}
      </li>)}{!detail.documents.length && !detail.corrigenda.length && <li>No linked documents recorded.</li>}</ul>}
  </div>;
}

function toLocal(value:string) {const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
