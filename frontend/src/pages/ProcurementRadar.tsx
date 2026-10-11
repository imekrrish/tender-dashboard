import { useEffect, useState } from 'react';
import { api } from '../services/api';
import './ProcurementRadar.css';

type RecordData = Record<string, string | number | boolean | null>;
type Field = { type: string; required: boolean; generated: boolean };
type Definition = { resources: Record<string, [string,string]>; schema: Record<string, Record<string,Field>>; statuses: string[] };
type Tender = RecordData & { id: string; title: string; tender_id: string; current_status: string; tender_close_date: string };
type Detail = Tender & { documents: RecordData[]; corrigenda: RecordData[]; eligibility: RecordData | null };
type Catalogs = Record<string, RecordData[]>;
const emptyFilters = {status:'Open',search:'',product_id:'',scope_id:'',region_id:'',country_id:'',authority_id:''};
const catalogFilters = [['product_id','Product Segment','products','product_id'],['scope_id','Contract Scope','scopes','scope_id'],['region_id','Region','regions','region_id'],['country_id','Country','countries','country_id'],['authority_id','Issuing Authority','authorities','authority_id']];
const labels = (key: string) => key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const number = (v: unknown) => v == null ? '—' : Number(v).toLocaleString('en-IN',{maximumFractionDigits:2});
const date = (v: unknown) => v ? new Date(String(v)).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}) : '—';
const message = (e: unknown) => (e as {response?:{data?:{error?:string}}})?.response?.data?.error || 'Unable to connect to the backend. Please retry.';
const safeUrl = (value: unknown) => { try { const u = new URL(String(value)); return ['https:','http:'].includes(u.protocol) ? u.href : undefined; } catch { return undefined; } };
const money = (row: RecordData, key: string) => row[key] == null ? '—' : `${row.emd_currency || ''} ${number(row[key])}`;
const referenceFields: Record<string,[string,string]> = {
  region_id:['regions','region_id'],country_id:['countries','country_id'],authority_id:['authorities','authority_id'],
  product_id:['products','product_id'],scope_id:['scopes','scope_id'],tender_id:['tenders','id'],
};
const notice = 'The information presented in this dashboard is curated and maintained within the TaiyangNews database for market tracking and preliminary screening purposes only. Tender specifications, eligibility criteria, values, corrigenda and submission cutoffs may change. Bidders must consult official procurement portals and download official tender documents (RfS / NIT / BOQ / Addenda) before making commercial decisions or submitting bids. This dashboard serves solely as an initial discovery step.';

