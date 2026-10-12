import { createHash } from 'node:crypto';
import { schema } from '../radar/validation.js';
const primaryKeys = {
  master_regions:'region_id',master_countries:'country_id',master_product_segments:'product_id',
  master_contract_scopes:'scope_id',tendering_authorities:'authority_id',market_players:'player_id',
  tenders:'id',tender_eligibility:'tender_id',tender_documents:'doc_id',tender_corrigenda:'corrigendum_id',
  tender_auction_meta:'auction_id',tender_bid_results:'result_id',
};
export function inspectBundle(bundle) {
  if (!bundle || typeof bundle.import_key !== 'string' || !bundle.tables || !Array.isArray(bundle.source_sheets)) throw new Error('Invalid import bundle');
  const counts = {};
  for (const table of Object.keys(primaryKeys)) {
    const rows = bundle.tables[table];
    if (!Array.isArray(rows)) throw new Error(`Missing table ${table}`);
    const ids = new Set();
    for (const row of rows) {
      if (typeof row !== 'object' || !row || Array.isArray(row)) throw new Error(`Invalid ${table} record`);
      const id = row[primaryKeys[table]];
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || ids.has(id)) throw new Error(`Missing or duplicate ${table} record ID`);
      ids.add(id);
      for (const key of Object.keys(row)) if (!schema[table]?.[key]) throw new Error(`Unknown import column ${table}.${key}`);
    }
    counts[table] = rows.length;
    if (bundle.counts?.[table] !== rows.length) throw new Error(`Count mismatch in ${table}`);
  }
  if (Object.keys(bundle.tables).some(t=>!primaryKeys[t])) throw new Error('Unexpected import table');
  const tenderIDs = new Set(bundle.tables.tenders.map(t=>t.id));
  const refs = {master_countries:{region_id:'master_regions'},tendering_authorities:{country_id:'master_countries'},market_players:{headquarters_country_id:'master_countries'},tenders:{authority_id:'tendering_authorities',scope_id:'master_contract_scopes',product_id:'master_product_segments',country_id:'master_countries'},tender_bid_results:{bidder_id:'market_players',epc_contractor_id:'market_players',module_supplier_id:'market_players',floater_supplier_id:'market_players'}};
  for (const [table,rows] of Object.entries(bundle.tables)) for (const row of rows) {
    if (table !== 'tenders' && row.tender_id && !tenderIDs.has(row.tender_id)) throw new Error(`Unknown parent tender in ${table}`);
    for (const [key,parent] of Object.entries(refs[table] || {})) if (row[key]!=null && !bundle.tables[parent].some(p=>p[primaryKeys[parent]]===row[key])) throw new Error(`Unknown foreign record ${table}.${key}`);
  }
  return { import_key:bundle.import_key, source_sheets:bundle.source_sheets, counts, source_type:'supplied_sample', content_sha256:createHash('sha256').update(JSON.stringify(bundle)).digest('hex') };
}
export async function applyBundle(client,bundle) {
  const report = inspectBundle(bundle);
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(7042027)');
    const previous = await client.query('SELECT content_sha256 FROM radar_imports WHERE import_key=$1',[report.import_key]);
    if (previous.rowCount) {
      if (previous.rows[0].content_sha256 !== report.content_sha256) throw new Error('Import key already exists with different contents; refusing to overwrite data');
      await client.query('COMMIT');return {...report,already_imported:true};
    }
    for (const table of Object.keys(primaryKeys)) for (const row of bundle.tables[table]) {
      const keys = Object.keys(row);
      // Identifiers come only from the fixed table list and checked schema.
      // Workbook text is always bound as a PostgreSQL parameter, never executed.
      await client.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row));
    }
    await client.query('INSERT INTO radar_imports(import_key,content_sha256,counts) VALUES ($1,$2,$3)',[report.import_key,report.content_sha256,report.counts]);
    await client.query('COMMIT');return {...report,already_imported:false};
  } catch (e) {await client.query('ROLLBACK');throw e;}
}
