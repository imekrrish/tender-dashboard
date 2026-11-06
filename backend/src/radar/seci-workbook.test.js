import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import XLSX from 'xlsx';
import {newDb} from 'pg-mem';
import {parseWorkbook, insertTenders} from './bulk-upload.js';
import {format} from './reference-workbook.js';

const id = '12345678-1234-1234-1234-123456789abc';
const catalogs = {
  country_id:[{country_id:id, iso_code:'IN', name:'India'}],
  authority_id:[{authority_id:id, code:'SECI', name:'SECI'}],
  product_id:[{product_id:id, code:'BESS', name:'Battery Storage'}], scope_id:[],
};
// Synthetic records exercise the supplied layout; uploaded source files stay private.
function fixture() {
  const workbook = XLSX.utils.book_new();
  const grid = [format[0].headers];
  for (let index = 0; index < 19; index++) {
    const row = Array(33).fill(null);
    Object.assign(row, {0:index + 1, 1:'SAMPLE' + String(index + 1).padStart(3, '0'),
      2:'SAMPLE/REF/' + index, 3:'Synthetic tender ' + index,
      4:'Solar Energy Corporation of India Limited (SECI)',
      5:'Selection of developers for a synthetic tender with a descriptive scope that is longer than one hundred characters for import validation',
      6:index === 1 ? 'Standalone BESS' : 'Solar PV',
      7:index >= 13 ? 'Closed – bid submission ended' : 'Open – bids being accepted',
      8:new Date('2026-10-28T18:00:00Z'),
      9:new Date('2026-12-14T18:00:00Z'),
      17:'India', 28:'https://example.com/tender/' + index,
      31:new Date('2026-11-03T00:00:00Z'), 32:'Synthetic editor'});
    if (index === 1) Object.assign(row, {10:4000, 11:16000, 18:'Rajasthan, Gujarat'});
    if (index === 4) Object.assign(row, {10:3.68, 12:'Rooftop', 15:'Rooftop'});
    if (index === 12) row[9] = new Date('2026-11-06T15:59:59.999Z');
    if (index === 18) row[10] = 0.922635;
    grid.push(row);
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(grid), 'SECI Tenders');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Notes'], ['Ignored source notes']]), 'Notes');
  return XLSX.write(workbook, {type:'buffer', bookType:'xlsx'});
}
async function changed(change) {
  const workbook = XLSX.read(await fixture(), {cellDates:true, cellNF:true});
  change(workbook.Sheets['SECI Tenders'], workbook);
  return XLSX.write(workbook, {type:'buffer', bookType:'xlsx'});
}

test('SECI layout imports 19 tenders, IST dates, precision and original metadata', async () => {
  const original = JSON.stringify(catalogs);
  const rows = parseWorkbook(await fixture(), catalogs);
  assert.equal(rows.length, 19);
  assert.equal(rows[0].tender_id, 'SAMPLE001');
  assert.equal(rows[0].authority_id, id);
  assert.equal(rows[0].tender_open_date, '2026-10-28');
  assert.equal(rows[0].tender_close_date, '2026-12-14T12:30:00.000Z');
  assert.equal(rows[12].tender_close_date, '2026-11-06T10:30:00.000Z');
  assert.equal(rows[0].state, null);
  assert.equal(rows[0].total_capacity_mw, null);
  assert.equal(rows[0].pv_type, null);
  assert.equal(rows[0].almm_compliance_required, null);
  assert.equal(rows[0].dcr_mandatory, null);
  assert.equal(rows[0].interconnection, null);
  assert.equal(rows[1].product_id, id); // Existing BESS catalog is reused.
  assert.equal(rows[1].storage_capacity_mwh, 16000);
  assert.equal(rows[4].mounting_tech, 'Rooftop');
  assert.equal(rows[18].total_capacity_mw, 0.922635);
  assert.equal(rows[13].source_data['Current Status'], 'Closed – bid submission ended');
  assert.equal(rows[0].source_data['Last Edited By'], 'Synthetic editor');
  assert.equal(rows[0].source_data['Tendering Authority'], 'Solar Energy Corporation of India Limited (SECI)');
  assert.equal(rows[0].import_source, 'seci-tenders');
  assert.equal(rows[0].current_status, undefined); // Public status is computed from dates.
  assert.equal(rows.catalogs.filter(r => r.table === 'master_product_segments' && r.data.name === 'Solar PV').length, 1);
  assert.equal(JSON.stringify(catalogs), original);
});

