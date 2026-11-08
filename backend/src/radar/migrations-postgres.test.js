import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const sql=await Promise.all(['001_procurement.sql','002_source_fields.sql','003_seci_template.sql','004_extraction.sql','005_tender_technical_descriptions.sql'].map(name=>readFile(new URL('../db/'+name,import.meta.url),'utf8')));
// PGlite runs PostgreSQL itself, including view dependency checks that pg-mem
// does not implement. gen_random_uuid is built into its PostgreSQL engine;
// only the optional pgcrypto installation is omitted in this test runtime.
const first=sql[0].replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');
const fixture=`
INSERT INTO master_regions(code,name) VALUES('SA','South Asia');
INSERT INTO master_countries(region_id,iso_code,name) SELECT region_id,'IN','India' FROM master_regions;
INSERT INTO master_product_segments(code,name) VALUES('SOLAR','Solar PV');
INSERT INTO master_contract_scopes(code,name) VALUES('EPC','Engineering and construction');
INSERT INTO tendering_authorities(code,name) VALUES('SECI','SECI');
INSERT INTO tenders(tender_id,title,authority_id,scope_id,product_id,country_id,state,tender_open_date,tender_close_date,total_capacity_mw,pv_type)
SELECT 'MIGRATION001','Existing tender',a.authority_id,s.scope_id,p.product_id,c.country_id,'Bihar','2026-10-01','2026-12-01T18:00:00+05:30',10,'Solar'
FROM tendering_authorities a CROSS JOIN master_contract_scopes s CROSS JOIN master_product_segments p CROSS JOIN master_countries c;
INSERT INTO tender_eligibility(tender_id,emd_amount) SELECT id,25000 FROM tenders;
`;

test('PostgreSQL reproduces both view dependencies; corrected migration preserves existing records and projection',async()=>{
  const db=new PGlite();
  try {
    await db.exec(first+sql[1]+fixture);
    const before=(await db.query('SELECT * FROM view_taiyang_tender_radar')).rows;
    assert.equal(before.length,1);
    await assert.rejects(()=>db.exec('ALTER TABLE master_contract_scopes ALTER COLUMN name TYPE TEXT'),e=>e.code==='0A000' && e.detail.includes('name'));
    await assert.rejects(()=>db.exec('ALTER TABLE tenders ALTER COLUMN total_capacity_mw TYPE NUMERIC(16,6)'),e=>e.code==='0A000' && e.detail.includes('total_capacity_mw'));
    await db.exec('BEGIN;'+sql[2]+sql[3]+'COMMIT;');
    const normalize=rows=>rows.map(row=>({...row,total_capacity_mw:Number(row.total_capacity_mw)}));
    assert.deepEqual(normalize((await db.query('SELECT * FROM view_taiyang_tender_radar')).rows),normalize(before));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM tender_eligibility')).rows[0].n,1);
    await db.query('UPDATE master_contract_scopes SET name=$1',['x'.repeat(1000)]);
    await db.exec('UPDATE tenders SET total_capacity_mw=0.000001, state=NULL, pv_type=NULL');
    const row=(await db.query('SELECT scope,total_capacity_mw,state,pv_type FROM view_taiyang_tender_radar')).rows[0];
    assert.equal(row.scope.length,1000);assert.equal(Number(row.total_capacity_mw),0.000001);assert.equal(row.state,null);assert.equal(row.pv_type,null);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('radar_extraction_jobs','radar_review_batches','tender_eligibility_criteria')")).rows[0].n,3);
    await db.exec('BEGIN;'+sql[4]+'COMMIT;');
    const technology='Module technology requirements '.repeat(8), connection='Connection and evacuation requirements '.repeat(8);
    await db.query('UPDATE tenders SET module_tech=$1,interconnection=$2',[technology,connection]);
    assert.equal((await db.query('SELECT module_tech FROM view_taiyang_tender_radar')).rows[0].module_tech,technology);
    assert.equal((await db.query('SELECT interconnection FROM tenders')).rows[0].interconnection,connection);
  } finally {await db.close();}
});

test('all migrations also run in one transaction on a fresh PostgreSQL database',async()=>{
  const db=new PGlite();
  try {
    await db.exec('BEGIN;'+first+sql.slice(1).join('\n')+'COMMIT;');
    assert.deepEqual((await db.query('SELECT * FROM view_taiyang_tender_radar')).rows,[]);
    await db.exec(fixture);
    assert.equal((await db.query('SELECT tender_id FROM view_taiyang_tender_radar')).rows[0].tender_id,'MIGRATION001');
  } finally {await db.close();}
});
