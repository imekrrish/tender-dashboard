import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {newDb} from 'pg-mem';
import XLSX from 'xlsx';
import {seciUrl,fetchSeci,parseListing,parseDetail,pageChunks,readPdf} from './seci-source.js';
import {extractTenderSet} from './seci-jobs.js';
import {extractStructured} from './seci-ai.js';
import {reviewWorkbook,parseReviewFiles,previewReview,commitReview,digest} from './seci-workflow.js';

const job={id:randomUUID(),source_url:'https://www.seci.co.in/tenders',created_at:'2026-11-06',status:'completed'};
const criterion={criterion_id:digest('synthetic criterion'),tender_id:'SECI000001',category:'Technical',requirement:'Completed 10 MW solar project',threshold:10,unit:'MW',period:'Last 5 years',conditions:'One project OR two projects of 5 MW each; lead JV member qualifies',evidence:'Commissioning certificate',source_url:'https://www.seci.co.in/uploads/tenders/example.pdf',page:1,clause:'2.1',quote:'Completed 10 MW solar project'};
job.result={tenders:[{tender_id:'SECI000001',url:'https://www.seci.co.in/tender-details/abc',title:'Synthetic solar tender',scope:'EPC',product:'Solar PV',publication_date:'2026-11-01',closing_date:'2026-12-01T18:00:00+05:30',country:'India',state:'Bihar',total_capacity_mw:10,pv_type:'Ground mount'}],criteria:[criterion],sources:[]};
const cats=()=>({country_id:[{country_id:randomUUID(),iso_code:'IN',name:'India'}],product_id:[{product_id:randomUUID(),code:'SOLAR',name:'Solar PV'}],scope_id:[{scope_id:randomUUID(),code:'EPC',name:'EPC'}],authority_id:[{authority_id:randomUUID(),code:'SECI',name:'SECI'}]});
function files(approved=false) {
  return Object.fromEntries(['tenders','technical','financial'].map(kind=>{
    const buffer=reviewWorkbook(job,kind),wb=XLSX.read(buffer,{type:'buffer'}),sheet=wb.Sheets[wb.SheetNames[0]];
    if(approved && kind!=='financial') sheet[kind==='tenders'?'AH2':'N2']={t:'s',v:'Approved'};
    return [kind,XLSX.write(wb,{type:'buffer',bookType:'xlsx'})];
  }));
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
test('three workbooks default to pending, preserve condition logic and enforce approval and matching extraction',()=>{
  assert.throws(()=>parseReviewFiles(files(),cats()),/No approved rows/);
  const approved=files(true),parsed=parseReviewFiles(approved,cats());
  assert.equal(parsed.tenders.length,1);assert.equal(parsed.criteria.length,1);assert.match(parsed.criteria[0].conditions,/OR/);
  assert.equal(parsed.tenders[0].tender_close_date,'2026-12-01T18:00:00+05:30');
  const wb=XLSX.read(approved.technical,{type:'buffer'});wb.Sheets.Extraction.B1.v=randomUUID();
  assert.throws(()=>parseReviewFiles({...approved,technical:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})},cats()),/same extraction/);
  const formula=XLSX.read(approved.technical,{type:'buffer'});formula.Sheets['Technical Eligibility'].E2.f='1+1';
  assert.throws(()=>parseReviewFiles({...approved,technical:XLSX.write(formula,{type:'buffer',bookType:'xlsx'})},cats()),/formulas/);
  const bad=XLSX.read(approved.technical,{type:'buffer'});bad.Sheets['Technical Eligibility'].K2={t:'n',v:0};
  assert.throws(()=>parseReviewFiles({...approved,technical:XLSX.write(bad,{type:'buffer',bookType:'xlsx'})},cats()),/PDF Page/);
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
  const db=newDb();db.registerExtension('pgcrypto',s=>s.registerFunction({name:'gen_random_uuid',returns:'uuid',implementation:randomUUID,impure:true}));
  // pg-mem lacks DROP VIEW. The real PostgreSQL rebuild is verified separately
  // in migrations-postgres.test.js; this suite tests review/import behavior.
  for(const f of ['001_procurement.sql','002_source_fields.sql','003_seci_template.sql','004_extraction.sql']) {
    const sql=await readFile(new URL('../db/'+f,import.meta.url),'utf8');
    db.public.none(sql.replace('DROP VIEW view_taiyang_tender_radar;','').replace(/CREATE VIEW view_taiyang_tender_radar AS[\s\S]*$/, ''));
  }
  const pool=new(db.adapters.createPg().Pool)();
  const region=(await pool.query("INSERT INTO master_regions(code,name) VALUES('SA','South Asia') RETURNING region_id")).rows[0];
  await pool.query("INSERT INTO master_countries(region_id,iso_code,name) VALUES($1,'IN','India')",[region.region_id]);
  await pool.query("INSERT INTO master_product_segments(code,name) VALUES('SOLAR','Solar PV')");
  await pool.query("INSERT INTO master_contract_scopes(code,name) VALUES('EPC','EPC')");
  await pool.query("INSERT INTO tendering_authorities(code,name) VALUES('SECI','SECI')");
  await pool.query("INSERT INTO radar_extraction_jobs(id,source_url,tender_limit,status,result) VALUES($1,$2,5,'completed',$3)",[job.id,job.source_url,JSON.stringify(job.result)]);
  const catalogs={};for(const [k,table] of Object.entries({country_id:'master_countries',product_id:'master_product_segments',scope_id:'master_contract_scopes',authority_id:'tendering_authorities'}))catalogs[k]=(await pool.query(`SELECT * FROM ${table}`)).rows;
  const approved=files(true),p=await previewReview(pool,approved,catalogs);
  assert.equal(p.summary.new,1);assert.equal(p.summary.criteria,1);assert.equal((await pool.query('SELECT * FROM tenders')).rowCount,0);
  const client=await pool.connect();const calls=[];
  const wrapped={query:async(sql,args)=>{calls.push(sql);if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};return client.query(sql,args);}};
  try {
    const done=await commitReview(wrapped,p.id);assert.equal(done.already_imported,false);
    const tender=(await pool.query('SELECT * FROM tenders')).rows[0];
    const c=(await pool.query('SELECT * FROM tender_eligibility_criteria')).rows[0];
    assert.equal(c.tender_id,tender.id);assert.equal(c.reviewed_data.conditions,criterion.conditions);
    assert.equal(c.extraction_job_id,job.id);assert.ok(tender.source_data.review);
    assert.equal((await commitReview(wrapped,p.id)).already_imported,true);
    assert.equal((await previewReview(pool,approved,catalogs)).already_imported,true);
    assert.equal((await pool.query('SELECT * FROM tenders')).rowCount,1);
    const updated=files(true),wb=XLSX.read(updated.tenders,{type:'buffer'});
    wb.Sheets['Tenders Review'].D2.v='Reviewer corrected title';
    updated.tenders=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
    const correction=await previewReview(pool,updated,catalogs);
    assert.equal(correction.summary.updates,1);
    await commitReview(wrapped,correction.id);
    assert.equal((await pool.query('SELECT * FROM tenders')).rows[0].title,'Reviewer corrected title');
    assert.equal((await pool.query('SELECT * FROM tender_eligibility_criteria')).rowCount,1);
    const criteriaOnly=files(true),pending=XLSX.read(criteriaOnly.tenders,{type:'buffer'});
    pending.Sheets['Tenders Review'].AH2.v='Pending';
    criteriaOnly.tenders=XLSX.write(pending,{type:'buffer',bookType:'xlsx'});
    const justCriteria=await previewReview(pool,criteriaOnly,catalogs);
    assert.equal(justCriteria.summary.new,0);assert.equal(justCriteria.summary.updates,0);
    await commitReview(wrapped,justCriteria.id);
    assert.equal((await pool.query('SELECT * FROM tender_eligibility_criteria')).rowCount,1);
  } finally {client.release();await pool.end();}
});
test('commit rolls back if database records changed after preview',async()=>{
  const calls=[],client={query:async(sql)=>{calls.push(sql);if(sql.includes('FROM radar_review_batches'))return {rows:[{created_at:new Date(),payload:{snapshot:{SECI000001:null}},summary:{}}]};if(sql.includes('FROM tenders'))return {rows:[{title:'Changed'}]};return {rows:[]};}};
  await assert.rejects(()=>commitReview(client,randomUUID()),/changed after preview/);
  assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.some(sql=>sql.startsWith('UPDATE tenders')));
});
test('PDF reader rejects HTML disguised as a PDF',async()=>{
  await assert.rejects(()=>readPdf(Buffer.from('<html>login</html>')),/not a PDF/);
});
