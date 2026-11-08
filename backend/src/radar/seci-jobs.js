import XLSX from 'xlsx';
import {fetchSeci,parseListing,parseDetail,readPdf,pageChunks} from './seci-source.js';
import {extractStructured} from './seci-ai.js';
import {digest, findExistingTenders, tenderInternalId} from './seci-workflow.js';

const compact = value => String(value).replace(/\s+/g,' ').trim();
const documentLimit = 12;
const callLimitWarning = 'AI call limit reached; remaining content needs manual review';

function limitConcurrency(limit) {
  let active = 0;
  const waiting = [];
  return async task => {
    if (active >= limit) await new Promise(resolve => waiting.push(resolve));
    else active++;
    try { return await task(); }
    finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

async function mapConcurrent(items, limit, task) {
  const schedule = limitConcurrency(limit);
  const results = await Promise.allSettled(items.map(item => schedule(() => task(item))));
  return results.map(result => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}

async function prepareDocument(source, {get, pdfText, signal}) {
  signal?.throwIfAborted();
  const {buffer} = await get(source.url, {signal});
  source.sha256 = digest(buffer);
  const path = new URL(source.url).pathname;
  if (/\.pdf$/i.test(path)) {
    const pages = await pdfText(buffer);
    const sparse = pages.filter(page => page.replace(/\s/g,'').length < 80).length;
    if (sparse > pages.length * 0.3) {
      if (buffer.length > 10 * 1024 * 1024 || pages.length > 100) {
        throw new Error('Scanned/mixed PDF requires manual OCR (vision limit: 10 MB / 100 pages)');
      }
      return {
        chunks:['Read the attached PDF, including scanned pages. Use physical PDF page numbers. Eligibility must include a source excerpt.'],
        pdf:buffer, status:'Vision extracted', notes:'Scanned/mixed pages: verify excerpts and page references manually',
      };
    }
    return {
      chunks:pageChunks(pages), pages:pages.map(compact), status:'Read',
      notes:sparse ? `${sparse} low-text pages may contain scans/diagrams; verify manually` : '',
      warn:!!sparse,
    };
  }
  if (/\.xlsx?$/i.test(path)) {
    const workbook = XLSX.read(buffer, {type:'buffer'});
    const text = workbook.SheetNames.map(name => `[SHEET ${name}]\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join('\n');
    if (text.length > 150000) throw new Error('Workbook exceeds extraction size limit');
    return {chunks:pageChunks([text]).map(chunk => chunk.replace(/\[PDF PAGE \d+\]/g,'[SPREADSHEET TEXT]')), status:'Read'};
  }
  throw new Error('Unsupported document format; review manually');
}

async function extractTender({link, parsed, pageSha}, existing, options) {
  const {request, maxCalls, signal, documentProgress} = options;
  const tenderId = parsed.tenderId;
  const tender = {
    ...parsed.metadata, tender_id:tenderId, url:link.url,
    tn_tender_id:existing?.id ?? tenderInternalId({tender_id:tenderId}),
    database_entry_date:existing?.database_entry_date,
    eligibility:{},
  };
  const warnings = [], sources = [];
  const criteria = new Map();
  let callsRemaining = maxCalls;
  const ask = (text, source, pdf) => request({
    text:`Tender ID: ${tenderId}\nSource URL: ${source.url}\nSource title: ${source.title}\nSource listing: ${source.context ?? ''}\n${text}`,
    pdf, signal,
  });

  function apply(output, text, source, {pages,pdf} = {}) {
    for (const [key,value] of Object.entries(output.tender)) {
      if (key === 'closing_date' && value && tender[key] && Date.parse(value) !== Date.parse(tender[key])) {
        warnings.push(`${tenderId}: conflicting closing date in ${source.url}: ${value}; listing shows ${tender[key]}. Verify amendments before import.`);
      }
      if (value != null && tender[key] == null) tender[key] = value;
    }
    for (const [key,value] of Object.entries(output.eligibility ?? {})) {
      if (value == null) continue;
      if (tender.eligibility[key] == null) tender.eligibility[key] = value;
      else if (tender.eligibility[key] !== value) {
        warnings.push(`${tenderId}: conflicting ${key} in ${source.title}; verify the summary before importing.`);
      }
    }
    if (source.url !== link.url) {
      for (const [key,value] of Object.entries(output.document ?? {})) {
        if (value != null && source[key] == null) source[key] = value;
      }
    }
    const sourceText = !pages && !pdf ? compact(text) : null;
    for (const criterion of output.criteria) {
      if (!['Technical','Financial','General'].includes(criterion.category) || !criterion.requirement || !criterion.quote) {
        warnings.push(`${tenderId}: omitted a criterion without source evidence`);
        continue;
      }
      const quote = compact(criterion.quote);
      if (pages && (!Number.isInteger(criterion.page) || !pages[criterion.page-1]?.includes(quote))) {
        warnings.push(`${tenderId}: source excerpt/page could not be verified; criterion omitted (${criterion.requirement.slice(0,80)})`);
        continue;
      }
      if (sourceText != null && !sourceText.includes(quote)) {
        warnings.push(`${tenderId}: unverified source excerpt omitted`);
        continue;
      }
      const criterionId = digest([tenderId,source.url,criterion.category,criterion.clause,criterion.requirement]);
      if (!criteria.has(criterionId)) {
        criteria.set(criterionId, {...criterion, page:pages || pdf ? criterion.page : null,
          tender_id:tenderId, source_url:source.url, criterion_id:criterionId, extraction_method:pdf ? 'PDF vision' : 'Text'});
      }
    }
    warnings.push(...output.warnings.map(warning => `${tenderId}: ${warning}`));
  }

  const pageSource = {tender_id:tenderId,url:link.url,title:'Tender detail page',sha256:pageSha,status:'Read',notes:''};
  callsRemaining--;
  sources.push(pageSource);

  const documents = parsed.documents.map(doc => {
    const source = {tender_id:tenderId,url:doc.url,title:doc.title,context:doc.context,sha256:null,status:'Pending',notes:''};
    if (/corrigend|amendment|addendum/i.test(doc.url+' '+doc.context)) {
      source.is_corrigendum = true;
      warnings.push(`${tenderId}: amendment found (${doc.title}); resolve superseded dates and conditions before import`);
    }
    return source;
  });
  sources.push(...documents);
  // Overlap the first document downloads with the detail-page AI request.
  const [pageAnswer, firstDocuments] = await Promise.allSettled([
    ask(parsed.text,pageSource),
    Promise.allSettled(documents.slice(0,callsRemaining ? 2 : 0).map(source => prepareDocument(source,options))),
  ]);
  if (pageAnswer.status === 'rejected') throw pageAnswer.reason;
  if (firstDocuments.status === 'rejected') throw firstDocuments.reason;
  apply(pageAnswer.value,parsed.text,pageSource);

  function markForReview(source, notes) {
    source.status = 'Needs review';
    source.notes = notes;
    warnings.push(`${tenderId}: ${source.title}: ${notes}`);
  }

  // Read two files at a time to bound PDF memory. Reserve the AI budget in
  // source order, and apply results in that order even if requests finish out of order.
  for (let offset = 0; offset < Math.min(documentLimit,documents.length); offset += 2) {
    signal?.throwIfAborted();
    const group = documents.slice(offset, Math.min(offset + 2, documentLimit));
    if (!callsRemaining) {
      group.forEach(source => markForReview(source, callLimitWarning));
      continue;
    }
    const prepared = offset === 0 ? firstDocuments.value : await Promise.allSettled(group.map(source => prepareDocument(source,options)));
    const plans = prepared.map((item,index) => {
      const source = group[index];
      if (item.status === 'rejected') {
        markForReview(source,item.reason.message);
        return null;
      }
      const file = item.value;
      const chunks = file.chunks.slice(0,callsRemaining);
      callsRemaining -= chunks.length;
      return {source,file,chunks,truncated:chunks.length < file.chunks.length};
    });
    const responses = await Promise.all(plans.map(plan => plan && Promise.allSettled(
      plan.chunks.map(text => ask(text,plan.source,plan.file.pdf))
    )));
    signal?.throwIfAborted();
    for (const [index, plan] of plans.entries()) {
      if (!plan) continue;
      const {source,file,chunks,truncated} = plan;
      const errors = truncated ? [callLimitWarning] : [];
      responses[index].forEach((response,i) => {
        if (response.status === 'fulfilled') apply(response.value,chunks[i],source,file);
        else errors.push(response.reason.message);
      });
      if (errors.length) markForReview(source,[...new Set(errors)].join(' · '));
      else {
        source.status = file.status;
        source.notes = file.notes ?? '';
        if (file.warn) warnings.push(`${tenderId}: ${source.title}: ${source.notes}`);
      }
    }
    await documentProgress(group.length);
  }
  for (const source of documents.slice(documentLimit)) markForReview(source,'12-document limit reached; review remaining documents manually');
  if (!documents.length) warnings.push(`${tenderId}: no public tender documents found; external portal/manual documents may be needed`);
  for (const category of ['Technical','Financial']) {
    if (![...criteria.values()].some(item => item.category === category)) {
      warnings.push(`${tenderId}: ${category.toLowerCase()} eligibility not found`);
    }
  }
  return {tender,criteria:[...criteria.values()],sources,warnings};
}

export async function extractTenderSet(job, {
  get=fetchSeci, extract=extractStructured, pdfText=readPdf, findExisting=async()=>new Map(),
  progress=async()=>{}, signal, aiConcurrency=Number(process.env.SECI_AI_CONCURRENCY || 4),
} = {}) {
  const maxCalls = Number(process.env.SECI_MAX_CALLS_PER_TENDER || 30);
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 100) throw new Error('SECI_MAX_CALLS_PER_TENDER must be an integer from 1 to 100');
  if (!Number.isInteger(aiConcurrency) || aiConcurrency < 1 || aiConcurrency > 8) throw new Error('SECI_AI_CONCURRENCY must be an integer from 1 to 8');

  const direct = new URL(job.source_url).pathname.startsWith('/tender-details/');
  let batch = job.result?.batch;
  if (!direct && !batch) {
    const root = await get(job.source_url,{signal});
    batch = {offset:0,links:parseListing(root.buffer.toString(),root.url).map(link => link.url)};
  }
  const links = direct ? [job.source_url] : batch.links;
  const offset = batch?.offset ?? 0;
  const selected = links.slice(offset,offset + job.tender_limit).map(url => ({url}));
  const result = {tenders:[],criteria:[],sources:[],warnings:[],discovered:links.length,...(batch ? {batch} : {})};
  await progress(`Checking SECI IDs for ${selected.length} tenders`);
  const pages = await mapConcurrent(selected,4,async link => {
    signal?.throwIfAborted();
    try {
      const detail = await get(link.url,{signal});
      return {link,parsed:parseDetail(detail.buffer.toString(),link.url),pageSha:digest(detail.buffer)};
    } catch (error) {
      return {link,error};
    }
  });
  signal?.throwIfAborted();

  const discovered = new Map();
  for (const page of pages) {
    if (page.error) {
      result.warnings.push(`${page.link.url}: ${page.error.message}`);
      result.sources.push({url:page.link.url,status:'Needs review',notes:page.error.message});
    } else if (!discovered.has(page.parsed.tenderId)) discovered.set(page.parsed.tenderId,page);
  }
  const existing = await findExisting([...discovered.keys()]);
  const choices = job.result?.choices ?? {};
  const duplicates = [];
  for (const [tenderId] of discovered) {
    const match = existing.get(tenderId);
    if (match && choices[tenderId]?.id !== match.id) {
      duplicates.push({tender_id:tenderId,tn_tender_id:match.id,title:match.title});
    }
  }
  if (duplicates.length) return {...result,duplicates,choices};

  const pending = [...discovered.values()].filter(page => choices[page.parsed.tenderId]?.action !== 'skip');
  result.choices = choices;
  result.skipped = discovered.size - pending.length;
  const scheduleAI = limitConcurrency(aiConcurrency);
  const request = input => scheduleAI(() => {
    signal?.throwIfAborted();
    return extract(input);
  });
  let completed = 0, documentsChecked = 0;
  let progressWrite = Promise.resolve();
  const report = () => {
    const message = `${completed}/${pending.length} tenders processed · ${documentsChecked} linked documents checked`;
    progressWrite = progressWrite.then(() => progress(message));
    return progressWrite;
  };
  if (pending.length) await report();
  const extracted = await mapConcurrent(pending,3,async page => {
    signal?.throwIfAborted();
    let outcome;
    try {
      outcome = await extractTender(page,existing.get(page.parsed.tenderId),{
        get,pdfText,signal,request,maxCalls,
        documentProgress:count => {documentsChecked += count;return report();},
      });
    } catch (error) {
      signal?.throwIfAborted();
      outcome = {warnings:[`${page.link.url}: ${error.message}`],
        sources:[{url:page.link.url,status:'Needs review',notes:error.message}],criteria:[]};
    }
    completed++;
    await report();
    return outcome;
  });
  for (const outcome of extracted) {
    if (outcome.tender) result.tenders.push(outcome.tender);
    result.criteria.push(...outcome.criteria);
    result.sources.push(...outcome.sources);
    result.warnings.push(...outcome.warnings);
  }
  result.warnings = [...new Set(result.warnings)];
  result.sources.push(...result.warnings.map(notes => ({status:'Warning',notes})));
  return result;
}

export function startSeciWorker(pool) {
  if(!pool) return ()=>{};
  let busy=false, stopped=false, warned=false;
  async function tick() {
    if(busy || stopped || !process.env.OPENAI_API_KEY) return;
    busy=true;
    try {
      // A crashed process leaves a visible failed job, never an invisible retry bill.
      await pool.query("UPDATE radar_extraction_jobs SET status='failed',error='Worker interrupted. Start a new extraction.',updated_at=now() WHERE status='running' AND updated_at < now()-interval '15 minutes'");
      const job=(await pool.query(`UPDATE radar_extraction_jobs SET status='running',updated_at=now()
        WHERE id=(SELECT id FROM radar_extraction_jobs WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`)).rows[0];
      if(!job) return;
      const heartbeat=setInterval(()=>pool.query("UPDATE radar_extraction_jobs SET updated_at=now() WHERE id=$1 AND status='running'",[job.id]).catch(()=>{}),30000);
      try {
        const result=await extractTenderSet(job,{findExisting:ids=>findExistingTenders(pool,ids),signal:AbortSignal.timeout(60*60000),progress:async text=>{await pool.query('UPDATE radar_extraction_jobs SET progress=$2,updated_at=now() WHERE id=$1',[job.id,text]);}});
        const status = result.duplicates?.length ? 'awaiting_review'
          : !result.tenders.length ? (result.skipped ? 'skipped' : 'failed')
          : result.warnings.length ? 'partial' : 'completed';
        const message = status === 'awaiting_review' ? 'Choose how to handle existing SECI tenders'
          : `${result.tenders.length} tenders extracted; ${result.skipped ?? 0} skipped; ${result.warnings.length} review notes`;
        await pool.query('UPDATE radar_extraction_jobs SET status=$2,result=$3,progress=$4,error=$5,updated_at=now() WHERE id=$1',[job.id,status,JSON.stringify(result),message,status==='failed'?'No tender data could be extracted':null]);
      } catch(error) {await pool.query("UPDATE radar_extraction_jobs SET status='failed',error=$2,updated_at=now() WHERE id=$1",[job.id,error.message]);}
      finally {clearInterval(heartbeat);}
    } catch(error) {if(!warned){console.error('SECI extraction worker unavailable:',error.code || error.name);warned=true;}}
    finally {busy=false;}
  }
  const timer=setInterval(tick,3000);timer.unref();void tick();
  return ()=>{stopped=true;clearInterval(timer);};
}
