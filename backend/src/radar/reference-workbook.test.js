import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {newDb} from 'pg-mem';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parseWorkbook,templateWorkbook,insertTenders} from './bulk-upload.js';
import {format} from './reference-workbook.js';
const id='12345678-1234-1234-1234-123456789abc';
const catalogs={country_id:[{country_id:id,iso_code:'IN',name:'India'}],product_id:[{product_id:id,code:'PV',name:'Solar PV'}],scope_id:[{scope_id:id,code:'EPC',name:'Turnkey EPC'}],authority_id:[{authority_id:id,code:'TEST',name:'Test Authority'}],players:[]};
function fixture(change) {
 const wb=XLSX.read(templateWorkbook(catalogs));
 const grid=XLSX.utils.sheet_to_json(wb.Sheets.DB_Samples_rows,{header:1,defval:null,blankrows:true});
 const values={
  Tenders_Master:[1,'TESTREF','REF','Solar Test','Test Authority','Turnkey EPC','Solar PV','Open',new Date('2026-01-01'),new Date('2099-01-01'),100,0,'Ground-Mount','TOPCon',21.8,'Fixed Ballasted','N/A','India','Telangana','Hyderabad',500001,'Site',17.4,78.4,'ISTS',132,'Yes','No','https://example.com/tender','Survey; Soil','Remarks',new Date('2026-01-02'),'Source editor'],
  Eligibility:['TESTREF','INR',1000,'Bank Guarantee',10000,5000,2000,'Tariff Contract',0.05,100,'OEM','N/A','IEC','30 MW single project','0.5% per week',0.1,2],
  Documents:['TESTREF','RfS','RfS Legal','PDF','https://example.com/portal','https://example.com/rfs.pdf','No',new Date('2026-01-01')],
  Auction_BI:['TESTREF',new Date('2026-10-01'),100,250,'2.5x',4.5,3.84,'Test Developer',100,200,3.84,'Test EPC','No',new Date('2028-01-01')],
 };
 change?.(values);
 for(const f of format)grid[f.headerRow]=values[f.title];
 wb.Sheets.DB_Samples_rows=XLSX.utils.aoa_to_sheet(grid);
 wb.Sheets.DB_Samples_rows.I13.z='0.00%';wb.Sheets.DB_Samples_rows.P13.z='0%';
 // Deliberate hostile reference: it must never reach any SQL statement.
 wb.Sheets.DB_Samples_SQL=XLSX.utils.aoa_to_sheet([['DROP TABLE tenders;']]);
 return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
test('template matches all source section titles, header order and last two tab names',()=>{
 const wb=XLSX.read(templateWorkbook(catalogs));assert.deepEqual(wb.SheetNames.slice(-2),['DB_Samples_SQL','DB_Samples_rows']);
 const grid=XLSX.utils.sheet_to_json(wb.Sheets.DB_Samples_rows,{header:1});
 for(const f of format){assert.equal(grid[f.titleRow-1][0],f.title);assert.deepEqual(grid[f.headerRow-1],f.headers);}
});
test('all row sections resolve links and preserve eligibility terms and source metadata',()=>{
 const rows=parseWorkbook(fixture(),catalogs);assert.equal(rows.length,1);assert.equal(rows[0].mounting_tech,'Ballasted Rooftop');assert.equal(rows[0].almm_compliance_required,true);assert.equal(rows[0].postal_code,'500001');
 const related=rows.related;assert.equal(related.tender_eligibility[0].tender_id,rows[0].id);assert.equal(related.tender_eligibility[0].performance_bg_pct,5);assert.equal(related.tender_eligibility[0].ld_cap_pct,10);assert.equal(related.tender_eligibility[0].estimated_project_value_terms,'Tariff Contract');
 assert.equal(related.tender_documents[0].source_data['File Format'],'PDF');assert.equal(related.tender_auction_meta[0].oversubscription_ratio,2.5);assert.equal(related.market_players.length,2);assert.equal(related.tender_bid_results[0].bidder_id,related.market_players[0].player_id);
});
test('unknown linked IDs and invalid section records reject the whole workbook',()=>{
 assert.throws(()=>parseWorkbook(fixture(v=>v.Documents[0]='MISSING'),catalogs),/row 22: Tender ID/);
 assert.throws(()=>parseWorkbook(fixture(v=>v.Eligibility[2]=-1),catalogs),/row 13: emd_amount/);
 assert.throws(()=>parseWorkbook(fixture(v=>v.Tenders_Master[4]='Unknown'),catalogs),/row 3: authority_id/);
});
test('reference workbook inserts relational records into PostgreSQL schema in one batch',async()=>{
 const db=newDb();db.registerExtension('pgcrypto',s=>s.registerFunction({name:'gen_random_uuid',returns:'uuid',implementation:randomUUID,impure:true}));
 for(const file of ['001_procurement.sql','002_source_fields.sql'])db.public.none(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
 const client=new (db.adapters.createPg().Client)();await client.connect();
 try{
  await client.query('INSERT INTO master_regions(region_id,code,name) VALUES ($1,$2,$3)',[id,'SA','South Asia']);
  await client.query('INSERT INTO master_countries(country_id,region_id,iso_code,name) VALUES ($1,$2,$3,$4)',[id,id,'IN','India']);
  await client.query('INSERT INTO master_product_segments(product_id,code,name) VALUES ($1,$2,$3)',[id,'PV','Solar PV']);
  await client.query('INSERT INTO master_contract_scopes(scope_id,code,name) VALUES ($1,$2,$3)',[id,'EPC','Turnkey EPC']);
  await client.query('INSERT INTO tendering_authorities(authority_id,code,name) VALUES ($1,$2,$3)',[id,'TEST','Test Authority']);
  const rows=parseWorkbook(fixture(),catalogs);await insertTenders(client,rows);
  for(const [table,count] of [['tenders',1],['tender_eligibility',1],['tender_documents',1],['market_players',2],['tender_auction_meta',1],['tender_bid_results',1]])assert.equal((await client.query(`SELECT * FROM ${table}`)).rows.length,count);
 }finally{await client.end();}
});
test('related insert failures roll back and never execute the SQL reference sheet',async()=>{
 const rows=parseWorkbook(fixture(),catalogs),calls=[];
 await assert.rejects(insertTenders({query:async(sql)=>{calls.push(sql);if(sql.startsWith('INSERT INTO tender_documents'))throw Error('document failed');}},rows),/document failed/);
 assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.includes('COMMIT'));assert.ok(!calls.some(s=>s.includes('DROP TABLE')));
});
