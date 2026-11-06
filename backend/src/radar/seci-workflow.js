import XLSX from 'xlsx';
import {createHash} from 'node:crypto';
import {format} from './reference-workbook.js';
import {parseSeciSheet} from './seci-workbook.js';
import {invalid} from './validation.js';

export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const reviewHeaders = ['Review Status','Reviewer Remarks'];
export const tenderHeaders = [...format[0].headers,...reviewHeaders];
export const criterionHeaders = ['Criterion ID','Tender ID','Category','Requirement','Threshold','Unit','Applicable Period','Conditions / Alternatives','Required Evidence','Source URL','PDF Page','Clause','Source Excerpt',...reviewHeaders];
export function tenderCells(t, i) {
  return [i+1,t.tender_id,t.ref_number,t.title,'Solar Energy Corporation of India Limited (SECI)',t.scope,t.product,'',t.publication_date,t.closing_date,t.total_capacity_mw,t.storage_capacity_mwh,t.pv_type,t.module_tech,t.module_eff_pct,t.mounting_tech,t.storage_tech,t.country,t.state,t.city,null,null,null,null,t.interconnection,t.substation_voltage_kv,t.almm_required==null?null:t.almm_required?'Yes':'No',t.dcr_required==null?null:t.dcr_required?'Yes':'No',t.url,null,t.remarks,null,'OpenAI extraction','Pending',''];
}
export function reviewWorkbook(job, kind) {
  const wb = XLSX.utils.book_new(), result=job.result;
  const headers = kind==='tenders' ? tenderHeaders : criterionHeaders;
  const rows = kind==='tenders' ? result.tenders.map(tenderCells) : result.criteria.filter(c=>kind==='financial'?c.category==='Financial':c.category!=='Financial').map(c=>[
    c.criterion_id,c.tender_id,c.category,c.requirement,c.threshold,c.unit,c.period,c.conditions,c.evidence,c.source_url,c.page,c.clause,c.quote,'Pending',''
  ]);
  const sheet=XLSX.utils.aoa_to_sheet([headers,...rows]);
  sheet['!cols']=headers.map(h=>({wch:/Requirement|Conditions|Remarks|Source|Scope|Title/.test(h)?48:22}));
  sheet['!autofilter']={ref:sheet['!ref']};
  XLSX.utils.book_append_sheet(wb,sheet,kind==='tenders'?'Tenders Review':kind==='technical'?'Technical Eligibility':'Financial Eligibility');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Extraction ID',job.id],['Source URL',job.source_url],['Created',String(job.created_at)],['Instructions','Review and correct every condition against its source. Mark accepted rows Approved; Pending and Rejected rows are skipped. Upload all three workbooks together. Keep IDs and headers. Blank optional values stay unknown; no omitted rows are deleted. General conditions are in the technical workbook. PDF Page uses physical pages, starting at 1.'],['Amendments','Resolve overlapping or superseded conditions before approval. Reject obsolete rows.']]),'Extraction');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(result.sources.length?result.sources:[{status:'No documents found'}]),'Sources');
  return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
function readReview(buffer, name, headers) {
  let wb;
  try {wb=XLSX.read(buffer,{type:'buffer',cellDates:true});} catch {invalid(`Cannot read ${name} workbook`);}
  const sheet=wb.Sheets[name], meta=wb.Sheets.Extraction;
  if(!sheet || !meta || !sheet['!ref']) invalid(`Missing ${name} or Extraction sheet`);
  const range=XLSX.utils.decode_range(sheet['!ref']);
  if(range.e.r>5000 || range.e.c>=headers.length) invalid(`${name}: maximum 5,000 rows; keep template columns`);
  for(const [address,cell] of Object.entries(sheet)) if(!address.startsWith('!') && cell.f) invalid(`${name}: formulas are not accepted; paste values`);
  const grid=XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,blankrows:false});
  if(headers.some((h,i)=>grid[0]?.[i]!==h)) invalid(`${name}: keep the original headers and order`);
  const info=XLSX.utils.sheet_to_json(meta,{header:1,defval:null});
  return {jobId:info.find(row=>row[0]==='Extraction ID')?.[1],rows:grid.slice(1)};
}
function approved(row,index,name) {
  const status=String(row[index]||'').trim().toLowerCase();
  if(!['approved','pending','rejected',''].includes(status)) invalid(`${name}: review status must be Approved, Pending or Rejected`);
  return status==='approved';
}
export function parseReviewFiles(files,catalogs) {
  const t=readReview(files.tenders,'Tenders Review',tenderHeaders);
  const technical=readReview(files.technical,'Technical Eligibility',criterionHeaders);
  const financial=readReview(files.financial,'Financial Eligibility',criterionHeaders);
  if(!t.jobId || t.jobId!==technical.jobId || t.jobId!==financial.jobId) invalid('All three files must belong to the same extraction');
  const selected=t.rows.filter(row=>approved(row,33,'Tenders Review'));
  const tenders=selected.length?parseSeciSheet(XLSX.utils.aoa_to_sheet([format[0].headers,...selected.map(row=>row.slice(0,33))]),catalogs):[];
  const criteria=[], seen=new Set();
  for(const [kind,data] of [['technical',technical],['financial',financial]]) for(const row of data.rows) {
    if(!approved(row,13,kind)) continue;
    const [id,tender_id,category,requirement,threshold,unit,period,conditions,evidence,source_url,page,clause,quote,,reviewer_remarks]=row;
    if(!['Technical','Financial','General'].includes(category) || (kind==='financial')!==(category==='Financial')) invalid('Eligibility category must match its workbook');
    if(typeof tender_id!=='string' || !tender_id.trim() || typeof requirement!=='string' || !requirement.trim()) invalid('Approved eligibility requires Tender ID and Requirement');
    for(const text of [requirement,unit,period,conditions,evidence,source_url,clause,quote,reviewer_remarks]) if(text!=null && (typeof text!=='string' || text.length>20000)) invalid('Eligibility text must be at most 20,000 characters');
    if(!source_url || !quote) invalid('Approved eligibility needs a source URL and excerpt');
    try {if(new URL(source_url).protocol!=='https:')invalid('Source URL must use HTTPS');}catch{invalid('Invalid source URL');}
    if(threshold!=null && (typeof threshold!=='number' || !Number.isFinite(threshold))) invalid('Threshold must be a number or blank; put units in Unit');
    if(page!=null && (!Number.isInteger(page) || page<1 || page>10000)) invalid('PDF Page must be a positive whole number or blank');
    const criterion_id=id || digest([t.jobId,tender_id,source_url,clause,requirement]);
    if(typeof criterion_id!=='string' || !/^[a-f0-9]{64}$/.test(criterion_id) || seen.has(criterion_id)) invalid('Invalid or duplicate Criterion ID');
    seen.add(criterion_id);
    criteria.push({criterion_id,tender_id:tender_id.trim(),category,requirement:requirement.trim(),threshold,unit,period,conditions,evidence,source_url,page,clause,quote,reviewer_remarks});
  }
  if(!tenders.length && !criteria.length) invalid('No approved rows found. Review the files and mark accepted rows Approved');
  const reviews=Object.fromEntries(selected.map(row=>[String(row[1]),{status:'Approved',remarks:row[34]??null}]));
  return {jobId:t.jobId,tenders:[...tenders],catalogs:tenders.catalogs||[],criteria,reviews,skipped:t.rows.length+technical.rows.length+financial.rows.length-tenders.length-criteria.length};
}

