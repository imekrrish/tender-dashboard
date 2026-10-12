import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveFrontend } from '../frontend.js';

test('combined hosting serves SPA, preserves API errors and caches assets correctly', async () => {
  const directory = await mkdtemp(path.join(tmpdir(),'radar-static-'));
  await mkdir(path.join(directory,'assets'));
  await writeFile(path.join(directory,'index.html'),'<html><body>radar shell</body></html>');
  await writeFile(path.join(directory,'assets','app-test.js'),'console.log("loaded")');
  const app = express();
  app.get('/api/health',(req,res)=>res.json({status:'OK'}));
  serveFrontend(app,directory);
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const url of ['/','/tenders/example']) {
      const r = await fetch(origin+url,{headers:{Accept:'text/html'}});
      assert.equal(r.status,200);assert.match(await r.text(),/radar shell/);
      assert.equal(r.headers.get('cache-control'),'no-cache');
    }
    const api = await fetch(origin+'/api/health');assert.deepEqual(await api.json(),{status:'OK'});
    const miss = await fetch(origin+'/api/unknown',{headers:{Accept:'text/html'}});
    assert.equal(miss.status,404);assert.deepEqual(await miss.json(),{error:'API endpoint not found'});
    const asset = await fetch(origin+'/assets/app-test.js');assert.equal(asset.status,200);
    assert.match(asset.headers.get('cache-control'),/immutable/);
    assert.equal((await fetch(origin+'/assets/missing.js')).status,404);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await rm(directory,{recursive:true,force:true});
  }
});
