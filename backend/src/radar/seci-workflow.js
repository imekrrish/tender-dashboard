import XLSX from 'xlsx';
import {createHash} from 'node:crypto';
import {format, convert, rawRecord} from './reference-workbook.js';
import {parseSeciSheet} from './seci-workbook.js';
import {invalid, uuid, validate} from './validation.js';
import {financialColumns, technicalColumns, detailHeaders, documentHeaders, isUnavailable} from './seci-columns.js';

export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const reviewHeaders = ['Review Status','Reviewer Remarks'];
const legacyTenderHeaders = [...format[0].headers, ...reviewHeaders];
const legacyCriterionHeaders = ['Criterion ID','Tender ID','Category','Requirement','Threshold','Unit','Applicable Period','Conditions / Alternatives','Required Evidence','Source URL','PDF Page','Clause','Source Excerpt',...reviewHeaders];
export const tenderHeaders = [...legacyTenderHeaders, 'TN_tenderID'];
export const criterionHeaders = [...legacyCriterionHeaders, 'TN_tenderID'];
const documentPath = url => new URL(url).pathname;
const optional = value => isUnavailable(value) ? null : value;

export function tenderInternalId(tender) {
  if (tender.tn_tender_id) return tender.tn_tender_id;
  // Stable across concurrent extractions of the same SECI tender.
  const hex = digest(['tender-dashboard:seci', tender.tender_id.toUpperCase()]);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

export async function findExistingTenders(db, ids) {
  if (!ids.length) return new Map();
  const result = await db.query(`SELECT * FROM tenders WHERE upper(tender_id) IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids.map(id => id.toUpperCase()));
  const byId = new Map();
  for (const row of result.rows) {
    const id = row.tender_id.toUpperCase();
    if (byId.has(id)) invalid(`Multiple existing records match ${id}. Resolve them in Master Tables first.`);
    byId.set(id, row);
  }
  return byId;
}

function tenderCells(t, i, reviewStatus) {
  return [
    i+1, t.tender_id, t.ref_number, t.title, 'Solar Energy Corporation of India Limited (SECI)',
    t.scope, t.product, t.current_status, t.publication_date, t.closing_date, t.total_capacity_mw,
    t.storage_capacity_mwh, t.pv_type, t.module_tech, t.module_eff_pct, t.mounting_tech, t.storage_tech,
    t.country, t.state, t.city, t.postal_code, t.site_address, t.latitude, t.longitude,
    t.interconnection, t.substation_voltage_kv, yesNo(t.almm_required), yesNo(t.dcr_required),
    t.url, t.analysis_tags, t.remarks, t.database_entry_date, 'OpenAI extraction', reviewStatus, null,
    tenderInternalId(t),
  ];
}

function yesNo(value) {
  return value == null ? null : value ? 'Yes' : 'No';
}

function appendRows(wb, name, headers, rows) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map(row => headers.map((_, i) => optional(row[i]) ?? 'NA'))]);
  sheet['!cols'] = headers.map(h => ({wch:/Requirement|Conditions|Remarks|Source|Scope|Title/.test(h) ? 48 : h === 'TN_tenderID' ? 38 : 22}));
  sheet['!autofilter'] = {ref:sheet['!ref']};
  XLSX.utils.book_append_sheet(wb, sheet, name);
}

function reviewTables(job, kind, status = 'Pending') {
  const tables = [];
  const add = (name, headers, rows) => tables.push({name, headers, rows});
  const {tenders, criteria, sources} = job.result;
  const byId = new Map(tenders.map(t => [t.tender_id, t]));
  if (kind === 'tenders') {
    add('Tenders Review', tenderHeaders, tenders.map((t,i) => tenderCells(t,i,status)));
    const documents = sources.filter(s => byId.has(s.tender_id) && s.url && documentPath(s.url).startsWith('/uploads/tenders/'));
    add('Documents', documentHeaders, documents.map(s => {
      const tender = byId.get(s.tender_id);
      const extension = documentPath(s.url).match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase();
      return [s.tender_id, s.title, s.category, extension, tender.url, s.url, yesNo(s.is_corrigendum), s.published_date,
        tenderInternalId(tender), status, null];
    }));
  } else {
    const financial = kind === 'financial';
    add(financial ? 'Financial Eligibility' : 'Technical Eligibility', criterionHeaders,
      criteria.filter(c => byId.has(c.tender_id) && (c.category === 'Financial') === financial).map(c => [
        c.criterion_id, c.tender_id, c.category, c.requirement, c.threshold, c.unit, c.period, c.conditions,
        c.evidence, c.source_url, c.page, c.clause, c.quote, status, null, tenderInternalId(byId.get(c.tender_id)),
      ]));
    const columns = financial ? financialColumns : technicalColumns;
    add('Eligibility Summary', detailHeaders(columns), tenders.map(t => [
      t.tender_id,
      ...columns.map(([, key]) => t.eligibility?.[key] ?? (
        key === 'estimated_project_value' ? t.eligibility?.estimated_project_value_terms :
          key === 'performance_bg_pct' ? t.eligibility?.performance_bg_terms : null
      )),
      tenderInternalId(t), status, null,
    ]));
  }
  return tables;
}

export function reviewWorkbook(job, kind) {
  const {sources} = job.result;
  const wb = XLSX.utils.book_new();
  for (const {name, headers, rows} of reviewTables(job, kind)) appendRows(wb, name, headers, rows);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Extraction ID', job.id], ['Source URL', job.source_url], ['Created', String(job.created_at)],
    ['Instructions', 'Keep both IDs and all headers. NA means unavailable. Fill missing required fields, review sources and mark accepted rows Approved. Upload the three files together.'],
    ['Amendments', 'Resolve superseded conditions before approval. Reject obsolete rows.'],
  ]), 'Extraction');
  const sourceRows = sources.length ? sources : [{status:'No documents found'}];
  const sourceHeaders = [...new Set(sourceRows.flatMap(row => Object.keys(row)))];
  appendRows(wb, 'Sources', sourceHeaders, sourceRows.map(row => sourceHeaders.map(key => row[key])));
  return XLSX.write(wb, {type:'buffer',bookType:'xlsx'});
}

function readReviewSheet(wb, name, headers, legacyHeaders) {
  const sheet = wb.Sheets[name];
  if (!sheet?.['!ref']) invalid(`Missing ${name} sheet`);
  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (range.e.r > 5000 || range.e.c >= headers.length) invalid(`${name}: maximum 5,000 rows. Keep template columns.`);
  for (const [address, cell] of Object.entries(sheet)) {
    if (!address.startsWith('!') && cell.f) invalid(`${name}: formulas are not accepted. Paste values instead.`);
  }
  const [header, ...rows] = XLSX.utils.sheet_to_json(sheet, {header:1, defval:null, blankrows:true});
  const matches = expected => header.length === expected.length && expected.every((value, i) => header[i] === value);
  const legacy = !!legacyHeaders && matches(legacyHeaders);
  if (!legacy && !matches(headers)) invalid(`${name}: keep the original headers and order`);
  const data = [];
  const numberFormats = new Map();
  rows.forEach((row, index) => {
    if (row.every(value => value == null || value === '')) return;
    const cells = row.map(optional);
    data.push(cells);
    numberFormats.set(cells, row.map((_, col) => sheet[XLSX.utils.encode_cell({r:range.s.r + index + 1, c:range.s.c + col})]?.z));
  });
  return {legacy, rows:data, numberFormats};
}

function readReview(buffer, name, headers, legacyHeaders) {
  let wb;
  try {wb = XLSX.read(buffer, {type:'buffer', cellDates:true, cellNF:true});} catch {invalid(`Cannot read ${name} workbook`);}
  const meta = wb.Sheets.Extraction;
  if (!meta) invalid('Missing Extraction sheet');
  const info = XLSX.utils.sheet_to_json(meta, {header:1, defval:null});
  return {...readReviewSheet(wb, name, headers, legacyHeaders), wb, jobId:info.find(row => row[0] === 'Extraction ID')?.[1]};
}
function approved(row,index,name) {
  const status=String(row[index]||'').trim().toLowerCase();
  if(!['approved','pending','rejected',''].includes(status)) invalid(`${name}: review status must be Approved, Pending or Rejected`);
  return status==='approved';
}
export function parseReviewFiles(files,catalogs) {
  const t=readReview(files.tenders,'Tenders Review',tenderHeaders,legacyTenderHeaders);
  const technical=readReview(files.technical,'Technical Eligibility',criterionHeaders,legacyCriterionHeaders);
  const financial=readReview(files.financial,'Financial Eligibility',criterionHeaders,legacyCriterionHeaders);
  return parseReviewRows(t,technical,financial,catalogs);
}

function parseReviewRows(t,technical,financial,catalogs) {
  if(!t.jobId || t.jobId!==technical.jobId || t.jobId!==financial.jobId) invalid('All three files must belong to the same extraction');
  uuid(t.jobId);
  if ([technical, financial].some(file => file.legacy !== t.legacy)) invalid('Use three workbooks of the same format');
  const links = [];
  const link = (external, internal) => {
    if (typeof external !== 'string' || !external.trim()) invalid('Approved rows require Tender ID');
    const tenderId = external.trim().toUpperCase();
    if (!t.legacy) links.push({tenderId, internalId:uuid(internal)});
    return tenderId;
  };
  const selected=t.rows.filter(row=>approved(row,33,'Tenders Review'));
  for (const row of selected) row[1] = link(row[1], row[35]);
  const tenderSheet = XLSX.utils.aoa_to_sheet([format[0].headers, ...selected.map(row => row.slice(0,33))], {cellDates:true});
  selected.forEach((row, index) => t.numberFormats.get(row)?.slice(0,33).forEach((numberFormat, col) => {
    const cell = tenderSheet[XLSX.utils.encode_cell({r:index+1,c:col})];
    if (cell && numberFormat) cell.z = numberFormat;
  }));
  const tenders = selected.length ? parseSeciSheet(tenderSheet, catalogs) : [];
  const criteria=[], seen=new Set();
  for(const [kind,data] of [['technical',technical],['financial',financial]]) for(const row of data.rows) {
    if(!approved(row,13,kind)) continue;
    const [id,tender_id,category,requirement,threshold,unit,period,conditions,evidence,source_url,page,clause,quote,,reviewer_remarks,internal]=row;
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
    criteria.push({criterion_id,tender_id:link(tender_id,internal),category,requirement:requirement.trim(),threshold,unit,period,conditions,evidence,source_url,page,clause,quote,reviewer_remarks});
  }
  const summaries = new Map();
  const documents = [];
  let supplementarySkipped = 0;
  if (!t.legacy) {
    for (const [file, columns] of [[technical, technicalColumns], [financial, financialColumns]]) {
      const sheet = file.extra ?? readReviewSheet(file.wb, 'Eligibility Summary', detailHeaders(columns));
      const seen = new Set();
      const statusIndex = columns.length + 2;
      for (const row of sheet.rows) {
        if (!approved(row, statusIndex, 'Eligibility Summary')) { supplementarySkipped++; continue; }
        const tenderId = link(row[0], row[statusIndex - 1]);
        if (seen.has(tenderId)) invalid(`Duplicate eligibility summary for ${tenderId}`);
        seen.add(tenderId);
        const data = {};
        columns.forEach(([, key], i) => {
          const value = row[i + 1];
          if (value == null) return;
          if (['estimated_project_value','performance_bg_pct'].includes(key) && typeof value === 'string' && !/^[\d,.]+%?$/.test(value.trim())) {
            data[key === 'estimated_project_value' ? 'estimated_project_value_terms' : 'performance_bg_terms'] = value;
          } else data[key] = convert('tender_eligibility', key, value, {}, sheet.numberFormats.get(row)?.[i + 1]);
        });
        if (Object.keys(data).length) {
          const previous = summaries.get(tenderId) ?? {tender_id:tenderId, fields:{}, review:[]};
          Object.assign(previous.fields, validate('tender_eligibility', data, true));
          previous.review.push({category:file === technical ? 'Technical' : 'Financial', remarks:row[statusIndex + 1] ?? null});
          summaries.set(tenderId, previous);
        }
      }
    }
    const sheet = t.extra ?? readReviewSheet(t.wb, 'Documents', documentHeaders);
    const seen = new Set();
    for (const row of sheet.rows) {
      if (!approved(row, 9, 'Documents')) { supplementarySkipped++; continue; }
      const tenderId = link(row[0], row[8]);
      const [ ,title, category, ,portal, direct, corrigendum, published] = row;
      if (corrigendum != null && !/^(yes|no|true|false)$/i.test(String(corrigendum))) invalid('Is Corrigendum must be Yes, No or NA');
      if (published != null && Number.isNaN(Date.parse(String(published)))) invalid('Published Date must be a valid date or NA');
      const data = validate('tender_documents', {document_title:title, doc_type:category, document_bucket_url:direct ?? portal}, true);
      if (!data.document_title || !data.document_bucket_url) invalid('Approved documents require Document Title and a link');
      const key = JSON.stringify([tenderId, data.document_bucket_url]);
      if (seen.has(key)) invalid(`Duplicate document URL for ${tenderId}`);
      seen.add(key);
      documents.push({tender_id:tenderId, title:data.document_title, url:data.document_bucket_url, category:data.doc_type,
        source_data:rawRecord(documentHeaders,row)});
    }
  }
  if (!tenders.length && !criteria.length && !summaries.size && !documents.length) invalid('No approved rows found. Review the files and mark accepted rows Approved');
  const reviews = Object.fromEntries(selected.map(row => [String(row[1]), {status:'Approved', remarks:row[34] ?? null}]));
  return {
    jobId:t.jobId, tenders:[...tenders], catalogs:tenders.catalogs || [], criteria, reviews, links,
    summaries:[...summaries.values()], documents, legacy:t.legacy,
    skipped:t.rows.length + technical.rows.length + financial.rows.length - tenders.length - criteria.length + supplementarySkipped,
  };
}

async function findDocument(db, tenderId, url, lock = false) {
  return (await db.query(`SELECT * FROM tender_documents WHERE tender_id=$1 AND document_bucket_url=$2 ORDER BY doc_id LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [tenderId, url])).rows[0];
}