export async function previewReview(db,files,catalogs) {
  const payload=parseReviewFiles(files,catalogs);
  const job=(await db.query('SELECT * FROM radar_extraction_jobs WHERE id=$1',[payload.jobId])).rows[0];
  if(!job?.result || !['completed','partial'].includes(job.status)) invalid('Extraction is missing or not ready for review');
  const allowed=new Set(job.result.tenders.map(t=>t.tender_id));
  payload.documents=job.result.sources.filter(s=>s.tender_id && s.url && new URL(s.url).pathname.startsWith('/uploads/tenders/') && payload.tenders.some(t=>t.tender_id===s.tender_id));
  for(const t of [...payload.tenders,...payload.criteria]) if(!allowed.has(t.tender_id)) invalid(`Tender ${t.tender_id} does not belong to this extraction`);
  const sourceCriteria=new Map(job.result.criteria.map(c=>[c.criterion_id,c.tender_id]));
  for(const c of payload.criteria) if(sourceCriteria.has(c.criterion_id) && sourceCriteria.get(c.criterion_id)!==c.tender_id) invalid('Criterion ID cannot move to another tender');
  const ids=[...new Set([...payload.tenders,...payload.criteria].map(t=>t.tender_id))];
  const existing=await db.query(`SELECT * FROM tenders WHERE tender_id IN (${ids.map((_,i)=>`$${i+1}`).join(',')})`,ids);
  const byId=new Map(existing.rows.map(t=>[t.tender_id,t]));
  for(const c of payload.criteria) if(!byId.has(c.tender_id) && !payload.tenders.some(t=>t.tender_id===c.tender_id)) invalid(`Approve tender ${c.tender_id} first, or include it in this upload`);
  payload.snapshot=Object.fromEntries(ids.map(id=>[id,byId.has(id)?digest(byId.get(id)):null]));
  payload.criterionSnapshot={};
  for(const c of payload.criteria) {
    const old=(await db.query('SELECT * FROM tender_eligibility_criteria WHERE criterion_id=$1',[c.criterion_id])).rows[0];
    if(old && old.tender_id!==byId.get(c.tender_id)?.id) invalid('Criterion ID already belongs to another tender');
    payload.criterionSnapshot[c.criterion_id]=old?digest(old):null;
  }
  const changes=payload.tenders.map(t=>({tender_id:t.tender_id,action:byId.has(t.tender_id)?'Update':'New',title:t.title,
    fields:Object.entries(t).filter(([k,v])=>!['source_data','import_source'].includes(k) && String(byId.get(t.tender_id)?.[k]??'')!==String(v??'')).map(([field,after])=>({field,before:byId.get(t.tender_id)?.[field]??null,after}))}));
  const summary={new:changes.filter(c=>c.action==='New').length,updates:changes.filter(c=>c.action==='Update').length,criteria:payload.criteria.length,skipped:payload.skipped,changes};
  const hash=digest(['tenders','technical','financial'].map(k=>[k,digest(files[k])]));
  const old=(await db.query('SELECT * FROM radar_review_batches WHERE digest=$1',[hash])).rows[0];
  if(old?.committed_at) return {id:old.id,summary:old.summary,already_imported:true};
  const row=(await db.query(`INSERT INTO radar_review_batches(digest,payload,summary) VALUES($1,$2,$3)
    ON CONFLICT(digest) DO UPDATE SET payload=EXCLUDED.payload,summary=EXCLUDED.summary,created_at=now() WHERE radar_review_batches.committed_at IS NULL RETURNING id`,[hash,JSON.stringify(payload),JSON.stringify(summary)])).rows[0];
  if(!row) return {id:old?.id,summary,already_imported:true};
  return {id:row.id,summary,already_imported:false};
}
export async function commitReview(client,id) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(7042027)');
    const batch=(await client.query('SELECT * FROM radar_review_batches WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!batch) invalid('Import preview not found');
    if(batch.committed_at) {await client.query('COMMIT');return {already_imported:true,summary:batch.summary};}
    if(Date.now()-new Date(batch.created_at).getTime()>30*60000) invalid('Preview expired; upload the reviewed files again');
    const p=batch.payload, actual=new Map();
    for(const [ref,expected] of Object.entries(p.snapshot)) {
      const old=(await client.query('SELECT * FROM tenders WHERE tender_id=$1 FOR UPDATE',[ref])).rows[0];
      if((old?digest(old):null)!==expected) invalid('Tender records changed after preview; upload again to review the latest changes');
      if(old) actual.set(ref,old.id);
    }
    for(const [key,expected] of Object.entries(p.criterionSnapshot)) {
      const old=(await client.query('SELECT * FROM tender_eligibility_criteria WHERE criterion_id=$1 FOR UPDATE',[key])).rows[0];
      if((old?digest(old):null)!==expected) invalid('Eligibility changed after preview; upload again');
    }
    const catalogIds=new Map();
    for(const {table,pk,data} of p.catalogs) {
      const keys=Object.keys(data);
      const r=await client.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`)}) ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING ${pk}`,Object.values(data));
      catalogIds.set(data[pk],r.rows[0][pk]);
    }
    for(const row of p.tenders) {
      const data={...row,import_source:'seci-reviewed',last_edited_by:'admin-reviewed-excel',source_data:{...row.source_data,review:p.reviews[row.tender_id],extraction_job_id:p.jobId}};
      for(const key of ['product_id','scope_id','authority_id']) if(catalogIds.has(data[key])) data[key]=catalogIds.get(data[key]);
      const keys=Object.keys(data), updating=actual.has(row.tender_id);
      const result=updating ? await client.query(`UPDATE tenders SET ${keys.filter(k=>k!=='tender_id').map(k=>`${k}=$${keys.indexOf(k)+1}`).join(',')},last_edited_date=now() WHERE tender_id=$${keys.indexOf('tender_id')+1} RETURNING id`,Object.values(data))
        : await client.query(`INSERT INTO tenders (${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`)}) RETURNING id`,Object.values(data));
      actual.set(row.tender_id,result.rows[0].id);
    }
    for(const c of p.criteria) await client.query(`INSERT INTO tender_eligibility_criteria(criterion_id,tender_id,category,requirement,reviewed_data,extraction_job_id)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(criterion_id) DO UPDATE SET category=EXCLUDED.category,requirement=EXCLUDED.requirement,reviewed_data=EXCLUDED.reviewed_data,extraction_job_id=EXCLUDED.extraction_job_id,reviewed_at=now()`,[c.criterion_id,actual.get(c.tender_id),c.category,c.requirement,JSON.stringify(c),p.jobId]);
    for(const doc of p.documents||[]) await client.query(`INSERT INTO tender_documents(tender_id,document_title,document_bucket_url,source_data)
      SELECT $1,$2,$3,$4 WHERE NOT EXISTS(SELECT 1 FROM tender_documents WHERE tender_id=$1 AND document_bucket_url=$3)`,[actual.get(doc.tender_id),String(doc.title||'SECI tender document').slice(0,255),doc.url,JSON.stringify(doc)]);
    await client.query('UPDATE radar_review_batches SET committed_at=now() WHERE id=$1',[id]);
    await client.query('COMMIT');
    return {already_imported:false,summary:batch.summary};
  } catch(error) {await client.query('ROLLBACK');throw error;}
}
