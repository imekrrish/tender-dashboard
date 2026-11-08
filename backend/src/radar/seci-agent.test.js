import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import express from 'express';
import {createSeciRouter} from './seci-router.js';
import {dashboardWorkbook, withEligibility} from './tender-tables.js';
import XLSX from 'xlsx';
import {seciUrl,fetchSeci,parseListing,parseDetail,pageChunks,readPdf} from './seci-source.js';
import {extractTenderSet} from './seci-jobs.js';
import {extractStructured} from './seci-ai.js';
import {reviewWorkbook,parseReviewFiles,previewReview,previewExtraction,commitReview,digest,tenderInternalId} from './seci-workflow.js';

const job={id:randomUUID(),source_url:'https://www.seci.co.in/tenders',created_at:'2026-11-06',status:'completed'};
const criterion={criterion_id:digest('synthetic criterion'),tender_id:'SECI000001',category:'Technical',requirement:'Completed 10 MW solar project',threshold:10,unit:'MW',period:'Last 5 years',conditions:'One project OR two projects of 5 MW each; lead JV member qualifies',evidence:'Commissioning certificate',source_url:'https://www.seci.co.in/uploads/tenders/example.pdf',page:1,clause:'2.1',quote:'Completed 10 MW solar project'};
job.result={tenders:[{tender_id:'SECI000001',url:'https://www.seci.co.in/tender-details/abc',title:'Synthetic solar tender',scope:'EPC',product:'Solar PV',publication_date:'2026-11-01',closing_date:'2026-12-01T18:00:00+05:30',country:'India',state:'Bihar',total_capacity_mw:10,pv_type:'Ground mount',eligibility:{emd_currency:'INR',emd_amount:25000,certifications:'IEC 61215',ld_cap_pct:5}}],criteria:[criterion],sources:[{tender_id:'SECI000001',url:criterion.source_url,title:'Example tender document',category:'RfS',is_corrigendum:false,published_date:'2026-11-01'}]};
const cats=()=>({country_id:[{country_id:randomUUID(),iso_code:'IN',name:'India'}],product_id:[{product_id:randomUUID(),code:'SOLAR',name:'Solar PV'}],scope_id:[{scope_id:randomUUID(),code:'EPC',name:'EPC'}],authority_id:[{authority_id:randomUUID(),code:'SECI',name:'SECI'}]});
const files = () => Object.fromEntries(['tenders','technical','financial'].map(kind=>[kind,reviewWorkbook(job,kind)]));

function oldReviewSheet(wb, name, status) {
  const [header,...rows] = XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null});
  const internal = header.indexOf('TN_tenderID');
  const position = ['Documents','Eligibility Summary'].includes(name) ? internal + 1 : internal;
  header.splice(position,0,'Review Status','Reviewer Remarks');
  for (const row of rows) row.splice(position,0,status,null);
  wb.Sheets[name] = XLSX.utils.aoa_to_sheet([header,...rows]);
}

