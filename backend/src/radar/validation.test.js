import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, filterSql, csvCell } from './validation.js';
test('filter defaults to Open and binds search without interpolating SQL',()=> {
 const f = filterSql({search:"'; DROP TABLE tenders; --"});
 assert.match(f.where,/current_status = \$1/);assert.equal(f.values[0],'Open');
 assert.equal(f.values[1],"%'; DROP TABLE tenders; --%");assert.ok(!f.where.includes('DROP'));
});
test('rejects unknown fields, invalid foreign IDs and protected audit writes',()=> {
 assert.throws(()=>validate('master_regions',{code:'SA',name:'South Asia',anything:1}));
 assert.throws(()=>validate('master_countries',{iso_code:'IN',name:'India',region_id:'broken'}));
 assert.throws(()=>validate('tenders',{last_edited_by:'spoof'},true));
});
test('requires mandatory fields and validates financial numbers and URLs',()=> {
 assert.throws(()=>validate('master_regions',{code:'SA'}));
 assert.throws(()=>validate('tender_eligibility',{emd_amount:-1},true));
 assert.throws(()=>validate('tenders',{module_eff_pct:101},true));
 assert.throws(()=>validate('tenders',{link_to_tender:'javascript:alert(1)'},true));
 assert.deepEqual(validate('master_regions',{code:'SA',name:'South Asia'}),{code:'SA',name:'South Asia'});
});
test('CSV cells quote newlines and neutralize spreadsheet formulas',()=> {
 assert.equal(csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');
 assert.equal(csvCell('a\nb'),'"a\nb"');assert.equal(csvCell(null),'""');
});