export async function previewReview(db, files, catalogs, decisions = {}) {
  const payload = parseReviewFiles(files, catalogs);
  const job = (await db.query('SELECT * FROM radar_extraction_jobs WHERE id=$1', [payload.jobId])).rows[0];
  const fileHashes = ['tenders','technical','financial'].map(key => [key,digest(files[key])]);
  return previewPrepared(db, job, payload, fileHashes, decisions);
}

const editableTenderFields = new Set(['title','scope','product','country','publication_date','closing_date','mounting_tech']);
export async function previewExtraction(db, job, selection, catalogs, decisions = {}) {
  if (!job?.result || !['completed','partial'].includes(job.status)) invalid('Extraction is missing or not ready for review');
  if (!Array.isArray(selection) || !selection.length || selection.length > 25) invalid('Select at least one tender to import');
  const extracted = new Map(job.result.tenders.map(tender => [tender.tender_id,tender]));
  const chosen = new Map();
  for (const row of selection) {
    if (!row || !extracted.has(row.tender_id) || chosen.has(row.tender_id)) invalid('Select tenders from this extraction');
    const corrections = row.corrections ?? {};
    if (!corrections || typeof corrections !== 'object' || Array.isArray(corrections) ||
      Object.entries(corrections).some(([key,value]) => !editableTenderFields.has(key) || typeof value !== 'string' || value.length > 500)) {
      invalid('Invalid tender corrections');
    }
    chosen.set(row.tender_id,Object.fromEntries(Object.keys(corrections).sort().map(key=>[key,corrections[key].trim()])));
  }
  const tenders = job.result.tenders.filter(tender => chosen.has(tender.tender_id))
    .map(tender => ({...tender,...chosen.get(tender.tender_id)}));
  const selectionKey = tenders.map(tender => [tender.tender_id,chosen.get(tender.tender_id)]);
  const reviewedJob = {...job,result:{...job.result,tenders}};
  const tables = kind => {
    const [main, extra] = reviewTables(reviewedJob,kind,'Approved');
    const data = table => ({rows:table.rows.map(row => row.map(optional)),numberFormats:new Map(),legacy:false});
    return {...data(main),jobId:job.id,extra:data(extra)};
  };
  const payload = parseReviewRows(tables('tenders'),tables('technical'),tables('financial'),catalogs);
  return previewPrepared(db,job,payload,['screen-review',job.id,selectionKey],decisions);
}

