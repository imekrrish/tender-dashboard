import {eligibilityEntries} from './tender-tables.js';
import {Router} from 'express';
import multer from 'multer';
import {uuid,invalid} from './validation.js';
import {seciUrl} from './seci-source.js';
import {reviewWorkbook,previewReview,previewExtraction,commitReview,findExistingTenders} from './seci-workflow.js';
import {catalogFields} from './bulk-upload.js';
const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
export function createSeciRouter(pool) {
  const router=Router();
  router.get('/status',(req,res)=>res.json({configured:!!process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL || 'gpt-4.1-mini'}));
  router.get('/jobs',run(async(req,res)=>res.json((await pool.query('SELECT id,source_url,tender_limit,status,progress,error,created_at,updated_at FROM radar_extraction_jobs ORDER BY created_at DESC LIMIT 20')).rows)));
  async function queueJob(url, limit, batch) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(7042028)');
      if (batch?.previousJobId) {
        const next = (await client.query(`SELECT * FROM radar_extraction_jobs
          WHERE result->'batch'->>'previousJobId'=$1 AND status<>'failed'
          ORDER BY created_at DESC LIMIT 1`, [batch.previousJobId])).rows[0];
        if (next) {await client.query('COMMIT');return next;}
      }
      const count = await client.query("SELECT count(*) AS total FROM radar_extraction_jobs WHERE status IN ('queued','running')");
      if (Number(count.rows[0].total) >= 3) invalid('Three extraction jobs are already queued or running. Wait for one to finish');
      const {rows} = await client.query('INSERT INTO radar_extraction_jobs(source_url,tender_limit,result) VALUES($1,$2,$3) RETURNING *',
        [url,limit,batch ? JSON.stringify({batch}) : null]);
      await client.query('COMMIT');
      return rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {client.release();}
  }

  router.post('/jobs',run(async(req,res)=>{
    if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'Set OPENAI_API_KEY on the backend before starting extraction'});
    const url=seciUrl(req.body.url),limit=req.body.limit??5;
    if(!Number.isInteger(limit) || limit<1 || limit>25) invalid('Select 1–25 tenders per extraction');
    if(!/^\/(tenders\/?$|tender-details\/)/.test(new URL(url).pathname)) invalid('Start from a tender listing or detail page');
    res.status(202).json(await queueJob(url,limit));
  }));
  router.post('/jobs/:id/next',run(async(req,res)=>{
    if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'Set OPENAI_API_KEY on the backend before starting extraction'});
    const id = uuid(req.params.id);
    const job = (await pool.query('SELECT * FROM radar_extraction_jobs WHERE id=$1',[id])).rows[0];
    const batch = job?.result?.batch;
    if (!batch || !['completed','partial','skipped'].includes(job.status)) invalid('Finish a listing batch before extracting the next one');
    const offset = batch.offset + job.tender_limit;
    if (offset >= batch.links.length) invalid('You have reached the end of this listing');
    res.status(202).json(await queueJob(job.source_url,job.tender_limit,{links:batch.links,offset,previousJobId:id}));
  }));
  router.get('/jobs/:id',run(async(req,res)=>{
    const job=(await pool.query('SELECT * FROM radar_extraction_jobs WHERE id=$1',[uuid(req.params.id)])).rows[0];
    if(!job) return res.status(404).json({error:'Extraction not found'});
    if (job.result?.tenders?.length) {
      const criteria = job.result.criteria ?? [];
      job.result.tenders = job.result.tenders.map(tender => ({
        ...tender, eligibility_entries:eligibilityEntries(tender.eligibility,
          criteria.filter(criterion => criterion.tender_id === tender.tender_id), tender.url),
      }));
    }
    res.json(job);
  }));
  function readDecisions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 25 ||
        Object.entries(value).some(([id, action]) => !/^SECI\d{6}$/.test(id) || !['replace','skip'].includes(action))) {
      invalid('Choose Replace or Skip for each duplicate SECI tender');
    }
    return value;
  }

  router.get('/existing/:id', run(async (req, res) => {
    const row = (await pool.query('SELECT * FROM tenders WHERE id=$1', [uuid(req.params.id)])).rows[0];
    if (!row) return res.status(404).json({error:'Tender not found'});
    res.json(row);
  }));
  router.post('/jobs/:id/duplicates', run(async (req, res) => {
    const id = uuid(req.params.id);
    const decisions = readDecisions(req.body.decisions);
    const job = (await pool.query('SELECT * FROM radar_extraction_jobs WHERE id=$1', [id])).rows[0];
    if (job?.status !== 'awaiting_review') invalid('This job is no longer waiting for duplicate decisions');
    const choices = {...job.result.choices};
    for (const duplicate of job.result.duplicates) {
      const action = decisions[duplicate.tender_id];
      if (!action) invalid(`Choose how to handle ${duplicate.tender_id}`);
      choices[duplicate.tender_id] = {action, id:duplicate.tn_tender_id};
    }
    const result = await pool.query(`UPDATE radar_extraction_jobs SET status='queued',progress='Waiting to resume',result=$2,updated_at=now()
      WHERE id=$1 AND status='awaiting_review' RETURNING *`, [id, JSON.stringify({...job.result, choices, duplicates:[]})]);
    if (!result.rowCount) invalid('This job has already resumed');
    res.json(result.rows[0]);
  }));
  router.get('/jobs/:id/:kind.xlsx',run(async(req,res)=>{
    if(!['tenders','technical','financial'].includes(req.params.kind)) invalid('Unknown workbook');
    const job=(await pool.query('SELECT * FROM radar_extraction_jobs WHERE id=$1',[uuid(req.params.id)])).rows[0];
    if(!job?.result || !['completed','partial'].includes(job.status)) invalid('Extraction is not ready');
    // Older jobs did not store an internal ID. Reuse the database ID if imported.
    const legacy = job.result.tenders.filter(t => !t.tn_tender_id);
    if (legacy.length) {
      const existing = await findExistingTenders(pool, legacy.map(t => t.tender_id));
      for (const tender of legacy) tender.tn_tender_id = existing.get(tender.tender_id)?.id;
    }
    res.setHeader('Content-Disposition',`attachment; filename="${req.params.kind === 'financial' ? 'other-eligibility' : req.params.kind}.xlsx"`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(reviewWorkbook(job,req.params.kind));
  }));
  async function loadCatalogs() {
    return Object.fromEntries(await Promise.all(Object.entries(catalogFields).map(async ([key,[table]]) => [
      key,(await pool.query(`SELECT * FROM ${table}`)).rows,
    ])));
  }
  router.post('/jobs/:id/import/preview',run(async(req,res)=>{
    const job = (await pool.query('SELECT * FROM radar_extraction_jobs WHERE id=$1',[uuid(req.params.id)])).rows[0];
    const decisions = readDecisions(req.body.decisions ?? {});
    res.json(await previewExtraction(pool,job,req.body.selection,await loadCatalogs(),decisions));
  }));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:3,fields:1,fieldSize:4096}}).fields([{name:'tenders',maxCount:1},{name:'technical',maxCount:1},{name:'financial',maxCount:1}]);
  router.post('/review/preview',upload,run(async(req,res)=>{
    const files={};
    for(const key of ['tenders','technical','financial']) {
      const file=req.files?.[key]?.[0];
      if(!file || !/\.xlsx$/i.test(file.originalname)) invalid('Upload all three .xlsx review files together');
      files[key]=file.buffer;
    }
    const catalogs=await loadCatalogs();
    let decisions = {};
    if (req.body.decisions) {
      try {decisions = JSON.parse(req.body.decisions);} catch {invalid('Invalid duplicate decisions');}
      readDecisions(decisions);
    }
    res.json(await previewReview(pool, files, catalogs, decisions));
  }));
  router.post('/review/:id/commit',run(async(req,res)=>{
    const id=uuid(req.params.id),client=await pool.connect();
    try{res.json(await commitReview(client,id));}finally{client.release();}
  }));
  return router;
}
