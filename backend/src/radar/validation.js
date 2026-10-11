import schema from './schema.json' with { type: 'json' };
export { schema };
export const statuses = ['Draft','Open','Under Pre-Bid','Under Evaluation','Financial Evaluation','Awarded','Retendered','Cancelled'];
const mounting = ['Fixed Tilt','Single-Axis Tracker','Dual-Axis Tracker','Pure Floater (HDPE)','Elevated Agri Structure','Ballasted Rooftop','Containerized BESS','N/A'];
export function invalid(message) { const e = new Error(message); e.status = 400; throw e; }
export function uuid(value) { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalid('Invalid record ID'); return value; }
export function validate(table, input, partial = false) {
  const fields = schema[table];
  if (!fields || !input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid record');
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    const field = fields[key];
    if (!field || field.generated) invalid(`Field ${key} cannot be written`);
    if (value === null) { if (field.required) invalid(`${key} is required`); out[key] = null; continue; }
    const type = field.type;
    if (type === 'UUID') uuid(value);
    else if (/NUMERIC|INT/.test(type)) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (type === 'INT' && !Number.isInteger(value))) invalid(`${key} must be a nonnegative number`); if (key.endsWith('_pct') && value > 100) invalid(`${key} must be at most 100`); }
    else if (type === 'BOOLEAN') { if (typeof value !== 'boolean') invalid(`${key} must be boolean`); }
    else if (typeof value !== 'string' || !value.trim()) invalid(`${key} must be nonempty text`);
    if (type.startsWith('VARCHAR') && value.length > Number(type.match(/\d+/)[0])) invalid(`${key} is too long`);
    if (/DATE|TIMESTAMPTZ/.test(type) && Number.isNaN(Date.parse(value))) invalid(`${key} must be a valid date`);
    if (type === 'tender_status_enum' && !statuses.includes(value)) invalid('Invalid tender status');
    if (type === 'mounting_tech_enum' && !mounting.includes(value)) invalid('Invalid mounting technology');
    if (key.endsWith('_url') || key === 'link_to_tender') { try { if (!['https:','http:'].includes(new URL(value).protocol)) invalid('URL must use HTTP(S)'); } catch { invalid(`${key} must be a valid HTTP(S) URL`); } }
    out[key] = value;
  }
  if (!partial) for (const [key, field] of Object.entries(fields)) if (field.required && !field.generated && out[key] == null) invalid(`${key} is required`);
  if (!Object.keys(out).length) invalid('No writable fields supplied');
  return out;
}
export function filterSql(filters = {}) {
  const values = [], clauses = ['t.current_status <> \'Draft\''];
  const add = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };
  const status = filters.status || 'Open';
  if (status !== 'All') { if (!statuses.includes(status)) invalid('Invalid status filter'); add('t.current_status = ?',status); }
  for (const [key,col] of Object.entries({product_id:'t.product_id',scope_id:'t.scope_id',country_id:'t.country_id',authority_id:'t.authority_id',region_id:'c.region_id'})) if (filters[key]) add(`${col} = ?`,uuid(filters[key]));
  if (filters.product_ids) {
    if (typeof filters.product_ids !== 'string' || filters.product_ids.length > 4000) invalid('Invalid product selection');
    const ids = [...new Set(filters.product_ids.split(',').map(uuid))];
    if (ids.length > 100) invalid('Too many product selections');
    values.push(...ids);
    clauses.push(`t.product_id IN (${ids.map((_,i)=>`$${values.length-ids.length+i+1}`).join(',')})`);
  }
  if (filters.search) { if (typeof filters.search !== 'string' || filters.search.length > 200) invalid('Invalid search'); add("concat_ws(' ',t.tender_id,t.ref_number,t.title) ILIKE ?",`%${filters.search.replace(/[\\%_]/g,'\\$&')}%`); }
  return { where: clauses.join(' AND '), values };
}
export function csvCell(value) { let s = value == null ? '' : String(value); if (/^[=+@\-\t\r]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"','""')}"`; }
