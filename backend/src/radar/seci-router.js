import {Router} from 'express';
import multer from 'multer';
import {uuid,invalid} from './validation.js';
import {seciUrl} from './seci-source.js';
import {reviewWorkbook,previewReview,commitReview} from './seci-workflow.js';
import {catalogFields} from './bulk-upload.js';
const run=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
export function createSeciRouter(pool) {
  const router=Router();
  router.get('/status',(req,res)=>res.json({configured:!!process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL || 'gpt-4.1-mini'}));
  router.get('/jobs',run(async(req,res)=>res.json((await pool.query('SELECT id,source_url,tender_limit,status,progress,error,created_at,updated_at FROM radar_extraction_jobs ORDER BY created_at DESC LIMIT 20')).rows)));
  router.post('/jobs',run(async(req,res)=>{
    if(!process.env.OPENAI_API_KEY) return res.status(503).json({error:'Set OPENAI_API_KEY on the backend before starting extraction'});
    const url=seciUrl(req.body.url),limit=req.body.limit??5;
    if(!Number.isInteger(limit) || limit<1 || limit>25) invalid('Select 1–25 tenders per extraction');
    if(!/^\/(tenders\/?$|tender-details\/)/.test(new URL(url).pathname)) invalid('Start from a tender listing or detail page');
    const client=await pool.connect();
    try {
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7042028)');
      if(Number((await client.query("SELECT count(*) AS total FROM radar_extraction_jobs WHERE status IN ('queued','running')")).rows[0].total)>=3) invalid('Three extraction jobs are already queued or running. Wait for one to finish');
      const row=(await client.query('INSERT INTO radar_extraction_jobs(source_url,tender_limit) VALUES($1,$2) RETURNING *',[url,limit])).rows[0];
      await client.query('COMMIT');res.status(202).json(row);
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }));
  router.get('/jobs/:id',run(async(req,res)=>{
    const job=(await pool.query('SELECT * FROM radar_extraction_jobs WHERE id=$1',[uuid(req.params.id)])).rows[0];
    if(!job) return res.status(404).json({error:'Extraction not found'});
    res.json(job);
  }));
  router.get('/jobs/:id/:kind.xlsx',run(async(req,res)=>{
    if(!['tenders','technical','financial'].includes(req.params.kind)) invalid('Unknown workbook');
    const job=(await pool.query('SELECT * FROM radar_extraction_jobs WHERE id=$1',[uuid(req.params.id)])).rows[0];
    if(!job?.result || !['completed','partial'].includes(job.status)) invalid('Extraction is not ready');
    res.setHeader('Content-Disposition',`attachment; filename="${req.params.kind}-review.xlsx"`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(reviewWorkbook(job,req.params.kind));
  }));
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:3,fields:0}}).fields([{name:'tenders',maxCount:1},{name:'technical',maxCount:1},{name:'financial',maxCount:1}]);
  router.post('/review/preview',upload,run(async(req,res)=>{
    const files={};
    for(const key of ['tenders','technical','financial']) {
      const file=req.files?.[key]?.[0];
      if(!file || !/\.xlsx$/i.test(file.originalname)) invalid('Upload all three .xlsx review files together');
      files[key]=file.buffer;
    }
    const catalogs=Object.fromEntries(await Promise.all(Object.entries(catalogFields).map(async([key,[table]])=>[key,(await pool.query(`SELECT * FROM ${table}`)).rows])));
    res.json(await previewReview(pool,files,catalogs));
  }));
  router.post('/review/:id/commit',run(async(req,res)=>{
    const id=uuid(req.params.id),client=await pool.connect();
    try{res.json(await commitReview(client,id));}finally{client.release();}
  }));
  return router;
}
