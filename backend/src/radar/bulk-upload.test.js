import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {parseWorkbook,insertTenders,catalogFields,templateWorkbook} from './bulk-upload.js';
const id='12345678-1234-1234-1234-123456789abc';
const catalogs=Object.fromEntries(Object.entries(catalogFields).map(([key,[,pk,code]])=>[key,[{[pk]:id,[code]:'CODE',name:'Catalog Name'}]]));
const tender={tender_id:'BULK001',title:'Solar',country_id:'CODE',product_id:'CODE',scope_id:'CODE',authority_id:'CODE',state:'Telangana',tender_open_date:'2099-01-01',tender_close_date:'2099-02-01T00:00:00Z',total_capacity_mw:100,pv_type:'Solar'};
function workbook(rows) {const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Tenders');return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});}
test('Excel template round-trips codes, native dates and numeric capacities',()=> {
 const template=XLSX.read(templateWorkbook(catalogs));assert.deepEqual(template.SheetNames.slice(-2),['DB_Samples_SQL','DB_Samples_rows']);assert.ok(template.Sheets.country_id);
 const rows=parseWorkbook(workbook([{...tender,tender_open_date:new Date('2099-01-01T00:00:00Z'),total_capacity_mw:'1,000'}]),catalogs);
 assert.equal(rows[0].country_id,id);assert.equal(rows[0].tender_open_date,'2099-01-01');assert.equal(rows[0].total_capacity_mw,1000);
});
test('invalid rows, duplicate IDs, unknown catalogs and empty workbooks fail before insert',()=> {
 assert.throws(()=>parseWorkbook(workbook([{...tender,country_id:'Missing'}]),catalogs),/Row 2: country_id/);
 assert.throws(()=>parseWorkbook(workbook([tender,tender]),catalogs),/Row 3: Duplicate/);
 assert.throws(()=>parseWorkbook(workbook([{...tender,total_capacity_mw:-1}]),catalogs),/nonnegative/);
 assert.throws(()=>parseWorkbook(workbook([{...tender,unexpected:'value'}]),catalogs),/headers/);
 assert.throws(()=>parseWorkbook(templateWorkbook(catalogs),catalogs),/no tenders/);
});
test('bulk insert commits together and rolls back on database duplicate; text is bound',async()=> {
 const rows=parseWorkbook(workbook([tender,{...tender,tender_id:'BULK002',title:"'; DROP TABLE tenders; --"}]),catalogs);
 const calls=[];await insertTenders({query:async(sql,values)=>calls.push({sql,values})},rows);
 assert.equal(calls[0].sql,'BEGIN');assert.equal(calls.at(-1).sql,'COMMIT');assert.ok(!calls[2].sql.includes('DROP TABLE'));assert.ok(calls[2].values.includes(rows[1].title));
 const failures=[];await assert.rejects(insertTenders({query:async(sql)=>{failures.push(sql);if(sql.startsWith('INSERT'))throw Error('duplicate');}},rows),/duplicate/);
 assert.equal(failures.at(-1),'ROLLBACK');assert.ok(!failures.includes('COMMIT'));
});