test('SECI URL allowlist rejects external redirects, credentials, ports and unrelated paths',async()=>{
  for(const url of ['https://localhost/tenders','http://www.seci.co.in/tenders','https://www.seci.co.in:444/tenders','https://user@www.seci.co.in/tenders','https://www.seci.co.in/../admin','https://www.seci.co.in.evil.com/tenders']) assert.throws(()=>seciUrl(url));
  assert.match(seciUrl('/uploads/tenders/a.pdf'),/^https:\/\/www.seci.co.in/);
  await assert.rejects(()=>fetchSeci(job.source_url,{fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/tenders'}})}),/HTTPS URL/);
  await assert.rejects(()=>fetchSeci(job.source_url,{maxBytes:2,fetchImpl:async()=>new Response('large')}),/size limit/);
});
test('HTML parser discovers documents and amendments and preserves exact online deadline in IST',()=>{
  const html='<table><tr><td class="fw-bold">Tender ID</td><td>SECI000001</td><td class="fw-bold">Tender Title</td><td>Solar</td></tr><tr><td class="fw-bold">Bid Submission End Date (Online)</td><td>12/11/2026 18:00:00</td></tr></table><a href="/uploads/tenders/corrigendums/change.pdf">Amendment</a>';
  const detail=parseDetail(html,job.source_url);
  assert.equal(detail.metadata.closing_date,'2026-11-12T18:00:00+05:30');assert.equal(detail.documents.length,1);
  assert.equal(parseListing('<a href="/tender-details/abc">View</a><a href="/tender-details/abc">Duplicate</a>').length,1);
  assert.throws(()=>parseListing('<p>Changed site</p>'),/No tender links/);
  const chunks=pageChunks(['First page','Second page'],30);assert.equal(chunks.length,2);assert.match(chunks[1],/PDF PAGE 2/);
});
test('three workbooks import without approvals, preserve conditions and require matching extraction IDs',()=>{
  const exported=files(),parsed=parseReviewFiles(exported,cats());
  const old=XLSX.read(exported.tenders,{type:'buffer'});
  const [headers]=XLSX.utils.sheet_to_json(old.Sheets['Tenders Review'],{header:1});
  assert.equal(headers.includes('Review Status'),false);
  oldReviewSheet(old,'Tenders Review','Pending');
  oldReviewSheet(old,'Documents',null);
  const legacy=XLSX.write(old,{type:'buffer',bookType:'xlsx'});
  assert.equal(parseReviewFiles({...exported,tenders:legacy},cats()).tenders.length,1);
  assert.equal(parsed.summaries[0].fields.ld_cap_pct,5);
  const other=XLSX.read(exported.financial,{type:'buffer'});
  assert.ok(other.Sheets['Other Eligibility']);
  assert.ok(XLSX.utils.sheet_to_json(other.Sheets['Eligibility Summary'],{header:1})[0].includes('LD Cap (%)'));
  assert.equal(parsed.tenders.length,1);assert.equal(parsed.criteria.length,1);assert.match(parsed.criteria[0].conditions,/OR/);
  assert.equal(parsed.summaries[0].fields.emd_amount,25000);
  assert.equal(parsed.summaries[0].fields.certifications,'IEC 61215');
  assert.equal(parsed.documents[0].source_data['Published Date'],'2026-11-01');
  assert.equal(new Set(parsed.links.map(link => link.internalId)).size,1);
  assert.equal(parsed.links[0].internalId,tenderInternalId(job.result.tenders[0]));
  assert.equal(XLSX.read(exported.tenders,{type:'buffer'}).Sheets['Tenders Review'].U2.v,'NA');
  assert.equal(parsed.tenders[0].tender_close_date,'2026-12-01T18:00:00+05:30');
  const wb=XLSX.read(exported.technical,{type:'buffer'});wb.Sheets.Extraction.B1.v=randomUUID();
  assert.throws(()=>parseReviewFiles({...exported,technical:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})},cats()),/same extraction/);
  const formula=XLSX.read(exported.technical,{type:'buffer'});formula.Sheets['Technical Eligibility'].E2.f='1+1';
  assert.throws(()=>parseReviewFiles({...exported,technical:XLSX.write(formula,{type:'buffer',bookType:'xlsx'})},cats()),/formulas/);
  const bad=XLSX.read(exported.technical,{type:'buffer'});bad.Sheets['Technical Eligibility'].K2={t:'n',v:0};
  assert.throws(()=>parseReviewFiles({...exported,technical:XLSX.write(bad,{type:'buffer',bookType:'xlsx'})},cats()),/PDF Page/);
});
test('extraction retains amendments, flags inaccessible documents and drops unsupported evidence',async()=>{
  const listing='<a href="/tender-details/abc">View</a>';
  const detail='<body>SECI000001 <a href="/uploads/tenders/a.pdf">RfS</a><a href="/uploads/tenders/corrigendums/b.pdf">Amendment</a></body>';
  const result=await extractTenderSet({...job,tender_limit:5},{
    get:async url=>{if(url.endsWith('/b.pdf'))throw new Error('HTTP 403');return {url,buffer:Buffer.from(url.endsWith('/a.pdf')?'%PDF-test':url===job.source_url?listing:detail)};},
    pdfText:async()=>['Completed 10 MW solar project. '.repeat(8)],
    extract:async({text})=>({tender:{title:'Solar'},criteria:text.includes('[PDF PAGE')?[{...criterion,quote:'not in source'},{...criterion}]:[],warnings:[]})
  });
  assert.equal(result.tenders.length,1);assert.equal(result.criteria.length,1);
  assert.ok(result.warnings.some(w=>w.includes('403')));assert.ok(result.warnings.some(w=>w.includes('could not be verified')));
  assert.equal(result.sources.find(s=>s.url?.endsWith('/b.pdf')).status,'Needs review');
});
test('linked PDFs and page chunks run in parallel with a shared AI limit and stable source precedence', {timeout:2000}, async () => {
  const detailUrl = 'https://www.seci.co.in/tender-details/one';
  const docs = ['a','b','c','d','e'];
  const detail = '<body>SECI000001 ' + docs.map(name => `<a href="/uploads/tenders/${name}.pdf">${name}</a>`).join(' ') + '</body>';
  const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
  let reading = 0, maxReading = 0, activeAI = 0, maxAI = 0;
  const finished = [];
  let finishSecondDocument;
  const secondDocumentFinished = new Promise(resolve => {finishSecondDocument = resolve;});
  const result = await extractTenderSet({...job,source_url:detailUrl,tender_limit:1},{
    aiConcurrency:2,
    get:async url => {
      if (url === detailUrl) return {url,buffer:Buffer.from(detail)};
      reading++;
      maxReading = Math.max(maxReading,reading);
      await pause(4);
      reading--;
      return {url,buffer:Buffer.from(url)};
    },
    pdfText:async buffer => buffer.toString().endsWith('/a.pdf')
      ? ['First page '.repeat(2300),'Second page '.repeat(2200)] : ['Tender requirements '.repeat(20)],
    extract:async ({text}) => {
      const source = text.match(/Source URL: (.+)/)[1];
      const firstPage = source.endsWith('/a.pdf') && text.includes('[PDF PAGE 1]');
      activeAI++;
      maxAI = Math.max(maxAI,activeAI);
      if (firstPage) await secondDocumentFinished;
      else await Promise.resolve();
      activeAI--;
      finished.push(firstPage ? 'a-first' : source);
      if (source.endsWith('/b.pdf')) finishSecondDocument();
      return {tender:{}, eligibility:firstPage ? {emd_amount:1000} :
        source.endsWith('/b.pdf') ? {emd_amount:2000} : {}, criteria:[],warnings:[]};
    },
  });
  assert.equal(maxReading,2);
  assert.equal(maxAI,2);
  assert.ok(finished.findIndex(url => url.endsWith('/b.pdf')) < finished.indexOf('a-first'));
  assert.equal(finished.length,7);
  assert.equal(result.tenders[0].eligibility.emd_amount,1000);
  assert.ok(result.warnings.some(warning => warning.includes('conflicting emd_amount')));
  assert.deepEqual(result.sources.filter(source => source.url?.endsWith('.pdf')).map(source => source.title),docs);
});
test('next five use the original listing order without loading the listing again', async () => {
  const listing = Array.from({length:12}, (_,i) => `<a href="/tender-details/${i+1}">Tender ${i+1}</a>`).join('');
  let listingReads = 0;
  const options = {
    get:async url => {
      if (url === job.source_url) {listingReads++;return {url,buffer:Buffer.from(listing)};}
      const number = new URL(url).pathname.split('/').at(-1);
      return {url,buffer:Buffer.from(`<body>SECI${number.padStart(6,'0')}</body>`)};
    },
    extract:async () => ({tender:{},criteria:[],warnings:[]}),
  };
  const first = await extractTenderSet({...job,result:null,tender_limit:5},options);
  const next = await extractTenderSet({...job,tender_limit:5,result:{batch:{...first.batch,offset:5}}},options);
  assert.equal(listingReads,1);
  assert.deepEqual(first.tenders.map(t=>t.tender_id),['SECI000001','SECI000002','SECI000003','SECI000004','SECI000005']);
  assert.deepEqual(next.tenders.map(t=>t.tender_id),['SECI000006','SECI000007','SECI000008','SECI000009','SECI000010']);
  assert.equal(next.batch.offset,5);
});
test('existing SECI IDs pause before AI calls, then skip or re-extract using the original internal ID', async () => {
  const existingId = randomUUID();
  const listing = '<a href="/tender-details/one">One</a><a href="/tender-details/two">Two</a>';
  const seen = [];
  const options = {
    get:async url => ({url, buffer:Buffer.from(url === job.source_url ? listing :
      url.endsWith('/one') ? '<body>seci000001</body>' : '<body>SECI000002</body>')}),
    findExisting:async () => new Map([['SECI000001',{id:existingId,title:'Existing tender'}]]),
    extract:async ({text}) => {seen.push(text); return {tender:{}, criteria:[], warnings:[]};},
  };
  const pending = await extractTenderSet({...job,tender_limit:2}, options);
  assert.deepEqual(pending.duplicates,[{tender_id:'SECI000001',tn_tender_id:existingId,title:'Existing tender'}]);
  assert.equal(seen.length,0);
  const skip = await extractTenderSet({...job,tender_limit:2,result:{choices:{SECI000001:{id:existingId,action:'skip'}}}}, options);
  assert.deepEqual(skip.tenders.map(t=>t.tender_id),['SECI000002']);
  assert.equal(skip.skipped,1);
  const replace = await extractTenderSet({...job,tender_limit:2,result:{choices:{SECI000001:{id:existingId,action:'replace'}}}}, options);
  assert.equal(replace.tenders[0].tn_tender_id,existingId);
  assert.equal(seen.length,3);
});
test('OpenAI structured extraction handles refusals and incomplete output without importing partial JSON',async()=>{
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only';
  try {
    await assert.rejects(()=>extractStructured({text:'test',fetchImpl:async()=>Response.json({status:'incomplete'})}),/incomplete/);
    await assert.rejects(()=>extractStructured({text:'test',fetchImpl:async()=>Response.json({status:'completed',output:[{content:[{type:'refusal'}]}]})}),/declined/);
    const output={tender:{},criteria:[],warnings:[]};
    const response=await extractStructured({text:'test',fetchImpl:async(url,options)=>{const req=JSON.parse(options.body);assert.equal(req.store,false);assert.equal(req.text.format.strict,true);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});}});
    assert.deepEqual(response,output);
  } finally {if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('review preview and commit persist tender/eligibility links, audit and idempotency',async()=>{
  const pool = new PGlite();
  try {
  for (const file of ['001_procurement.sql','002_source_fields.sql','003_seci_template.sql','004_extraction.sql','005_tender_technical_descriptions.sql']) {
    const sql = await readFile(new URL('../db/'+file,import.meta.url),'utf8');
    await pool.exec(sql.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
  }
  const region=(await pool.query("INSERT INTO master_regions(code,name) VALUES('SA','South Asia') RETURNING region_id")).rows[0];
  await pool.query("INSERT INTO master_countries(region_id,iso_code,name) VALUES($1,'IN','India')",[region.region_id]);
  await pool.query("INSERT INTO master_product_segments(code,name) VALUES('SOLAR','Solar PV')");
  await pool.query("INSERT INTO master_contract_scopes(code,name) VALUES('EPC','EPC')");
  await pool.query("INSERT INTO tendering_authorities(code,name) VALUES('SECI','SECI')");
  await pool.query("INSERT INTO radar_extraction_jobs(id,source_url,tender_limit,status,result) VALUES($1,$2,5,'completed',$3)",[job.id,job.source_url,JSON.stringify(job.result)]);
  const catalogs={};for(const [k,table] of Object.entries({country_id:'master_countries',product_id:'master_product_segments',scope_id:'master_contract_scopes',authority_id:'tendering_authorities'}))catalogs[k]=(await pool.query(`SELECT * FROM ${table}`)).rows;
  const exported=files(),p=await previewReview(pool,exported,catalogs);
  assert.equal(p.summary.new,1);assert.equal(p.summary.criteria,1);assert.equal((await pool.query('SELECT * FROM tenders')).rows.length,0);
    const done=await commitReview(pool,p.id);assert.equal(done.already_imported,false);
    const tender=(await pool.query('SELECT * FROM tenders')).rows[0];
    assert.equal(tender.id,tenderInternalId(job.result.tenders[0]));
    const summary=(await pool.query('SELECT * FROM tender_eligibility')).rows[0];
    assert.equal(Number(summary.emd_amount),25000);
    assert.equal(summary.certifications,'IEC 61215');
    const doc=(await pool.query('SELECT * FROM tender_documents')).rows[0];
    assert.equal(doc.tender_id,tender.id);
    assert.equal(doc.source_data['Is Corrigendum'],'No');
    const c=(await pool.query('SELECT * FROM tender_eligibility_criteria')).rows[0];
    assert.equal(c.tender_id,tender.id);assert.equal(c.reviewed_data.conditions,criterion.conditions);
    assert.equal(c.extraction_job_id,job.id);assert.ok(tender.source_data.review);
    const savedRows = await withEligibility(pool,[{...tender,eligibility_summary:summary}]);
    assert.ok(savedRows[0].eligibility_entries.some(entry=>entry.category==='Technical' && entry.source_url===criterion.source_url && entry.page===1));
    assert.ok(savedRows[0].eligibility_entries.some(entry=>entry.category==='General' && Number(entry.value)===5));
    const dashboard = XLSX.read(dashboardWorkbook(savedRows),{type:'buffer'});
    assert.deepEqual(dashboard.SheetNames,['Tenders','Technical Eligibility','Other Eligibility']);
    assert.equal(XLSX.utils.sheet_to_json(dashboard.Sheets['Tenders'])[0].TN_tenderID,tender.id);
    assert.ok(XLSX.utils.sheet_to_json(dashboard.Sheets['Other Eligibility']).some(entry=>entry.Category==='Financial'));
    assert.equal((await commitReview(pool,p.id)).already_imported,true);
    assert.equal((await previewReview(pool,exported,catalogs)).already_imported,true);
    assert.equal((await pool.query('SELECT * FROM tenders')).rows.length,1);
    const updated=files(),wb=XLSX.read(updated.tenders,{type:'buffer'});
    wb.Sheets['Tenders Review'].D2.v='Reviewer corrected title';
    updated.tenders=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
    const duplicate=await previewReview(pool,updated,catalogs);
    assert.equal(duplicate.duplicates[0].tn_tender_id,tender.id);
    const skipped=await previewReview(pool,updated,catalogs,{SECI000001:'skip'});
    assert.equal(skipped.skipped_all,true);
    const correction=await previewReview(pool,updated,catalogs,{SECI000001:'replace'});
    assert.equal(correction.summary.updates,1);
    await commitReview(pool,correction.id);
    assert.equal((await pool.query('SELECT * FROM tenders')).rows[0].title,'Reviewer corrected title');
    assert.equal((await pool.query('SELECT * FROM tender_eligibility_criteria')).rows.length,1);
    const criteriaOnly=files(),pending=XLSX.read(criteriaOnly.tenders,{type:'buffer'});
    oldReviewSheet(pending,'Tenders Review','Rejected');
    criteriaOnly.tenders=XLSX.write(pending,{type:'buffer',bookType:'xlsx'});
    const justCriteria=await previewReview(pool,criteriaOnly,catalogs,{SECI000001:'replace'});
    assert.equal(justCriteria.summary.new,0);assert.equal(justCriteria.summary.updates,0);
    await commitReview(pool,justCriteria.id);
    assert.equal((await pool.query('SELECT * FROM tender_eligibility_criteria')).rows.length,1);
    assert.equal((await pool.query('SELECT * FROM tender_documents')).rows.length,1);

    const tampered=files(), wrong=XLSX.read(tampered.technical,{type:'buffer'});
    wrong.Sheets['Technical Eligibility'].N2.v=randomUUID();
    tampered.technical=XLSX.write(wrong,{type:'buffer',bookType:'xlsx'});
    await assert.rejects(()=>previewReview(pool,tampered,catalogs),/TN_tenderID does not match/);
    const original = job.result.tenders[0];
    const technology='Bifacial photovoltaic modules compliant with the approved model and manufacturer list. '.repeat(3).trim();
    const connection='Connect to the designated interstate transmission substation and meet all evacuation and metering requirements. '.repeat(3).trim();
    const second = {...original,tender_id:'SECI000002',title:'Second tender',product:null,
      mounting_tech:'single axis tracker',module_tech:technology,interconnection:connection};
    const third = {...original,tender_id:'SECI000003',title:'Third tender',mounting_tech:'Bidder-proposed mounting design'};
    const screenJob = {...job,id:randomUUID(),result:{...job.result,tenders:[original,second,third],batch:{
      offset:0,links:Array.from({length:12},(_,i)=>`https://www.seci.co.in/tender-details/${i+1}`),
    },criteria:[criterion,{...criterion,tender_id:second.tender_id,criterion_id:digest('second criterion')}],
      sources:[...job.result.sources,{...job.result.sources[0],tender_id:second.tender_id}],
    }};
    await pool.query("INSERT INTO radar_extraction_jobs(id,source_url,tender_limit,status,result) VALUES($1,$2,5,'completed',$3)",
      [screenJob.id,screenJob.source_url,JSON.stringify(screenJob.result)]);
    const selection = [{tender_id:second.tender_id,corrections:{product:'Solar PV'}},{tender_id:third.tender_id}];
    await assert.rejects(()=>previewExtraction(pool,screenJob,[{tender_id:'SECI999999'}],catalogs),/Select tenders from this extraction/);
    const screenPreview = await previewExtraction(pool,screenJob,selection,catalogs);
    assert.equal(screenPreview.summary.new,2);
    assert.equal(screenPreview.summary.criteria,1);
    assert.equal(screenPreview.summary.documents,1);
    await commitReview(pool,screenPreview.id);
    assert.equal((await previewExtraction(pool,screenJob,selection,catalogs)).already_imported,true);
    const saved = (await pool.query('SELECT * FROM tenders WHERE tender_id=$1',[second.tender_id])).rows[0];
    assert.equal(saved.title,'Second tender');
    assert.equal(saved.mounting_tech,'Single-Axis Tracker');
    assert.equal(saved.module_tech,technology);
    assert.equal(saved.interconnection,connection);
    const unmatched = (await pool.query('SELECT mounting_tech,source_data FROM tenders WHERE tender_id=$1',[third.tender_id])).rows[0];
    assert.equal(unmatched.mounting_tech,null);
    assert.equal(unmatched.source_data['Mounting Tech'],third.mounting_tech);
    assert.equal((await pool.query('SELECT title FROM tenders WHERE id=$1',[tender.id])).rows[0].title,'Reviewer corrected title');

    const app = express();
    app.use(express.json());
    app.use(createSeciRouter({query:(...args)=>pool.query(...args),connect:async()=>({
      query:(...args)=>pool.query(...args),release:()=>{},
    })}));
    const server = await new Promise(resolve => {const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-only';
    try {
      const api = `http://127.0.0.1:${server.address().port}`;
      const directResponse = await fetch(`${api}/jobs/${screenJob.id}/import/preview`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection}),
      });
      assert.equal(directResponse.status,200);
      assert.equal((await directResponse.json()).already_imported,true);
      const next = async () => {
        const response = await fetch(`${api}/jobs/${screenJob.id}/next`,{method:'POST'});
        assert.equal(response.status,202);
        return response.json();
      };
      const nextJob = await next();
      assert.equal(nextJob.result.batch.offset,5);
      assert.deepEqual(nextJob.result.batch.links,screenJob.result.batch.links);
      assert.equal((await next()).id,nextJob.id);
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
      await new Promise(resolve=>server.close(resolve));
    }
  } finally {await pool.close();}
});
test('commit rolls back if database records changed after preview',async()=>{
  const calls=[],client={query:async(sql)=>{calls.push(sql);if(sql.includes('FROM radar_review_batches'))return {rows:[{created_at:new Date(),payload:{snapshot:{SECI000001:null}},summary:{}}]};if(sql.includes('FROM tenders'))return {rows:[{title:'Changed'}]};return {rows:[]};}};
  await assert.rejects(()=>commitReview(client,randomUUID()),/changed after preview/);
  assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.some(sql=>sql.startsWith('UPDATE tenders')));
});
test('PDF reader rejects HTML disguised as a PDF',async()=>{
  await assert.rejects(()=>readPdf(Buffer.from('<html>login</html>')),/not a PDF/);
});
