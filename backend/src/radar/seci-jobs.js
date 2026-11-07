import XLSX from 'xlsx';
import {fetchSeci,parseListing,parseDetail,readPdf,pageChunks} from './seci-source.js';
import {extractStructured} from './seci-ai.js';
import {digest, findExistingTenders, tenderInternalId} from './seci-workflow.js';
const compact = value => String(value).replace(/\s+/g,' ').trim();

export async function extractTenderSet(job,{get=fetchSeci,extract=extractStructured,pdfText=readPdf,findExisting=async()=>new Map(),progress=async()=>{},signal}={}) {
  const maxCalls=Number(process.env.SECI_MAX_CALLS_PER_TENDER || 30);
  if(!Number.isInteger(maxCalls) || maxCalls<1 || maxCalls>100) throw new Error('SECI_MAX_CALLS_PER_TENDER must be an integer from 1 to 100');
  const root=await get(job.source_url,{signal});
  const links=new URL(job.source_url).pathname.startsWith('/tender-details/')?[{url:job.source_url}]:parseListing(root.buffer.toString(),root.url);
  const result={tenders:[],criteria:[],sources:[],warnings:[],discovered:links.length};
  const discovered = new Map();
  for (const [index, link] of links.slice(0, job.tender_limit).entries()) {
    signal?.throwIfAborted();
    await progress(`Tender ${index + 1}/${Math.min(links.length, job.tender_limit)}: checking SECI ID`);
    try {
      const detail = link.url === root.url ? root : await get(link.url, {signal});
      const parsed = parseDetail(detail.buffer.toString(), link.url);
      if (!discovered.has(parsed.tenderId)) discovered.set(parsed.tenderId, {link, detail, parsed});
    } catch (error) {
      result.warnings.push(`${link.url}: ${error.message}`);
      result.sources.push({url:link.url,status:'Needs review',notes:error.message});
    }
  }

  const existing = await findExisting([...discovered.keys()]);
  const choices = job.result?.choices ?? {};
  const duplicates = [];
  for (const [tenderId] of discovered) {
    const match = existing.get(tenderId);
    if (match && choices[tenderId]?.id !== match.id) {
      duplicates.push({tender_id:tenderId, tn_tender_id:match.id, title:match.title});
    }
  }
  if (duplicates.length) return {...result, duplicates, choices};

  result.choices = choices;
  result.skipped = 0;
  for (const {link, detail, parsed} of discovered.values()) {
    signal?.throwIfAborted();
    const match = existing.get(parsed.tenderId);
    if (choices[parsed.tenderId]?.action === 'skip') {
      result.skipped++;
      continue;
    }
    try {
      await progress(`${parsed.tenderId}: extracting tender and eligibility fields`);
      const tender = {
        ...parsed.metadata, tender_id:parsed.tenderId, url:link.url,
        tn_tender_id:match?.id ?? tenderInternalId({tender_id:parsed.tenderId}),
        database_entry_date:match?.database_entry_date,
        eligibility:{},
      };
      const sources = [];
      let calls=0;
      const consume=async(text,source,pages,pdf)=> {
        if(calls>=maxCalls) throw new Error('AI call limit reached; remaining content needs manual review');
        calls++;
        const output=await extract({text:`Tender ID: ${parsed.tenderId}\nSource URL: ${source.url}\nSource title: ${source.title}\nSource listing: ${source.context ?? ''}\n${text}`,pdf,signal});
        for(const [key,value] of Object.entries(output.tender)) {
          if(key==='closing_date' && value && tender[key] && Date.parse(value)!==Date.parse(tender[key])) result.warnings.push(`${parsed.tenderId}: conflicting closing date in ${source.url}: ${value}; listing shows ${tender[key]}. Verify amendments before approval.`);
          if(value!=null && tender[key]==null) tender[key]=value;
        }
        for (const [key, value] of Object.entries(output.eligibility ?? {})) {
          if (value == null) continue;
          if (tender.eligibility[key] == null) tender.eligibility[key] = value;
          else if (tender.eligibility[key] !== value) {
            result.warnings.push(`${parsed.tenderId}: conflicting ${key} in ${source.title}; verify the summary before approving.`);
          }
        }
        if (source.url !== link.url) {
          for (const [key, value] of Object.entries(output.document ?? {})) {
            if (value != null && source[key] == null) source[key] = value;
          }
        }
        for(const c of output.criteria) {
          if(!['Technical','Financial','General'].includes(c.category) || !c.requirement || !c.quote) {result.warnings.push(`${parsed.tenderId}: omitted a criterion without source evidence`);continue;}
          if(pages && (!Number.isInteger(c.page) || c.page<1 || c.page>pages.length || !compact(pages[c.page-1]).includes(compact(c.quote)))) {
            result.warnings.push(`${parsed.tenderId}: source excerpt/page could not be verified; criterion omitted (${c.requirement.slice(0,80)})`);continue;
          }
          if(!pages && !pdf && !compact(text).includes(compact(c.quote))) {result.warnings.push(`${parsed.tenderId}: unverified source excerpt omitted`);continue;}
          if(!pages && !pdf) c.page=null;
          const criterion_id=digest([parsed.tenderId,source.url,c.category,c.clause,c.requirement]);
          if(!result.criteria.some(old=>old.criterion_id===criterion_id)) result.criteria.push({...c,tender_id:parsed.tenderId,source_url:source.url,criterion_id,extraction_method:pdf?'PDF vision':'Text'});
        }
        result.warnings.push(...output.warnings.map(w=>`${parsed.tenderId}: ${w}`));
      };
      const pageSource={tender_id:parsed.tenderId,url:link.url,title:'Tender detail page',sha256:digest(detail.buffer),status:'Read',notes:''};
      await consume(parsed.text,pageSource);
      sources.push(pageSource);
      for(const [docIndex,doc] of parsed.documents.entries()) {
        if(/corrigend|amendment|addendum/i.test(doc.url+' '+doc.context)) result.warnings.push(`${parsed.tenderId}: amendment found (${doc.title}); resolve superseded dates and conditions before approval`);
        const source={tender_id:parsed.tenderId,url:doc.url,title:doc.title,context:doc.context,sha256:null,status:'Pending',notes:''};
        if (/corrigend|amendment|addendum/i.test(doc.url+' '+doc.context)) source.is_corrigendum = true;
        sources.push(source);
        try {
          if(docIndex>=12) throw new Error('12-document limit reached; review remaining documents manually');
          signal?.throwIfAborted();
          await progress(`${parsed.tenderId}: document ${docIndex+1}/${parsed.documents.length}`);
          const {buffer}=await get(doc.url,{signal}); source.sha256=digest(buffer);
          if(/\.pdf$/i.test(new URL(doc.url).pathname)) {
            const pages=await pdfText(buffer);
            // Sparse pages may be scans, even in an otherwise searchable PDF.
            const sparse=pages.filter(p=>p.replace(/\s/g,'').length<80).length;
            if(sparse>pages.length*0.3) {
              if(buffer.length>10*1024*1024 || pages.length>100) throw new Error('Scanned/mixed PDF requires manual OCR (vision limit: 10 MB / 100 pages)');
              await consume('Read the attached PDF, including scanned pages. Use physical PDF page numbers. Eligibility must include a source excerpt.',source,null,buffer);
              source.status='Vision extracted'; source.notes='Scanned/mixed pages: verify excerpts and page references manually';
            } else {
              for(const chunk of pageChunks(pages)) await consume(chunk,source,pages);
              source.status='Read';
              if(sparse) {source.notes=`${sparse} low-text pages may contain scans/diagrams; verify manually`;result.warnings.push(`${parsed.tenderId}: ${doc.title}: ${source.notes}`);}
            }
          } else if(/\.xlsx?$/i.test(new URL(doc.url).pathname)) {
            const wb=XLSX.read(buffer,{type:'buffer'});
            const text=wb.SheetNames.map(n=>`[SHEET ${n}]\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n');
            if(text.length>150000) throw new Error('Workbook exceeds extraction size limit');
            for(const chunk of pageChunks([text])) await consume(chunk.replace(/\[PDF PAGE \d+\]/g,'[SPREADSHEET TEXT]'),source);
            source.status='Read';
          } else throw new Error('Unsupported document format; review manually');
        } catch(error) {source.status='Needs review';source.notes=error.message;result.warnings.push(`${parsed.tenderId}: ${doc.title}: ${error.message}`);}
      }
      if(!parsed.documents.length) result.warnings.push(`${parsed.tenderId}: no public tender documents found; external portal/manual documents may be needed`);
      if(!result.criteria.some(c=>c.tender_id===parsed.tenderId && c.category==='Technical')) result.warnings.push(`${parsed.tenderId}: technical eligibility not found`);
      if(!result.criteria.some(c=>c.tender_id===parsed.tenderId && c.category==='Financial')) result.warnings.push(`${parsed.tenderId}: financial eligibility not found`);
      result.tenders.push(tender); result.sources.push(...sources);
    } catch(error) {
      result.warnings.push(`${link.url}: ${error.message}`);
      result.sources.push({url:link.url,status:'Needs review',notes:error.message});
    }
  }
  result.warnings=[...new Set(result.warnings)];
  result.sources.push(...result.warnings.map(notes=>({status:'Warning',notes})));
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
