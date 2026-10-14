import XLSX from 'xlsx';
import {randomUUID} from 'node:crypto';
import {schema,validate,invalid,statuses} from './validation.js';
import format from './workbook-format.json' with {type:'json'};
export {format};
const normalize=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,' ');
const blank=v=>v==null || v==='';
const catalogKeys={country_id:['country_id','iso_code'],product_id:['product_id','code'],scope_id:['scope_id','code'],authority_id:['authority_id','code']};
const aliases={product_id:{'solar + bess':'HYBRID'},scope_id:{'tariff-based (tbcb)':'TBCB'}};
const fields={
 Tenders_Master:['@serial','tender_id','ref_number','title','authority_id','scope_id','product_id','@status','tender_open_date','tender_close_date','total_capacity_mw','storage_capacity_mwh','pv_type','module_tech','module_eff_pct','mounting_tech','storage_tech','country_id','state','city','postal_code','site_address','latitude','longitude','interconnection','substation_voltage_kv','almm_compliance_required','dcr_mandatory','link_to_tender','analysis_tags','remarks','@entry','@editor'],
 Eligibility:['@tender','emd_currency','emd_amount','emd_mode','desired_turnover','net_worth_requirement','working_capital_requirement','@value','@pbg','tender_document_fee','manufacturer','min_manf_capacity_mw','certifications','technical_track_record_text','ld_clause','ld_cap_pct','no_of_partners_allowed'],
 Documents:['@tender','document_title','doc_type','@format','@portal','document_bucket_url','@corrigendum','@published'],
 Auction_BI:['@tender','auction_completed_date','total_capacity_auctioned_mw','total_bids_received_mw','oversubscription_ratio','tariff_ceiling_rate','min_winning_tariff','@developer','allocated_capacity_mw','allocated_storage_mwh','winning_tariff','@epc','ppa_signed','scheduled_cod_date'],
};
function convert(table,key,value,catalogs,cellFormat) {
 const type=schema[table][key].type;
 if(blank(value))return undefined;
 if(catalogKeys[key]) {
  const [pk,code]=catalogKeys[key],wanted=aliases[key]?.[normalize(value)]??value;
  const matches=(catalogs[key]||[]).filter(r=>[r[pk],r[code],r.name].some(v=>normalize(v)===normalize(wanted)));
  if(matches.length!==1)invalid(`${key}: no unique matching catalog name or code for "${value}"`);
  return matches[0][pk];
 }
 if(/NUMERIC|INT/.test(type)) {
  if(normalize(value)==='n/a')return undefined;
  let n=Number(String(value).replaceAll(',','').replace(/x$/i,''));
  if(key.endsWith('_pct')) {if(typeof value==='string'&&value.trim().endsWith('%'))n=Number(value.trim().slice(0,-1));else if(cellFormat?.includes('%'))n*=100;}
  return n;
 }
 if(type==='BOOLEAN') {const v=normalize(value);if(!['yes','no','true','false'].includes(v))invalid(`${key} must be Yes/No`);return ['yes','true'].includes(v);}
 if(type==='TEXT[]')return String(value).split(';').map(v=>v.trim()).filter(Boolean);
 if(/DATE|TIMESTAMPTZ/.test(type)) {
  if(value instanceof Date)return type==='DATE'?value.toISOString().slice(0,10):value.toISOString();
  const v=String(value).trim();if(!/^\d{4}-\d{2}-\d{2}(T|$| )/.test(v))invalid(`${key}: use an Excel date or ISO date`);return v;
 }
 if(key==='mounting_tech'&&value==='Fixed Ballasted')return 'Ballasted Rooftop';
 return String(value).trim();
}
function rawRecord(headers,cells) {return Object.fromEntries(headers.map((h,i)=>[h,cells[i] instanceof Date?cells[i].toISOString():cells[i]??null]));}
export function parseReferenceSheet(sheet,catalogs) {
 if(sheet['!ref']&&XLSX.utils.decode_range(sheet['!ref']).e.r>10000)invalid('Workbook section layout exceeds 10,000 rows');
 const grid=XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,blankrows:true});
 const sections=Object.fromEntries(format.map(f=>[f.title,[]]));
 let section=null,header=false;const seen=new Set();
 grid.forEach((cells,index)=> {
  if(cells.every(blank))return;
  const marker=format.find(f=>cells[0]===f.title&&cells.slice(1).every(blank));
  if(marker){if(seen.has(marker.title))invalid(`Duplicate section ${marker.title}`);seen.add(marker.title);section=marker;header=true;return;}
  if(!section)invalid(`Row ${index+1}: expected a section title`);
  if(header){if(section.headers.some((h,i)=>cells[i]!==h)||cells.slice(section.headers.length).some(v=>!blank(v)))invalid(`Row ${index+1}: keep the original ${section.title} headers and order`);header=false;return;}
  if(cells.slice(section.headers.length).some(v=>!blank(v)))invalid(`Row ${index+1}: data outside ${section.title} columns`);
  sections[section.title].push({cells,formats:cells.map((_,i)=>sheet[XLSX.utils.encode_cell({r:index,c:i})]?.z),row:index+1,source:rawRecord(section.headers,cells)});
 });
 if(header)invalid(`Missing headers for ${section.title}`);
 for(const f of format)if(!seen.has(f.title))invalid(`Missing section ${f.title}`);
 if(!sections.Tenders_Master.length)invalid('Workbook contains no tenders');
 if(sections.Tenders_Master.length>1000)invalid('Upload at most 1,000 tenders');
 const tenders=[],byRef=new Map(),errors=[],related={market_players:[],tender_eligibility:[],tender_documents:[],tender_auction_meta:[],tender_bid_results:[]};
 const parse=(section,table,item)=> {
  const data={};fields[section].forEach((key,i)=>{if(key.startsWith('@'))return;const value=convert(table,key,item.cells[i],catalogs,item.formats[i]);if(value!==undefined)data[key]=value;});return data;
 };
 const attempt=(item,fn)=>{try{fn();}catch(e){errors.push(`DB_Samples_rows row ${item.row}: ${e.message}`);}};
 for(const item of sections.Tenders_Master)attempt(item,()=>{
  const data=parse('Tenders_Master','tenders',item),status=item.cells[7];
  if(status==='Draft')data.current_status='Draft';else if(statuses.includes(status))data.current_status=status;
  const row=validate('tenders',data);if(byRef.has(row.tender_id))invalid('Duplicate Tender ID');
  row.id=randomUUID();row.source_data=item.source;byRef.set(row.tender_id,row.id);tenders.push(row);
 });
 const parent=item=>{const id=byRef.get(String(item.cells[0]??'').trim());if(!id)invalid('Tender ID must exist in Tenders_Master in this upload');return id;};
 const eligibilitySeen=new Set();
 for(const item of sections.Eligibility)attempt(item,()=>{
  const data=parse('Eligibility','tender_eligibility',item);data.tender_id=parent(item);
  if(eligibilitySeen.has(data.tender_id))invalid('Duplicate eligibility for Tender ID');eligibilitySeen.add(data.tender_id);
  for(const [index,numeric,terms] of [[7,'estimated_project_value','estimated_project_value_terms'],[8,'performance_bg_pct','performance_bg_terms']]) {
   const value=item.cells[index];if(blank(value))continue;
   const number=Number(String(value).replaceAll(',','').replace(/%$/,''));
   if(Number.isFinite(number))data[numeric]=numeric.endsWith('_pct')&&item.formats[index]?.includes('%')&&typeof value==='number'?number*100:number;
   else data[terms]=String(value);
  }
  related.tender_eligibility.push({...validate('tender_eligibility',data),source_data:item.source});
 });
 for(const item of sections.Documents)attempt(item,()=>{
  const data=parse('Documents','tender_documents',item);data.tender_id=parent(item);
  // Portal landing URL can serve as a document link when no direct file link was supplied.
  if(!data.document_bucket_url&&!blank(item.cells[4]))data.document_bucket_url=String(item.cells[4]);
  related.tender_documents.push({...validate('tender_documents',data),source_data:item.source});
 });
 const players=[...(catalogs.players||[])];
 const player=(name,type)=> {
  if(blank(name))invalid(`Missing ${type} name`);
  const label=String(name).trim(),lookup=label==='Tata Power Solar (In-house)'?'Tata Power Solar Systems':label;
  const matches=players.filter(p=>normalize(p.name)===normalize(lookup));if(matches.length>1)invalid(`Ambiguous market player ${name}`);
  if(matches.length)return matches[0].player_id;
  const data={...validate('market_players',{name:label,company_type:type}),player_id:randomUUID()};players.push(data);related.market_players.push(data);return data.player_id;
 };
 const auctions=new Map();
 for(const item of sections.Auction_BI)attempt(item,()=>{
  const tender_id=parent(item),meta={tender_id},result={tender_id};
  fields.Auction_BI.forEach((key,i)=>{
   if(key.startsWith('@'))return;
   const table=schema.tender_auction_meta[key]?'tender_auction_meta':'tender_bid_results';
   const value=convert(table,key,item.cells[i],catalogs,item.formats[i]);if(value!==undefined)(table==='tender_auction_meta'?meta:result)[key]=value;
  });
  const validMeta=validate('tender_auction_meta',meta);
  if(auctions.has(tender_id)&&JSON.stringify(auctions.get(tender_id))!==JSON.stringify(validMeta))invalid('Inconsistent auction totals for Tender ID');
  if(!auctions.has(tender_id)){auctions.set(tender_id,validMeta);related.tender_auction_meta.push(validMeta);}
  result.bidder_id=player(item.cells[7],'Developer / IPP');if(!blank(item.cells[11]))result.epc_contractor_id=player(item.cells[11],'EPC Contractor');
  result.quoted_capacity_mw=result.allocated_capacity_mw;result.quoted_tariff=result.winning_tariff;result.is_winner=true;
  related.tender_bid_results.push(validate('tender_bid_results',result));
 });
 if(errors.length)invalid(errors.slice(0,20).join('\n'));
 tenders.related=related;return tenders;
}
export function appendReferenceSheets(workbook) {
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
 ['-- DB_Samples_SQL'],['-- Reference only. Excel uploads never execute SQL.'],
 ['-- Enter records in DB_Samples_rows using the original section titles and headers.']
 ]),'DB_Samples_SQL');
 const grid=Array.from({length:36},()=>[]);
 for(const f of format){grid[f.titleRow-1]=[f.title];grid[f.headerRow-1]=f.headers;}
 const sheet=XLSX.utils.aoa_to_sheet(grid);sheet['!cols']=format[0].headers.map((h,i)=>({wch:i===3?65:Math.min(38,Math.max(18,h.length+2))}));
 sheet['!merges']=format.map(f=>({s:{r:f.titleRow-1,c:0},e:{r:f.titleRow-1,c:f.headers.length-1}}));
 for(const f of format)for(let r=f.headerRow;r<f.endRow;r++)for(let c=0;c<f.headers.length;c++) {
  const title=f.headers[c];let z;
  if(title.includes('Date'))z=title==='Tender Close Date'?'yyyy-mm-dd hh:mm':'yyyy-mm-dd';
  if(f.title==='Eligibility'&&['Performance BG (PBG %)','LD Cap (%)'].includes(title))z='0.00%';
  if(z)sheet[XLSX.utils.encode_cell({r,c})]={t:'z',z};
 }
 XLSX.utils.book_append_sheet(workbook,sheet,'DB_Samples_rows');
}
