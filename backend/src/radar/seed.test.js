import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { decodeSeed, seedDatabase } from '../db/seed-service.js';
const tables = Object.fromEntries(['master_regions','master_countries','master_product_segments','master_contract_scopes','tendering_authorities','market_players','tenders','tender_eligibility','tender_documents','tender_corrigenda','tender_auction_meta','tender_bid_results'].map(t=>[t,[]]));
const bundle = {import_key:'synthetic-env-seed',source_sheets:['synthetic'],counts:Object.fromEntries(Object.keys(tables).map(t=>[t,0])),tables};
const encode = b=>gzipSync(JSON.stringify(b)).toString('base64');
test('environment seed decodes the reviewed bundle and rejects corrupt input',()=> {
  assert.deepEqual(decodeSeed(encode(bundle)),bundle);
  for(const invalid of ['', 'not-base64', Buffer.from('not gzip').toString('base64'), gzipSync('not json').toString('base64')])assert.throws(()=>decodeSeed(invalid));
  assert.throws(()=>decodeSeed(encode({...bundle,tables:{...tables,unexpected:[]}})));
});
test('automatic seed applies once and skips redeployment with unchanged contents',async()=> {
 let marker;let writes=0;const client={query:async(sql,args)=> {
  if(sql.startsWith('SELECT content_sha256'))return {rowCount:marker?1:0,rows:marker?[{content_sha256:marker}]:[]};
  if(sql.startsWith('INSERT INTO radar_imports')){marker=args[1];writes++;}
  return {rowCount:1,rows:[]};
 }};
 assert.equal((await seedDatabase(client,encode(bundle))).already_imported,false);
 assert.equal((await seedDatabase(client,encode(bundle))).already_imported,true);
 assert.equal(writes,1);
 await assert.rejects(()=>seedDatabase(client,encode({...bundle,policy:'changed'})),/different contents/);
});
