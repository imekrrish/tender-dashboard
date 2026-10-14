import XLSX from 'xlsx';
import { schema, validate, invalid } from './validation.js';

export const catalogFields = {
  country_id: ['master_countries', 'country_id', 'iso_code'],
  product_id: ['master_product_segments', 'product_id', 'code'],
  scope_id: ['master_contract_scopes', 'scope_id', 'code'],
  authority_id: ['tendering_authorities', 'authority_id', 'code'],
};
export const uploadFields = Object.keys(schema.tenders).filter(k => !schema.tenders[k].generated && k !== 'current_status');
const normalize = value => String(value).trim().toLowerCase().replace(/\s+/g, '_');
export function parseWorkbook(buffer, catalogs) {
  let workbook;
  try { workbook = XLSX.read(buffer, {type:'buffer', cellDates:true}); } catch { invalid('Cannot read this Excel workbook'); }
  const sheet = workbook.Sheets.Tenders || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || sheet['!ref'] && XLSX.utils.decode_range(sheet['!ref']).e.r > 1000) invalid('Upload at most 1,000 tenders per workbook');
  const grid = XLSX.utils.sheet_to_json(sheet, {header:1, defval:null, blankrows:true});
  const headers = (grid.shift() || []).map(v => v == null ? '' : normalize(v));
  if (headers.some(h => !uploadFields.includes(h)) || new Set(headers).size !== headers.length) invalid('Use the template headers; unknown or duplicate columns were found');
  const errors = [], rows = [], ids = new Set();
  grid.forEach((cells, index) => {
    if (cells.every(v => v == null || v === '')) return;
    try {
      if (cells.slice(headers.length).some(v => v != null && v !== '')) invalid('Data found outside template columns');
      const data = {};
      headers.forEach((key, i) => {
        let value = cells[i];
        if (value == null || value === '') return;
        const field = schema.tenders[key];
        if (value instanceof Date) value = field.type === 'DATE' ? value.toISOString().slice(0,10) : value.toISOString();
        if (catalogFields[key]) {
          const [, pk, code] = catalogFields[key];
          const candidates = (catalogs[key] || []).filter(r => [r[pk], r[code], r.name].some(v => v != null && normalize(v) === normalize(value)));
          if (candidates.length !== 1) invalid(`${key}: use a unique existing code from the reference sheets`);
          value = candidates[0][pk];
        } else if (/NUMERIC|INT/.test(field.type)) value = Number(String(value).replaceAll(',',''));
        else if (field.type === 'BOOLEAN') {
          if (!['true','false'].includes(String(value).toLowerCase())) invalid(`${key} must be true or false`);
          value = String(value).toLowerCase() === 'true';
        } else if (field.type === 'TEXT[]') value = String(value).split(';').map(v => v.trim()).filter(Boolean);
        else value = String(value).trim();
        if (/DATE|TIMESTAMPTZ/.test(field.type) && !/^\d{4}-\d{2}-\d{2}(T|$| )/.test(value)) invalid(`${key}: use an Excel date or YYYY-MM-DD date`);
        data[key] = value;
      });
      const row = validate('tenders', data);
      if (ids.has(row.tender_id)) invalid('Duplicate tender_id in workbook');
      ids.add(row.tender_id); rows.push(row);
    } catch (e) { errors.push(`Row ${index + 2}: ${e.message}`); }
  });
  if (errors.length) invalid(errors.slice(0,20).join('\n'));
  if (!rows.length) invalid('Workbook contains no tenders');
  return rows;
}
export async function insertTenders(client, rows) {
  await client.query('BEGIN');
  try {
    for (const row of rows) {
      const data = {...row, last_edited_by:'admin-excel'};
      const keys = Object.keys(data);
      await client.query(`INSERT INTO tenders (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')})`, Object.values(data));
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
}
export function templateWorkbook(catalogs) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([uploadFields]), 'Tenders');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Instructions'], ['Fill the Tenders sheet, one tender per row; keep all column headers.'],
    ['Required: '+uploadFields.filter(k=>schema.tenders[k].required).join(', ')],
    ['Use existing catalog codes from reference sheets for country_id, product_id, scope_id, authority_id.'],
    ['Dates: Excel dates or YYYY-MM-DD; timestamps may include a timezone, e.g. 2026-10-30T12:00:00Z.'],
    ['Open and Under Pre-Bid tenders become Under Evaluation after their closing timestamp passes. Use timezone-qualified timestamps.'],
    ['Maximum 1,000 rows. Any invalid or duplicate record cancels the whole upload; existing tenders are never overwritten.'],
    ['Separate tags with semicolons. Boolean fields use true or false.']
  ]), 'Instructions');
  for (const [key,[,pk,code]] of Object.entries(catalogFields)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((catalogs[key] || []).map(r=>({code:r[code],name:r.name,id:r[pk]}))), key);
  }
  return XLSX.write(workbook, {type:'buffer',bookType:'xlsx'});
}