export function ProcurementRadar({onPrices}:{onPrices:()=>void}) {
  const [view,setView] = useState<'dashboard'|'masters'>('dashboard');
  const [filters,setFilters] = useState(emptyFilters);
  const [catalogs,setCatalogs] = useState<Catalogs>({});
  const [statuses,setStatuses] = useState<string[]>([]);
  const [rows,setRows] = useState<Tender[]>([]);
  const [summary,setSummary] = useState<RecordData>({});
  const [offset,setOffset] = useState(0);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);
  const [detail,setDetail] = useState<Detail | null>(null);
  const [detailLoading,setDetailLoading] = useState(false);
  const [adminKey,setAdminKey] = useState('');
  const [keyInput,setKeyInput] = useState('');
  const [definition,setDefinition] = useState<Definition | null>(null);
  const [resource,setResource] = useState('products');
  const [adminRows,setAdminRows] = useState<RecordData[]>([]);
  const [references,setReferences] = useState<Catalogs>({});
  const [editor,setEditor] = useState<{id?:string; data:RecordData} | null>(null);
  const [busy,setBusy] = useState(false);
  const [adminError,setAdminError] = useState('');
  const auth = {headers:{Authorization:`Bearer ${adminKey}`}};

  useEffect(()=> { let active = true;
    api.get('/radar/catalogs').then(({data})=> {if(active) {setCatalogs(data);setStatuses(data.statuses);}}).catch(e=> {if(active)setError(message(e));});
    return ()=> {active=false;};
  },[revision]);
  useEffect(()=> { const controller = new AbortController(); setLoading(true);setError('');
    const timer = setTimeout(()=> api.get('/radar/tenders',{params:{...filters,offset,limit:50},signal:controller.signal})
      .then(({data})=> {setRows(data.data);setSummary(data.summary);})
      .catch(e=> {if(!controller.signal.aborted) {setRows([]);setSummary({});setError(message(e));}})
      .finally(()=> {if(!controller.signal.aborted)setLoading(false);}),200);
    return ()=> {clearTimeout(timer);controller.abort();};
  },[filters,offset,revision]);
  useEffect(()=> { if(!adminKey || !definition)return; let active=true;setAdminError('');
    Promise.all([api.get(`/radar/admin/${resource}`,auth),api.get('/radar/admin/tenders',auth)])
    .then(([list,tenders])=> {if(active) {setAdminRows(list.data);setReferences({...catalogs,tenders:tenders.data});}})
    .catch(e=> {if(active)setAdminError(message(e));});
    return ()=> {active=false;};
  },[adminKey,definition,resource,revision,catalogs]);
  useEffect(()=> { const escape=(event:KeyboardEvent)=> {if(event.key==='Escape') {setDetail(null);setEditor(null);}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  const changeFilter = (key:string,value:string)=> {setFilters(prev=>({...prev,[key]:value,...(key==='region_id'?{country_id:''}:{})}));setOffset(0);};
  async function openDetail(id:string) {setDetailLoading(true);try{setDetail((await api.get(`/radar/tenders/${id}`)).data);}catch(e){setError(message(e));}finally{setDetailLoading(false);}}
  async function login() {setBusy(true);setAdminError('');try{const {data}=await api.get('/radar/admin/schema',{headers:{Authorization:`Bearer ${keyInput}`}});setDefinition(data);setAdminKey(keyInput);setKeyInput('');}catch(e){setAdminError(message(e));}finally{setBusy(false);}}
  async function save() {if(!editor || !definition)return;setBusy(true);setAdminError('');try {
    const fields=definition.schema[definition.resources[resource][0]], payload:RecordData={};
    for(const [key,value] of Object.entries(editor.data)) {if(!fields[key] || fields[key].generated)continue;if(value === '' || value == null) {if(editor.id)payload[key]=null;continue;}payload[key]=/NUMERIC|INT/.test(fields[key].type)?Number(value):value;}
    if(editor.id)await api.put(`/radar/admin/${resource}/${editor.id}`,payload,auth);else await api.post(`/radar/admin/${resource}`,payload,auth);
    setEditor(null);setRevision(x=>x+1);
  }catch(e){setAdminError(message(e));}finally{setBusy(false);}}
  async function remove(row:RecordData) {if(!definition)return;const pk=definition.resources[resource][1];if(!window.confirm(`Delete ${row.name || row.title || row[pk]}? Related tender details may also be deleted.`))return;setBusy(true);try{await api.delete(`/radar/admin/${resource}/${row[pk]}`,auth);setRevision(x=>x+1);}catch(e){setAdminError(message(e));}finally{setBusy(false);}}
  async function exportCsv() {try{const {data}=await api.get('/radar/export.csv',{params:filters,responseType:'blob'});const url=URL.createObjectURL(data);const link=document.createElement('a');link.href=url;link.download='procurement-radar.csv';link.click();URL.revokeObjectURL(url);}catch{setError('CSV export failed. Check the database connection and retry.');}}
  const total=Number(summary.total || 0);

  return <div className="radar">
    <header className="radar-header"><div className="radar-brand"><span className="radar-logo">T</span><div><h1>TaiyangNews <span>Procurement Radar</span></h1><p>Solar PV, Floating Solar &amp; BESS Intelligence</p></div></div><nav aria-label="Main navigation"><button className={view==='dashboard'?'selected':''} onClick={()=>setView('dashboard')}>Tender Dashboard</button><button className={view==='masters'?'selected':''} onClick={()=>setView('masters')}>Master Tables / Admin</button><button onClick={onPrices}>Price Index ↗</button></nav></header>
    {view==='dashboard'?<div className="radar-layout">
      <aside className="radar-filters"><div className="radar-section-title"><h2>Filter Navigator</h2><button onClick={()=>{setFilters(emptyFilters);setOffset(0);}}>Reset</button></div>
        <label>Quick Search<input placeholder="Tender ID, reference or title" value={filters.search} onChange={e=>changeFilter('search',e.target.value)}/></label>
        <label>Tender Status<select value={filters.status} onChange={e=>changeFilter('status',e.target.value)}><option value="All">All Statuses</option>{statuses.map(s=><option key={s} value={s}>{s==='Open'?'Open (Active Bids)':s}</option>)}</select></label>
        {catalogFilters.map(([key,label,catalog,pk])=><label key={key}>{label}{key==='product_id'&&<small>Master managed</small>}<select value={filters[key as keyof typeof filters]} onChange={e=>changeFilter(key,e.target.value)}><option value="">All {label === 'Country'?'Countries':label+'s'}</option>{(catalogs[catalog]||[]).filter(row=>key!=='country_id'||!filters.region_id||row.region_id===filters.region_id).map(row=><option key={String(row[pk])} value={String(row[pk])}>{row.name}</option>)}</select></label>)}
        <div className="radar-filter-note">Focused intelligence for your next bid.<br/>Default view: Open tenders.</div>
      </aside>
      <main className="radar-main"><div className="radar-heading"><div><p className="radar-eyebrow">MARKET INTELLIGENCE</p><h2>Discover your next opportunity</h2><p>Explore procurement opportunities across solar and storage.</p></div><button className="radar-primary" disabled={loading||!!error} onClick={exportCsv}>Export CSV ↓</button></div>
        <div className="radar-kpis">{[['Pipeline Solar PV / FPV',`${number(summary.solar_mw)} MW`,'Includes solar with storage'],['Pipeline Storage (BESS)',`${number(summary.storage_mwh)} MWh`,`${number(summary.storage_mw)} MW aggregate rating`],['Expiring in < 14 Days',`${number(summary.expiring)} Bids`,'Action on EMD / Bid bonds'],['Filtered Records',`${number(summary.total)} Tenders`,`Status: ${filters.status}`]].map(([label,value,hint])=><article key={label}><p>{label}</p><strong>{loading?'…':value}</strong><small>{hint}</small></article>)}</div>
        <div className="radar-notice"><strong>Notice &amp; Bidder Advisory</strong><p>{notice}</p></div>
        {error&&<div role="alert" className="radar-error">{error}<button onClick={()=>setRevision(x=>x+1)}>Retry</button></div>}
        <section className="radar-tracker" aria-busy={loading}><div className="radar-section-title"><div><h2>Active Tender Intelligence Tracker</h2><p>{loading?'Loading…':`${total} Records`} · Sorted by due date, soonest first</p></div></div>
          <div className="radar-table-wrap"><table><thead><tr>{['Tender ID / Ref','Region & Country','Tech & Capacity','Status & Scope','Commercial Eligibility','Technical Track Record','Bid Due Date','Action'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{!loading&&rows.map(row=><tr key={row.id}><td><strong>{row.tender_id}</strong><span>{row.ref_number || '—'}</span><p>{row.title}</p></td><td>{row.country}<span>{row.region} · {row.state}</span></td><td><strong>{row.product}</strong><span>{number(row.total_capacity_mw)} MW{row.storage_capacity_mwh!=null?` / ${number(row.storage_capacity_mwh)} MWh`:''}</span></td><td><span className={'radar-badge '+(row.current_status==='Open'?'open':'')}>{row.current_status}</span><span>{row.scope}</span></td><td>EMD: {money(row,'emd_amount')}<span>MAAT: {money(row,'desired_turnover')}</span></td><td>{row.manufacturer||'—'}<span>Installed: {number(row.min_installed_capacity_mw)} MW</span></td><td>{date(row.tender_close_date)}</td><td><button disabled={detailLoading} onClick={()=>openDetail(row.id)}>View →</button></td></tr>)}{!loading&&!rows.length&&<tr><td colSpan={8} className="radar-empty">{error?'Tender data is unavailable.':'No tenders match these filters.'}</td></tr>}{loading&&<tr><td colSpan={8} className="radar-empty">Loading tender intelligence…</td></tr>}</tbody></table></div>
          <div className="radar-pagination"><span>{total?`${offset+1}–${Math.min(offset+rows.length,total)} of ${total}`:'0 Records'}</span><button disabled={!offset||loading} onClick={()=>setOffset(x=>Math.max(0,x-50))}>Previous</button><button disabled={offset+50>=total||loading} onClick={()=>setOffset(x=>x+50)}>Next</button></div>
        </section>
      </main>
    </div>:<main className="radar-admin"><p className="radar-eyebrow">DATA WORKSPACE</p><h2>Master Catalogs &amp; Tender Administration</h2><p>Manage standardized categories, tender records, eligibility, documents and corrigenda.</p>
      {!adminKey?<form className="radar-login" onSubmit={e=>{e.preventDefault();login();}}><h3>Admin access</h3><label>Admin access key<input type="password" autoComplete="off" required value={keyInput} onChange={e=>setKeyInput(e.target.value)}/></label><p>The key is retained only for this session.</p><button className="radar-primary" disabled={busy}>Unlock administration</button>{adminError&&<p role="alert">{adminError}</p>}</form>:<>
      <div className="radar-catalog-tabs">{definition&&Object.keys(definition.resources).map(key=><button className={resource===key?'selected':''} key={key} onClick={()=>{setResource(key);setEditor(null);setAdminRows([]);}}>{labels(key)}{catalogs[key]&&` · ${catalogs[key].length}`}</button>)}<button onClick={()=>{setAdminKey('');setDefinition(null);setAdminRows([]);setEditor(null);}}>Lock admin</button></div>
      <div className="radar-section-title"><h3>Manage {labels(resource)}</h3><button className="radar-primary" onClick={()=>{setAdminError('');setEditor({data:{}});}}>+ Add New Entry</button></div>
      {adminError&&<p className="radar-error" role="alert">{adminError}</p>}
      <div className="radar-table-wrap"><table><thead><tr><th>Identifier</th><th>Display Name / Details</th><th>Actions</th></tr></thead><tbody>{adminRows.map(row=>{const pk=definition!.resources[resource][1];return <tr key={String(row[pk])}><td>{row.code||row.iso_code||row.tender_id||row[pk]}</td><td>{row.name||row.title||row.document_title||row.summary_of_changes||'Eligibility record'}</td><td><button onClick={()=>{setAdminError('');setEditor({id:String(row[pk]),data:row});}}>Edit</button><button className="radar-danger" disabled={busy} onClick={()=>remove(row)}>Delete</button></td></tr>;})}{!adminRows.length&&<tr><td colSpan={3} className="radar-empty">No entries. Add your first record.</td></tr>}</tbody></table></div>
      </>}
    </main>}
    <footer>© 2026 TaiyangNews. All rights reserved. Data intended solely for preliminary discovery.<br/>Always cross-check critical submission dates and eligibility benchmarks on the respective official portals.</footer>
    {detail&&<div className="radar-overlay"><section className="radar-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="radar-section-title"><div><p className="radar-eyebrow">{detail.product} · {detail.tender_id}</p><h2 id="detail-title">{detail.title}</h2></div><button autoFocus onClick={()=>setDetail(null)} aria-label="Close tender details">✕</button></div><p className="radar-notice">Verification Notice: This summary reflects database records. Prospective bidders must review official specifications and corrigenda before submission.</p>
      <div className="radar-detail-grid"><section><h3>Financial &amp; Commercials</h3><dl>{['emd_amount','desired_turnover','ld_clause'].map(k=><div key={k}><dt>{k==='desired_turnover'?'Min. Annual Turnover (MAAT)':labels(k)}</dt><dd>{k==='ld_clause'?detail[k]||'—':money(detail,k)}</dd></div>)}</dl></section><section><h3>Technical Track Record &amp; Specs</h3><dl>{['min_installed_capacity_mw','manufacturer','certifications','module_tech','storage_capacity_mwh','floater_tech'].map(k=><div key={k}><dt>{labels(k)}</dt><dd>{detail[k]??'—'}</dd></div>)}</dl></section></div>
      <h3>Tender Document Bucket</h3>{safeUrl(detail.link_to_tender)&&<a className="radar-link" target="_blank" rel="noopener noreferrer" href={safeUrl(detail.link_to_tender)}>Official Portal ↗</a>}<p>Download ZIP will be available after document storage is configured.</p>{detail.documents.length?detail.documents.map(doc=><p key={String(doc.doc_id)}><a className="radar-link" target="_blank" rel="noopener noreferrer" href={safeUrl(doc.document_bucket_url)}>{doc.document_title} ↗</a></p>):<p>No tender documents recorded.</p>}
      <h3>Corrigenda &amp; Extensions</h3>{detail.corrigenda.length?detail.corrigenda.map(c=><div key={String(c.corrigendum_id)}><strong>#{c.corrigendum_no} · {date(c.issue_date)}</strong><p>{c.summary_of_changes}</p><p>Revised deadline: {date(c.new_close_date)}</p>{safeUrl(c.document_url)&&<a href={safeUrl(c.document_url)} target="_blank" rel="noopener noreferrer">View corrigendum ↗</a>}</div>):<p>No corrigenda recorded. Always verify the official portal.</p>}
    </section></div>}
    {editor&&definition&&<div className="radar-overlay"><form className="radar-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-title" onSubmit={e=>{e.preventDefault();save();}}><div className="radar-section-title"><h2 id="editor-title">{editor.id?'Edit':'Add'} {labels(resource)}</h2><button type="button" onClick={()=>setEditor(null)} aria-label="Close editor">✕</button></div><div className="radar-editor-grid">{Object.entries(definition.schema[definition.resources[resource][0]]).filter(([key,f])=>!f.generated && !(editor.id&&key===definition.resources[resource][1])).map(([key,field])=> {
      const val=editor.data[key], ref=field.type==='UUID'?referenceFields[key]:undefined;
      const update=(v:string|boolean)=>setEditor(prev=>prev?{...prev,data:{...prev.data,[key]:v}}:null);
      return <label key={key}>{labels(key)}{field.required?' *':''}{ref?<select required={field.required} value={String(val??'')} onChange={e=>update(e.target.value)}><option value="">Select…</option>{(references[ref[0]]||[]).map(r=><option key={String(r[ref[1]])} value={String(r[ref[1]])}>{r.name||r.title||r.tender_id}</option>)}</select>:field.type==='tender_status_enum'?<select required value={String(val??'Open')} onChange={e=>update(e.target.value)}><option value="">Select…</option>{definition.statuses.map(s=><option key={s}>{s}</option>)}</select>:field.type==='BOOLEAN'?<select value={val==null?'':String(val)} onChange={e=>update(e.target.value===''?'':e.target.value==='true')}><option value="">Default</option><option value="true">Yes</option><option value="false">No</option></select>:field.type==='TEXT'?<textarea value={String(val??'')} onChange={e=>update(e.target.value)}/>:<input required={field.required} type={/NUMERIC|INT/.test(field.type)?'number':field.type==='DATE'?'date':field.type==='TIMESTAMPTZ'?'datetime-local':'text'} min={/NUMERIC|INT/.test(field.type)?0:undefined} step={field.type==='INT'?1:'any'} value={field.type==='DATE'&&val?String(val).slice(0,10):field.type==='TIMESTAMPTZ'&&val?toLocal(String(val)):String(val??'')} onChange={e=>update(field.type==='TIMESTAMPTZ'&&e.target.value?new Date(e.target.value).toISOString():e.target.value)}/>}</label>;
    })}</div>{adminError&&<p role="alert" className="radar-error">{adminError}</p>}<div className="radar-form-actions"><button type="button" onClick={()=>setEditor(null)}>Cancel</button><button className="radar-primary" disabled={busy}>{busy?'Saving…':'Save'}</button></div></form></div>}
  </div>;
}
function toLocal(value:string) {const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
