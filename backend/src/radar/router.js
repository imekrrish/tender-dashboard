import multer from 'multer';
import { catalogFields, parseWorkbook, insertTenders, templateWorkbook } from './bulk-upload.js';
import { Router } from 'express';
import { createAdminAuth } from './admin-auth.js';
import { pool, database } from '../db/pool.js';
import { schema, statuses, publicStatuses, statusSql, validate, uuid, invalid, filterSql, csvCell } from './validation.js';
export const resources = {
  regions: ['master_regions','region_id'], countries: ['master_countries','country_id'],
  products: ['master_product_segments','product_id'], scopes: ['master_contract_scopes','scope_id'],
  authorities: ['tendering_authorities','authority_id'], tenders: ['tenders','id'],
  eligibility: ['tender_eligibility','tender_id'], documents: ['tender_documents','doc_id'],
  corrigenda: ['tender_corrigenda','corrigendum_id'],
};
const router = Router();
const run = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
export const admin = createAdminAuth();
router.use(database);
router.get('/health',run(async (req,res) => {
  await pool.query('SELECT 1 FROM tenders LIMIT 1');
  res.json({status:'OK',source:'PostgreSQL'});
}));
router.get('/catalogs',run(async (req,res) => {
  const entries = await Promise.all(Object.entries(resources).slice(0,5).map(async ([key,[table]]) => [key,(await pool.query(`SELECT * FROM ${table} ORDER BY name`)).rows]));
  res.json({ ...Object.fromEntries(entries), statuses:publicStatuses });
}));
const joins = `FROM tenders t JOIN master_countries c ON c.country_id=t.country_id
 JOIN master_regions r ON r.region_id=c.region_id
 JOIN master_product_segments p ON p.product_id=t.product_id
 JOIN master_contract_scopes s ON s.scope_id=t.scope_id
 JOIN tendering_authorities a ON a.authority_id=t.authority_id
 LEFT JOIN tender_eligibility e ON e.tender_id=t.id`;
const tenderColumns = Object.keys(schema.tenders).filter(k=>k!=='current_status').map(k=>`t.${k}`).join(',') + `, ${statusSql} AS current_status`;
const columns = `${tenderColumns}, c.name AS country, r.name AS region, p.name AS product, p.code AS product_code,
 s.name AS scope, a.name AS authority, e.emd_currency,e.emd_amount,e.desired_turnover,
 e.min_installed_capacity_mw,e.technical_track_record_text,e.manufacturer,e.certifications,e.ld_clause`;
