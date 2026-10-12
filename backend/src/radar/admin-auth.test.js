import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminAuth} from './admin-auth.js';
test('admin accepts configured four-digit PIN and limits repeated failed attempts',()=> {
 const old=process.env.ADMIN_API_KEY;process.env.ADMIN_API_KEY='1234';let time=0;const auth=createAdminAuth({now:()=>time});
 const attempt=pin=>{const result={status:200,next:false};const res={status:code=>{result.status=code;return res;},json:body=>{result.body=body;return res;},setHeader:()=>{}};auth({ip:'test',headers:{authorization:`Bearer ${pin}`}},res,()=>{result.next=true;});return result;};
 try {
  assert.equal(attempt('1234').next,true);
  for(let i=0;i<5;i++)assert.equal(attempt('0000').status,401);
  assert.equal(attempt('0000').status,429);time=300001;assert.equal(attempt('1234').next,true);
 }finally{if(old===undefined)delete process.env.ADMIN_API_KEY;else process.env.ADMIN_API_KEY=old;}
});
