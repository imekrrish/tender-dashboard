import XLSX from 'xlsx';
import {createHash, randomUUID} from 'node:crypto';
import {format, fields, convert, rawRecord} from './reference-workbook.js';
import {validate, invalid, statuses} from './validation.js';

const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const blank = value => value == null || value === '';
const catalogTypes = {
  product_id: ['master_product_segments', 'product_id', 'code'],
  scope_id: ['master_contract_scopes', 'scope_id', 'code'],
  authority_id: ['tendering_authorities', 'authority_id', 'code'],
};

// This source uses IST wall-clock Excel timestamps; ISO strings with an
// explicit offset are already absolute instants and must not be shifted.
function istTimestamp(value) {
  if (value instanceof Date) return new Date(Math.round(value.getTime() / 1000) * 1000 - 330 * 60000).toISOString();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(value.trim())) {
    const text = value.trim().replace(' ', 'T');
    return (text.length === 10 ? text + 'T00:00:00' : text) + '+05:30';
  }
  return value;
}

export function parseSeciSheet(sheet, catalogs) {
  if (sheet['!ref'] && XLSX.utils.decode_range(sheet['!ref']).e.r > 1000) invalid('Upload at most 1,000 tenders per workbook');
  const grid = XLSX.utils.sheet_to_json(sheet, {header:1, defval:null, blankrows:true});
  const headers = grid.shift() || [];
  if (format[0].headers.some((h, i) => headers[i] !== h) || headers.slice(format[0].headers.length).some(v => !blank(v))) {
    invalid('SECI Tenders: keep the original headers and column order');
  }
  // Never mutate the caller's catalogs while validating a workbook. New
  // catalog entries are inserted with the tenders in the same transaction.
  const resolved = Object.fromEntries(Object.entries(catalogs).map(([key, rows]) => [key, [...rows]]));
  const pending = [], rows = [], errors = [], ids = new Set();
  const resolveCatalog = (key, value) => {
    const [table, pk, code] = catalogTypes[key];
    const matches = (resolved[key] || []).filter(row => [row[pk], row[code], row.name].some(v => normalize(v) === normalize(value)));
    // SECI's published legal name is also commonly registered by its acronym.
    if (!matches.length && key === 'authority_id' && normalize(value) === 'solar energy corporation of india limited (seci)') {
      matches.push(...(resolved[key] || []).filter(row => normalize(row.code) === 'seci'));
    }
    if (!matches.length && key === 'product_id' && normalize(value) === 'standalone bess') {
      matches.push(...(resolved[key] || []).filter(row => normalize(row.code) === 'bess'));
    }
    if (matches.length > 1) invalid(`${key}: ambiguous catalog name or code for "${value}"`);
    if (matches.length) return matches[0][pk];
    const name = String(value).trim();
    const data = validate(table, {name, [code]:'SECI_' + createHash('sha256').update(normalize(name)).digest('hex').slice(0, 24)});
    data[pk] = randomUUID();
    (resolved[key] ||= []).push(data);
    pending.push({table, pk, data});
    return data[pk];
  };
  grid.forEach((cells, index) => {
    if (cells.every(blank)) return;
    try {
      if (cells.slice(headers.length).some(v => !blank(v))) invalid('Data found outside template columns');
      const data = {};
      fields.Tenders_Master.forEach((key, i) => {
        if (key.startsWith('@') || blank(cells[i])) return;
        let value = cells[i];
        if (catalogTypes[key]) data[key] = resolveCatalog(key, value);
        else {
          if (key === 'tender_close_date') value = istTimestamp(value);
          const converted = convert('tenders', key, value, resolved, sheet[XLSX.utils.encode_cell({r:index + 1, c:i})]?.z);
          if (converted !== undefined) data[key] = converted;
        }
      });
      if (statuses.includes(cells[7])) data.current_status = cells[7];
      // Unknown capacity, state and PV type remain NULL, never fabricated.
      // Blank compliance flags must not acquire the database's Yes/No defaults.
      for (const key of ['state','total_capacity_mw','pv_type','almm_compliance_required','dcr_mandatory','interconnection']) {
        if (!(key in data)) data[key] = null;
      }
      const row = validate('tenders', data);
      if (ids.has(row.tender_id)) invalid('Duplicate Tender ID in workbook');
      ids.add(row.tender_id);
      rows.push({...row, source_data:rawRecord(headers, cells), import_source:'seci-tenders'});
    } catch (error) { errors.push(`SECI Tenders row ${index + 2}: ${error.message}`); }
  });
  if (errors.length) invalid(errors.slice(0, 20).join('\n'));
  if (!rows.length) invalid('Workbook contains no tenders');
  rows.catalogs = pending;
  return rows;
}