test('SECI validation rejects malformed rows, duplicate IDs, bad headers and unknown countries', async () => {
  for (const [change, error] of [
    [s => {s.B3.v = s.B2.v;}, /row 3: Duplicate Tender ID/],
    [s => {s.A1.v = 'Changed';}, /original headers/],
    [s => {s.K2 = {t:'n', v:-1};}, /row 2: total_capacity_mw/],
    [s => {s.AC2.v = 'javascript:alert(1)';}, /HTTP\(S\) URL/],
    [s => {s.R2.v = 'Unknown Country';}, /country_id/],
    [s => {s.J2 = {t:'s', v:'invalid date'};}, /tender_close_date/],
    [s => {s['!ref'] = 'A1:AG1002';}, /at most 1,000/],
  ]) {
    const buffer = await changed(change);
    assert.throws(() => parseWorkbook(buffer, catalogs), error);
  }
});

test('SECI timestamps accept explicit offsets and interpret unqualified strings in IST', async () => {
  const rows = parseWorkbook(await changed(s => {
    s.J2 = {t:'s', v:'2026-12-14T18:00:00+05:30'};
    s.J3 = {t:'s', v:'2026-11-19 18:00:00'};
  }), catalogs);
  assert.equal(Date.parse(rows[0].tender_close_date), Date.parse('2026-12-14T12:30:00Z'));
  assert.equal(Date.parse(rows[1].tender_close_date), Date.parse('2026-11-19T12:30:00Z'));
});

test('SECI records and new catalogs persist together after migration with NULLs and exact capacities', async () => {
  const db = newDb();
  db.registerExtension('pgcrypto', s => s.registerFunction({name:'gen_random_uuid', returns:'uuid', implementation:randomUUID, impure:true}));
  for (const file of ['001_procurement.sql','002_source_fields.sql','003_seci_template.sql']) {
    // pg-mem lacks DROP VIEW; migrations-postgres.test.js verifies the actual
    // PostgreSQL dependency removal and recreation without this adaptation.
    const sql=await readFile(new URL('../db/' + file, import.meta.url), 'utf8');
    db.public.none(sql.replace('DROP VIEW view_taiyang_tender_radar;','').replace(/CREATE VIEW view_taiyang_tender_radar AS[\s\S]*$/, ''));
  }
  const client = new (db.adapters.createPg().Client)();
  await client.connect();
  try {
    await client.query("INSERT INTO master_regions(region_id,code,name) VALUES ($1,'SA','South Asia')", [id]);
    await client.query("INSERT INTO master_countries(country_id,region_id,iso_code,name) VALUES ($1,$1,'IN','India')", [id]);
    await client.query("INSERT INTO tendering_authorities(authority_id,code,name) VALUES ($1,'SECI','SECI')", [id]);
    await client.query("INSERT INTO master_product_segments(product_id,code,name) VALUES ($1,'BESS','Battery Storage')", [id]);
    const rows = parseWorkbook(await fixture(), catalogs);
    await insertTenders(client, rows);
    const result = (await client.query('SELECT * FROM tenders ORDER BY tender_id')).rows;
    assert.equal(result.length, 19);
    assert.equal(result.find(r => r.tender_id === 'SAMPLE019').total_capacity_mw, 0.922635);
    assert.equal(result.find(r => r.tender_id === 'SAMPLE001').total_capacity_mw, null);
    // A later file reuses the catalog records instead of duplicating them.
    const next = parseWorkbook(await changed(s => {s.B2.v = 'SECI_NEW'; s['!ref'] = 'A1:AG2';}), catalogs);
    await insertTenders(client, next);
    assert.equal((await client.query('SELECT * FROM tenders')).rows.length, 20);
    assert.equal((await client.query('SELECT * FROM master_contract_scopes')).rows.length, rows.catalogs.filter(r => r.table === 'master_contract_scopes').length);
  } finally {await client.end();}
});

test('SECI catalog and tender failures roll back the whole batch', async () => {
  const rows = parseWorkbook(await fixture(), catalogs), calls = [];
  await assert.rejects(insertTenders({query:async sql => {
    calls.push(sql);
    if (sql.startsWith('INSERT INTO master_')) throw Error('catalog failure');
  }}, rows), /catalog failure/);
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.ok(!calls.includes('COMMIT'));
  assert.ok(!calls.some(sql => sql.startsWith('INSERT INTO tenders')));
});
