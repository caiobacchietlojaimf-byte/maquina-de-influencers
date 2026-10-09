import assert from 'node:assert/strict';
import {createHash,createPublicKey,generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(file,mocks={},extra={}) {const module={exports:{}};const code=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:id=>id==='server-only'?{}:id in mocks?mocks[id]:require(id),Buffer,Headers,Request,Response,URL,AbortSignal,console,setTimeout,clearTimeout,...extra});return module.exports;}
const videoId='cfb6901d-cd77-4866-83ba-ad8759ed565f',requestId='provider-existing-1';
function fixture() {
 const pair=generateKeyPairSync('ed25519');let keyReads=0,reads=0;const tasks=[],reconciled=[];
 const verifier=load('src/lib/fal-webhook.ts',{}, {fetch:async(url,init)=>{keyReads++;assert.equal(url,'https://rest.fal.ai/.well-known/jwks.json');assert.equal(init.redirect,'error');assert.equal(init.headers,undefined);return Response.json({keys:[pair.publicKey.export({format:'jwk'})]});}});
 let video={id:videoId,userId:'owner',status:'processing',createdAt:Date.now()-30000,requestId,edit:{provider:'fal',model:'fal-ai/wan/v2.2-14b/animate/replace',sourceUrl:'https://trusted.example/original.mp4',segments:[{requestId}]}};
 const route=load('src/app/api/fal/webhook/[videoId]/route.ts',{'next/server':{after:task=>tasks.push(task)},'@/lib/db':{getVideoById:async id=>{reads++;assert.equal(id,videoId);return structuredClone(video);}},'@/lib/fal-webhook':verifier,'@/lib/reconcile-fal-video':{reconcileFalVideo:async(v,force)=>reconciled.push({v,force})}});
 function request(payload={request_id:requestId,gateway_request_id:requestId,status:'OK',payload:{video:{url:'http://127.0.0.1/never-follow-this'}}},options={}) {
  const timestamp=String(Math.floor(Date.now()/1000)+(options.age??0)); const body=Buffer.from(JSON.stringify(payload));
  const headers=new Headers({'content-type':'application/json','x-fal-webhook-request-id':payload.gateway_request_id??payload.request_id,'x-fal-webhook-user-id':'fal-owner','x-fal-webhook-timestamp':timestamp});
  const message=Buffer.from([headers.get('x-fal-webhook-request-id'),'fal-owner',timestamp,createHash('sha256').update(body).digest('hex')].join('\n'));
  headers.set('x-fal-webhook-signature',sign(null,message,pair.privateKey).toString('hex'));
  if(options.bad) headers.set('x-fal-webhook-signature','00'.repeat(64));
  return new Request('https://app.example/api/fal/webhook/'+videoId,{method:'POST',headers,body:options.tamper?Buffer.from('{}'):body});
 }
 return {verifier,route,request,tasks,reconciled,setVideo:v=>{video=v;},get video(){return video;},get reads(){return reads;},get keyReads(){return keyReads;}};
}
test('valid fal callback schedules only a GET reconciliation of the persisted job and ignores payload URLs',async()=>{const f=fixture();const response=await f.route.POST(f.request(),{params:Promise.resolve({videoId})});assert.equal(response.status,204);assert.equal(f.tasks.length,1);await f.tasks[0]();assert.equal(f.reconciled.length,1);assert.equal(f.reconciled[0].v.edit.sourceUrl,'https://trusted.example/original.mp4');assert.equal(f.reconciled[0].force,true);assert.equal(f.keyReads,1);});
test('invalid signature, tampered body and expired/future replay never read the database or schedule processing',async()=>{for(const options of [{bad:true},{tamper:true},{age:-301},{age:301}]){const f=fixture();const response=await f.route.POST(f.request(undefined,options),{params:Promise.resolve({videoId})});assert.equal(response.status,401);assert.equal(f.reads,0);assert.equal(f.tasks.length,0);}});
test('callbacks must belong to a stored request; queued writes return retryable503; completed duplicates are acknowledged without work',async()=>{
 const f=fixture();const other=f.request({request_id:'unrelated',status:'OK'});assert.equal((await f.route.POST(other,{params:Promise.resolve({videoId})})).status,400);assert.equal(f.tasks.length,0);
 f.setVideo({...f.video,status:'queued'});assert.equal((await f.route.POST(f.request(),{params:Promise.resolve({videoId})})).status,503);assert.equal(f.tasks.length,0);
 f.setVideo({...f.video,status:'completed'});for(let i=0;i<2;i++)assert.equal((await f.route.POST(f.request(),{params:Promise.resolve({videoId})})).status,204);assert.equal(f.tasks.length,0);
});
test('a signed retry gateway ID may differ while the queue request ID must remain owned by this job',async()=>{const f=fixture();const response=await f.route.POST(f.request({request_id:requestId,gateway_request_id:'retry-gateway-2',status:'OK'}),{params:Promise.resolve({videoId})});assert.equal(response.status,204);await f.tasks[0]();assert.equal(f.reconciled[0].v.requestId,requestId);});

test('an unfinished anonymous callback body times out before key or database work',async()=>{
 let canceled=false;
 const forbidden=()=>assert.fail('Must not authenticate, read jobs, or schedule work before receiving the body');
 const route=load('src/app/api/fal/webhook/[videoId]/route.ts',{'next/server':{after:forbidden},'@/lib/db':{getVideoById:forbidden},'@/lib/fal-webhook':{verifyFalWebhook:forbidden},'@/lib/reconcile-fal-video':{reconcileFalVideo:forbidden}},{setTimeout:(fn,ms)=>{assert.equal(ms,10000);return setTimeout(fn,5);}});
 const body=new ReadableStream({cancel(){canceled=true;}});
 const request=new Request('https://app.example/api/fal/webhook/'+videoId,{method:'POST',headers:{'content-type':'application/json'},body,duplex:'half'});
 assert.equal((await route.POST(request,{params:Promise.resolve({videoId})})).status,408);
 assert.equal(canceled,true);
});