async function previewPrepared(db, job, payload, identity, decisions) {
  if (!job?.result || !['completed','partial'].includes(job.status)) invalid('Extraction is missing or not ready for review');

  const allowed = new Map(job.result.tenders.map(t => [t.tender_id, t]));
  if (payload.legacy) {
    payload.documents = job.result.sources.filter(s => s.tender_id && s.url && documentPath(s.url).startsWith('/uploads/tenders/') && payload.tenders.some(t => t.tender_id === s.tender_id));
  }
  const records = ['tenders','criteria','summaries','documents'];
  const ids = [...new Set(records.flatMap(key => payload[key].map(row => row.tender_id)))];
  for (const id of ids) {
    if (!allowed.has(id)) invalid(`Tender ${id} does not belong to this extraction`);
  }
  const byId = await findExistingTenders(db, ids);
  for (const {tenderId, internalId} of payload.links) {
    const source = allowed.get(tenderId);
    if (!source || (tenderInternalId(source) !== internalId && (source.tn_tender_id || byId.get(tenderId)?.id !== internalId))) {
      invalid(`TN_tenderID does not match Tender ID ${tenderId}. Use the IDs from the exported files.`);
    }
  }
  const sourceCriteria = new Map(job.result.criteria.map(c => [c.criterion_id, c.tender_id]));
  for (const c of payload.criteria) {
    if (sourceCriteria.has(c.criterion_id) && sourceCriteria.get(c.criterion_id) !== c.tender_id) invalid('Criterion ID cannot move to another tender');
  }

  const skippedIds = ids.filter(id => byId.has(id) && decisions[id] === 'skip').sort();
  const hash = digest(skippedIds.length ? [identity, skippedIds] : identity);
  const imported = (await db.query('SELECT * FROM radar_review_batches WHERE digest=$1', [hash])).rows[0];
  if (imported?.committed_at) return {id:imported.id, summary:imported.summary, already_imported:true};

  const duplicates = ids.filter(id => {
    const existing = byId.get(id);
    if (!existing || ['replace','skip'].includes(decisions[id])) return false;
    const choice = job.result.choices?.[id];
    return choice?.action !== 'replace' || choice.id !== existing.id;
  }).map(id => ({tender_id:id, tn_tender_id:byId.get(id).id, title:byId.get(id).title}));
  if (duplicates.length) return {duplicates};

  const skipped = new Set(skippedIds);
  for (const key of records) {
    const kept = payload[key].filter(row => !skipped.has(row.tender_id));
    payload.skipped += payload[key].length - kept.length;
    payload[key] = kept;
  }
  const activeIds = ids.filter(id => !skipped.has(id));
  const tenderIds = new Set(payload.tenders.map(row => row.tender_id));
  for (const id of activeIds) {
    if (!byId.has(id) && !tenderIds.has(id)) invalid(`Approve tender ${id} first, or include it in this upload`);
  }
  payload.catalogs = payload.catalogs.filter(({pk, data}) => payload.tenders.some(row => row[pk] === data[pk]));
  payload.internalIds = Object.fromEntries(activeIds.map(id => [id, byId.get(id)?.id ?? tenderInternalId(allowed.get(id))]));
  payload.snapshot = Object.fromEntries(activeIds.map(id => [id, byId.has(id) ? digest(byId.get(id)) : null]));
  payload.criterionSnapshot={};
  for(const c of payload.criteria) {
    const old=(await db.query('SELECT * FROM tender_eligibility_criteria WHERE criterion_id=$1',[c.criterion_id])).rows[0];
    if(old && old.tender_id!==byId.get(c.tender_id)?.id) invalid('Criterion ID already belongs to another tender');
    payload.criterionSnapshot[c.criterion_id]=old?digest(old):null;
  }
  for (const summary of payload.summaries) {
    const existingId = byId.get(summary.tender_id)?.id;
    const old = existingId && (await db.query('SELECT * FROM tender_eligibility WHERE tender_id=$1', [existingId])).rows[0];
    summary.snapshot = old ? digest(old) : null;
  }
  for (const doc of payload.documents) {
    const existingId = byId.get(doc.tender_id)?.id;
    const old = existingId && await findDocument(db, existingId, doc.url);
    doc.snapshot = old ? digest(old) : null;
  }
  const changes=payload.tenders.map(t=>({tender_id:t.tender_id,action:byId.has(t.tender_id)?'Update':'New',title:t.title,
    fields:Object.entries(t).filter(([k,v])=>!['source_data','import_source'].includes(k) && (!byId.has(t.tender_id) || v != null) && String(byId.get(t.tender_id)?.[k]??'')!==String(v??'')).map(([field,after])=>({field,before:byId.get(t.tender_id)?.[field]??null,after}))}));
  const summary = {
    new:changes.filter(c=>c.action==='New').length, updates:changes.filter(c=>c.action==='Update').length,
    criteria:payload.criteria.length, summaries:payload.summaries.length, documents:payload.documents.length,
    skipped:payload.skipped, changes,
  };
  if (!activeIds.length) return {skipped_all:true, summary};
  const row=(await db.query(`INSERT INTO radar_review_batches(digest,payload,summary) VALUES($1,$2,$3)
    ON CONFLICT(digest) DO UPDATE SET payload=EXCLUDED.payload,summary=EXCLUDED.summary,created_at=now() WHERE radar_review_batches.committed_at IS NULL RETURNING id`,[hash,JSON.stringify(payload),JSON.stringify(summary)])).rows[0];
  if (!row) {
    const committed = (await db.query('SELECT id,summary FROM radar_review_batches WHERE digest=$1', [hash])).rows[0];
    return {...committed, already_imported:true};
  }
  return {id:row.id,summary,already_imported:false};
}
export async function commitReview(client,id) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(7042027)');
    const batch=(await client.query('SELECT * FROM radar_review_batches WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!batch) invalid('Import preview not found');
    if(batch.committed_at) {await client.query('COMMIT');return {already_imported:true,summary:batch.summary};}
    if(Date.now()-new Date(batch.created_at).getTime()>30*60000) invalid('Preview expired. Review the latest changes and try again.');
    const p=batch.payload, actual=new Map();
    for(const [ref,expected] of Object.entries(p.snapshot)) {
      const {rows} = await client.query('SELECT * FROM tenders WHERE upper(tender_id)=$1 FOR UPDATE', [ref.toUpperCase()]);
      const old = rows[0];
      if (rows.length > 1) invalid(`Multiple existing records match ${ref}`);
      if((old?digest(old):null)!==expected) invalid('Tender records changed after preview. Review the latest changes and try again.');
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
    for (const row of p.tenders) {
      const existingId = actual.get(row.tender_id);
      const data = {...row, import_source:'seci-reviewed', last_edited_by:'admin-reviewed-excel',
        source_data:{...row.source_data, review:p.reviews[row.tender_id], extraction_job_id:p.jobId}};
      for (const key of ['product_id','scope_id','authority_id']) {
        if (catalogIds.has(data[key])) data[key] = catalogIds.get(data[key]);
      }
      if (existingId) {
        delete data.tender_id;
        // NA means unavailable. Keep verified values when this extraction lacks them.
        for (const key of Object.keys(data)) if (data[key] == null) delete data[key];
        const keys = Object.keys(data);
        await client.query(`UPDATE tenders SET ${keys.map((key,i) => `${key}=$${i+1}`).join(',')},last_edited_date=now() WHERE id=$${keys.length+1}`, [...Object.values(data),existingId]);
      } else {
        if (p.internalIds?.[row.tender_id]) data.id = p.internalIds[row.tender_id];
        const keys = Object.keys(data);
        const inserted = await client.query(`INSERT INTO tenders (${keys.join(',')}) VALUES(${keys.map((_,i) => `$${i+1}`)}) RETURNING id`, Object.values(data));
        actual.set(row.tender_id, inserted.rows[0].id);
      }
    }
    for (const summary of p.summaries ?? []) {
      const tenderId = actual.get(summary.tender_id);
      const current = (await client.query('SELECT * FROM tender_eligibility WHERE tender_id=$1 FOR UPDATE', [tenderId])).rows[0];
      if ((current ? digest(current) : null) !== summary.snapshot) invalid('Eligibility summary changed after preview. Upload again.');
      const data = {tender_id:tenderId, ...summary.fields, source_data:{
        ...current?.source_data, seci_review:summary.review, extraction_job_id:p.jobId,
      }};
      if (!current) {
        for (const key of ['emd_currency','ld_cap_pct','no_of_partners_allowed']) {
          if (!(key in data)) data[key] = null;
        }
      }
      const keys = Object.keys(data);
      await client.query(`INSERT INTO tender_eligibility (${keys.join(',')}) VALUES (${keys.map((_,i) => `$${i+1}`).join(',')})
        ON CONFLICT(tender_id) DO UPDATE SET ${keys.slice(1).map(key => `${key}=EXCLUDED.${key}`).join(',')}`, Object.values(data));
    }
    for(const c of p.criteria) await client.query(`INSERT INTO tender_eligibility_criteria(criterion_id,tender_id,category,requirement,reviewed_data,extraction_job_id)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(criterion_id) DO UPDATE SET category=EXCLUDED.category,requirement=EXCLUDED.requirement,reviewed_data=EXCLUDED.reviewed_data,extraction_job_id=EXCLUDED.extraction_job_id,reviewed_at=now()`,[c.criterion_id,actual.get(c.tender_id),c.category,c.requirement,JSON.stringify(c),p.jobId]);
    for (const doc of p.documents ?? []) {
      const tenderId = actual.get(doc.tender_id);
      const current = await findDocument(client, tenderId, doc.url, true);
      if ('snapshot' in doc && (current ? digest(current) : null) !== doc.snapshot) invalid('A tender document changed after preview. Upload again.');
      const source = JSON.stringify({...current?.source_data,
        ...Object.fromEntries(Object.entries(doc.source_data ?? {}).filter(([, value]) => value != null)),
        TN_tenderID:tenderId, extraction_job_id:p.jobId});
      if (current && doc.source_data) {
        await client.query('UPDATE tender_documents SET document_title=$1,doc_type=COALESCE($2,doc_type),source_data=$3 WHERE doc_id=$4',
          [doc.title,doc.category,source,current.doc_id]);
      } else if (!current) {
        await client.query('INSERT INTO tender_documents(tender_id,document_title,document_bucket_url,doc_type,source_data) VALUES($1,$2,$3,$4,$5)',
          [tenderId,String(doc.title || 'SECI tender document').slice(0,255),doc.url,doc.category ?? null,doc.source_data ? source : JSON.stringify(doc)]);
      }
    }
    await client.query('UPDATE radar_review_batches SET committed_at=now() WHERE id=$1',[id]);
    await client.query('COMMIT');
    return {already_imported:false,summary:batch.summary};
  } catch(error) {await client.query('ROLLBACK');throw error;}
}