router.get('/tenders',run(async (req,res) => {
  const {where,values} = filterSql(req.query);
  const limit = Number(req.query.limit || 50), offset = Number(req.query.offset || 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) invalid('Invalid pagination');
  const [data, summary] = await Promise.all([
    pool.query(`SELECT ${columns} ${joins} WHERE ${where} ORDER BY t.tender_close_date,t.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,limit,offset]),
    pool.query(`SELECT count(*)::int AS total,
    count(*) FILTER (WHERE t.import_source = 'udaya-db-samples-2026-10-12')::int AS imported_samples,
    coalesce(sum(CASE WHEN p.code <> 'BESS' THEN t.total_capacity_mw ELSE 0 END),0) AS solar_mw,
    coalesce(sum(t.storage_capacity_mwh),0) AS storage_mwh,
    coalesce(sum(t.storage_capacity_mw),0) AS storage_mw,
    count(*) FILTER (WHERE (${statusSql}) = 'Open' AND t.tender_close_date >= now() AND t.tender_close_date < now()+interval '14 days')::int AS expiring
    ${joins} WHERE ${where}`,values)
  ]);
  res.json({data:data.rows,summary:summary.rows[0],limit,offset});
}));
router.get('/export.csv',run(async (req,res) => {
  const {where,values} = filterSql(req.query);
  const data = await pool.query(`SELECT ${columns} ${joins} WHERE ${where} ORDER BY t.tender_close_date,t.id`,values);
  const fields = ['tender_id','ref_number','title','region','country','product','total_capacity_mw','storage_capacity_mwh','current_status','scope','emd_currency','emd_amount','desired_turnover','min_installed_capacity_mw','tender_close_date','link_to_tender'];
  res.setHeader('Content-Disposition','attachment; filename="procurement-radar.csv"');
  res.type('text/csv').send('\ufeff'+[fields.map(csvCell).join(','),...data.rows.map(row=>fields.map(k=>csvCell(row[k] instanceof Date ? row[k].toISOString() : row[k])).join(','))].join('\r\n'));
}));
router.get('/tenders/:id',run(async (req,res) => {
  const id = uuid(req.params.id);
  const row = await pool.query(`SELECT ${columns} ${joins} WHERE t.id=$1 AND t.current_status <> 'Draft'`,[id]);
  if (!row.rowCount) return res.status(404).json({error:'Tender not found'});
  const [documents,corrigenda,eligibility] = await Promise.all(['tender_documents','tender_corrigenda','tender_eligibility'].map(table=>pool.query(`SELECT * FROM ${table} WHERE tender_id=$1`,[id])));
  res.json({...row.rows[0],documents:documents.rows,corrigenda:corrigenda.rows,eligibility:eligibility.rows[0] || null});
}));
router.use('/admin',admin);
const upload = multer({storage:multer.memoryStorage(), limits:{fileSize:5*1024*1024,files:1}});
async function uploadCatalogs() {
  const entries=await Promise.all(Object.entries(catalogFields).map(async ([key,[table]]) => [key,(await pool.query(`SELECT * FROM ${table}`)).rows]));
  return {...Object.fromEntries(entries),players:(await pool.query('SELECT * FROM market_players')).rows};
}
router.get('/admin/tenders/template.xlsx',run(async(req,res)=> {
  res.setHeader('Content-Disposition','attachment; filename="tenders-template.xlsx"');
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(templateWorkbook(await uploadCatalogs()));
}));
router.post('/admin/tenders/upload',upload.single('file'),run(async(req,res)=> {
  if (!req.file || !/\.xlsx?$/i.test(req.file.originalname)) invalid('Select an .xlsx or .xls workbook');
  const rows = parseWorkbook(req.file.buffer,await uploadCatalogs());
  const client = await pool.connect();
  try { await insertTenders(client,rows); } finally { client.release(); }
  res.status(201).json({imported:rows.length});
}));
router.get('/admin/schema',(req,res)=>res.json({resources,schema,statuses}));
const resource = req => { const entry = resources[req.params.resource]; if (!entry) invalid('Unknown resource'); return entry; };
router.get('/admin/:resource',run(async(req,res)=> {
  const [table] = resource(req);
  res.json((await pool.query(`SELECT ${table === 'tenders' ? tenderColumns : '*'} FROM ${table} t LIMIT 1000`)).rows);
}));
router.post('/admin/:resource',run(async(req,res)=> {
  const [table] = resource(req), data = validate(table,req.body);
  if (table === 'tenders') data.last_edited_by = 'admin';
  const keys = Object.keys(data);
  const result = await pool.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,Object.values(data));
  res.status(201).json(result.rows[0]);
}));
router.put('/admin/:resource/:id',run(async(req,res)=> {
  const [table,pk] = resource(req), id = uuid(req.params.id), data = validate(table,req.body,true);
  if (pk in data && data[pk] !== id) invalid('Primary key cannot be changed');
  delete data[pk];
  if (table === 'tenders') { data.last_edited_date = new Date(); data.last_edited_by = 'admin'; }
  const keys = Object.keys(data); if (!keys.length) invalid('No updates supplied');
  const result = await pool.query(`UPDATE ${table} SET ${keys.map((key,i)=>`${key}=$${i+1}`).join(',')} WHERE ${pk}=$${keys.length+1} RETURNING *`,[...Object.values(data),id]);
  if (!result.rowCount) return res.status(404).json({error:'Record not found'});
  res.json(result.rows[0]);
}));
router.delete('/admin/:resource/:id',run(async(req,res)=> {
  const [table,pk] = resource(req), id = uuid(req.params.id);
  const result = await pool.query(`DELETE FROM ${table} WHERE ${pk}=$1`,[id]);
  if (!result.rowCount) return res.status(404).json({error:'Record not found'});
  res.status(204).end();
}));
router.use((err,req,res,next)=> {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({error:'Workbook must be 5 MB or smaller'});
  if (err.name === 'MulterError') return res.status(400).json({error:'Upload exactly one workbook in the file field'});
  if (err.code === '23505') return res.status(409).json({error:'This identifier already exists'});
  if (err.code === '23503') return res.status(409).json({error:'Related record missing or entry is still in use'});
  if (['23502','23514','22P02','22007','22008','22003'].includes(err.code)) return res.status(400).json({error:'Invalid field value'});
  if (err.status) return res.status(err.status).json({error:err.message});
  console.error('Procurement query failed',err.code || err.name);
  res.status(503).json({error:'Procurement database unavailable. Check connection and migrations.'});
});
export default router;
