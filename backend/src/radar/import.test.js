import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {newDb} from 'pg-mem';
import {inspectBundle,applyBundle} from '../imports/import-service.js';
// Synthetic fixture only: no private workbook records are committed to GitHub.
const bundle={import_key:'synthetic-test',source_sheets:['SQL_fixture','Rows_fixture'],counts:{},tables:{}};
for(const table of ['master_regions','master_countries','master_product_segments','master_contract_scopes','tendering_authorities','market_players','tenders','tender_eligibility','tender_documents','tender_corrigenda','tender_auction_meta','tender_bid_results'])bundle.tables[table]=[];
const region='11111111-0000-0000-0000-000000000001',country='22222222-0000-0000-0000-000000000001',product='33333333-0000-0000-0000-000000000001',scope='44444444-0000-0000-0000-000000000001',authority='55555555-0000-0000-0000-000000000001',id='66666666-0000-0000-0000-000000000001';
bundle.tables.master_regions=[{region_id:region,code:'TEST',name:'Test Region'}];
bundle.tables.master_countries=[{country_id:country,region_id:region,iso_code:'ZZ',name:'Test Country'}];
bundle.tables.master_product_segments=[{product_id:product,code:'SOLAR_PV',name:'Test Solar'}];
bundle.tables.master_contract_scopes=[{scope_id:scope,code:'TEST',name:'Test Scope'}];
bundle.tables.tendering_authorities=[{authority_id:authority,code:'TEST',name:'Test Authority',country_id:country}];
bundle.tables.tenders=[{id,tender_id:'TEST001',title:'Synthetic Test Tender',authority_id:authority,scope_id:scope,product_id:product,country_id:country,state:'Test State',tender_open_date:'2026-10-01',tender_close_date:'2026-11-01T12:00:00+05:30',total_capacity_mw:10,pv_type:'Ground-Mount',analysis_tags:['Test Tag'],source_data:{row_sheet:{note:'Synthetic'}}}];
bundle.tables.tender_eligibility=[{tender_id:id,ld_cap_pct:10,performance_bg_terms:'Fixed amount per MW',technical_track_record_text:'2 MW solar or equivalent storage experience'}];
bundle.tables.tender_documents=[{doc_id:'77777777-0000-0000-0000-000000000001',tender_id:id,document_title:'Test Document',document_bucket_url:'https://example.com/test.pdf'}];
for(const [table,rows] of Object.entries(bundle.tables))bundle.counts[table]=rows.length;
test('parameterized import persists all relationships once and skips exact repeat',async()=> {
 const db=newDb();db.registerExtension('pgcrypto',s=>s.registerFunction({name:'gen_random_uuid',returns:'uuid',implementation:randomUUID,impure:true}));
 for(const f of ['001_procurement.sql','002_source_fields.sql'])db.public.none(await readFile(new URL('../db/'+f,import.meta.url),'utf8'));
 const adapter=new(db.adapters.createPg().Pool)();const client=await adapter.connect();
 const wrapper={query:async(sql,args)=>sql.includes('pg_advisory_xact_lock')?{rows:[],rowCount:1}:client.query(sql,args)};
 try {
  const first=await applyBundle(wrapper,bundle);assert.equal(first.already_imported,false);
  assert.equal((await client.query('SELECT * FROM tenders')).rowCount,1);
  assert.equal((await client.query('SELECT * FROM tender_bid_results')).rowCount,0);
  const next=await applyBundle(wrapper,bundle);assert.equal(next.already_imported,true);
  assert.equal((await client.query('SELECT * FROM tender_documents')).rowCount,1);
  const e=(await client.query("SELECT * FROM tender_eligibility WHERE tender_id='66666666-0000-0000-0000-000000000001'")).rows[0];assert.equal(e.ld_cap_pct,10);assert.match(e.technical_track_record_text,/2 MW solar/);
 }finally{client.release();await adapter.end();}
});
test('import failure rolls back and never records completion',async()=> {
 const calls=[];const client={query:async(sql)=> {calls.push(sql);if(sql.startsWith('SELECT content_sha256'))return {rowCount:0,rows:[]};if(sql.startsWith('INSERT INTO master_countries'))throw new Error('connection failed');return {rowCount:1,rows:[]};}};
 await assert.rejects(()=>applyBundle(client,bundle),/connection failed/);assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.some(s=>s.startsWith('INSERT INTO radar_imports')));
});
test('unexpected tables and duplicate records are rejected before database writes',()=> {
 const copy=structuredClone(bundle);copy.tables.tenders.push(copy.tables.tenders[0]);assert.throws(()=>inspectBundle(copy),/duplicate/);
 const injected=structuredClone(bundle);injected.tables.tenders[0]['title); DROP TABLE tenders; --']='bad';assert.throws(()=>inspectBundle(injected),/Unknown import column/);
});
