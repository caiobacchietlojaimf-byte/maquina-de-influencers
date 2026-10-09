import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
function loader({env = {}, mocks = {}, fetch = () => { throw new Error('Unexpected network'); }} = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = id => {
      if (id === 'server-only') return {};
      if (id in mocks) return mocks[id];
      if (id.startsWith('@/') || id.startsWith('.')) {
        const target = id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : path.resolve(path.dirname(file), id);
        if (target.endsWith('.json')) return JSON.parse(readFileSync(target, 'utf8'));
        return load(`${target}.ts`);
      }
      return require(id);
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, process: {env, cwd:()=>root}, console, Buffer, URL, AbortSignal, fetch });
    return module.exports;
  }
  return load;
}
const requestKey = 'b8a3d7c7-2046-4692-9f80-4167a97a9a71';
const input = { requestKey, name:'  Julia  ', tier:'normal', selection:{ gender:['female'], hair:['hair_long'] } };
const png = `data:image/png;base64,${Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(32)]).toString('base64')}`;
const configured = {HF_API_KEY:'test-key:test-secret',HF_API_BASE_URL:'https://api.higgsfield.ai',BLOB_READ_WRITE_TOKEN:'test-token'};
async function fixture(options={}) {
  const dir=mkdtempSync(path.join(tmpdir(),'mi-influencer-generation-'));
  let user;
  const requests=[], uploads=[];
  let status={status:'completed',images:[{url:'https://cdn.example.com/generated.png'}]};
  const load=loader({env:{...configured, DATA_DIR:dir,...options.env},mocks:{
    'next/cache':{revalidatePath(){}}, '@/lib/auth':{requireUser:async()=>user},
    '@vercel/blob':{put:async(name,bytes,opts)=>{uploads.push({name,bytes,opts});return{url:`https://store.public.blob.vercel-storage.com/${name}`};}},
  },fetch:async(url,init)=>{
    requests.push({url,init});
    if(init.method==='POST') {
      if(options.post) return options.post(url,init);
      return Response.json({request_id:'real-provider-request'});
    }
    return Response.json(status);
  }});
  const db=load('src/lib/db.ts'); user=await db.createUser({email:'test@example.com',name:'Tester',credits:10000,passwordHash:'unused',salt:'unused'});
  return {db,user,load,requests,uploads,actions:load('src/app/actions/influencers.ts'),generation:load('src/lib/influencer-generation.ts'),setStatus:value=>{status=value;},close:()=>rmSync(dir,{recursive:true,force:true})};
}

test('real influencer endpoint receives selected traits and separate public identity/style photos',async()=>{
  const f=await fixture();
  try{
    const result=await f.actions.createInfluencerAction({...input,referenceUrl:png,styleReferenceUrl:png});
    assert.ok(result.id);
    assert.equal(f.requests.length,1); assert.equal(f.uploads.length,2);
    const {url,init}=f.requests[0], body=JSON.parse(init.body);
    assert.equal(url,'https://api.higgsfield.ai/higgsfield/ai-influencer');
    assert.equal(init.headers['Idempotency-Key'],result.id);
    assert.equal(body.tier,'normal'); assert.deepEqual(body.selection,input.selection);
    assert.match(body.image_url,/\/identity.png$/); assert.match(body.item_image_urls[0],/\/style.png$/);
    assert.ok(body.seed>=1&&body.seed<=1e6); assert.equal(body.variation_index,0);
    assert.match(body.brief,/preserve recognizable facial identity/); assert.match(body.brief,/clothing, colors and styling/);
    assert.equal(body.batch_size,undefined); assert.equal(body.model,undefined);
    const records=await f.actions.pollInfluencersAction();
    assert.equal(records[0].imageUrl,'https://cdn.example.com/generated.png'); assert.equal(records[0].status,'completed');
    assert.equal((await f.db.findUserById(f.user.id)).credits,9999);
    assert.equal((await f.actions.pollInfluencersAction())[0].imageUrl,records[0].imageUrl);
  }finally{f.close();}
});

test('missing provider configuration creates no fake record and takes no credits',async()=>{
  const f=await fixture({env:{HF_API_KEY:''}});
  try{
    assert.match((await f.actions.createInfluencerAction(input)).error,/não está configurada/);
    assert.equal((await f.db.listInfluencers(f.user.id)).length,0); assert.equal(f.requests.length,0);
    assert.equal((await f.db.findUserById(f.user.id)).credits,10000);
  }finally{f.close();}
});

test('concurrent equal request keys submit and debit once; changed payload cannot reuse key',async()=>{
  const f=await fixture();
  try{
    const [a,b]=await Promise.all([f.actions.createInfluencerAction(input),f.actions.createInfluencerAction(input)]);
    assert.equal(a.id,b.id);assert.equal(f.requests.length,1);
    assert.equal((await f.db.findUserById(f.user.id)).credits,9999);
    assert.match((await f.actions.createInfluencerAction({...input,name:'Different'})).error,/já foi utilizado/);
    assert.equal(f.requests.length,1);
  }finally{f.close();}
});

test('confirmed failures refund exactly once even across concurrent polls; retry uses new job',async()=>{
  const f=await fixture();
  try{
    const a=await f.actions.createInfluencerAction(input); f.setStatus({status:'failed'});
    await Promise.all([f.actions.pollInfluencersAction(),f.actions.pollInfluencersAction()]);
    assert.equal((await f.db.findUserById(f.user.id)).credits,10000);
    const key='a8a3d7c7-2046-4692-9f80-4167a97a9a71';
    const [r1,r2]=await Promise.all([f.actions.retryInfluencerAction(a.id,key),f.actions.retryInfluencerAction(a.id,key)]);
    assert.ok(r1.id);assert.equal(r1.id,r2.id);
    assert.equal(f.requests.filter(r=>r.init.method==='POST').length,2);
    assert.equal((await f.db.findUserById(f.user.id)).credits,9999);
  }finally{f.close();}
});

test('definitive provider rejection returns safe error and refunds; no raw response or secrets exposed',async()=>{
  const f=await fixture({post:()=>Response.json({detail:'test-key:test-secret'}, {status:422})});
  try{
    const result=await f.actions.createInfluencerAction(input);
    assert.match(result.error,/recusou/);assert.doesNotMatch(result.error,/test-secret/);
    assert.equal((await f.db.findUserById(f.user.id)).credits,10000);
    assert.equal((await f.db.listInfluencers(f.user.id))[0].creditsRefunded,true);
  }finally{f.close();}
});

test('ambiguous submit is retained without a second paid POST or automatic refund',async()=>{
  const f=await fixture({post:()=>{throw new Error('network timed out');}});
  try{
    const result=await f.actions.createInfluencerAction(input);assert.equal(result.retryable,false);
    const record=(await f.db.listInfluencers(f.user.id))[0]; assert.equal(record.submissionUncertain,true);
    await f.actions.createInfluencerAction(input);
    assert.ok((await f.actions.retryInfluencerAction(record.id,'a8a3d7c7-2046-4692-9f80-4167a97a9a71')).error);
    await f.actions.pollInfluencersAction();
    assert.equal(f.requests.length,1);assert.equal((await f.db.findUserById(f.user.id)).credits,9999);
  }finally{f.close();}
});

test('runtime validation rejects unsupported tier, incompatible traits, duplicate slots, extra selections and arbitrary reference URLs',async()=>{
  const f=await fixture();
  try{
    const invalid=[{tier:'fake'},{selection:{gender:['female','male']}},{selection:{accessory:['acc_none','acc_hat']}},{tier:'normal',selection:{body_type:['pr_centaur']}},{selection:{unknown:['male']}},{selection:{gender:'male'}},{selection:{gender:['female','female']}},{referenceUrl:'https://attacker.example/photo.jpg'},{referenceUrl:'data:image/svg+xml;base64,PHN2Zy8+'},{referenceUrl:png.replace('image/png','image/jpeg')},{requestKey:'missing'},{name:'x'.repeat(81)}];
    for(const patch of invalid) assert.ok((await f.actions.createInfluencerAction({...input,...patch})).error,JSON.stringify(patch));
    assert.equal(f.requests.length,0);assert.equal((await f.db.findUserById(f.user.id)).credits,10000);
  }finally{f.close();}
});

test('completed response without a safe image is failed and refunded instead of accepting demo or javascript URLs',async()=>{
  const f=await fixture();
  try{
    await f.actions.createInfluencerAction(input); f.setStatus({status:'completed',images:[{url:'javascript:alert(1)'}]});
    const rows=await f.actions.pollInfluencersAction(); assert.equal(rows[0].status,'failed');assert.equal(rows[0].imageUrl,undefined);
    assert.equal((await f.db.findUserById(f.user.id)).credits,10000);
  }finally{f.close();}
});

test('removing a completed influencer preserves its consumed request key and refuses running deletion',async()=>{
  const f=await fixture();
  try{
    const result=await f.actions.createInfluencerAction(input);
    assert.equal(await f.db.deleteInfluencer(f.user.id,result.id),false);
    await f.actions.pollInfluencersAction(); assert.equal(await f.db.deleteInfluencer(f.user.id,result.id),true);
    assert.equal((await f.db.listInfluencers(f.user.id)).length,0);
    assert.ok((await f.actions.createInfluencerAction(input)).error);assert.equal(f.requests.filter(r=>r.init.method==='POST').length,1);
  }finally{f.close();}
});

test('credit CAS retries an ABA race and preserves the other operation ledger across video reservation and refunds',async()=>{
  let entity={id:'user',credits:1000,creditRevision:'r1'};
  let writes=0;
  const sb={from(){let next;const filters=new Map();return{
    eq(k,v){filters.set(k,v);return this;},is(k,v){filters.set(k,v);return this;},
    update(value){next=value.data;return this;},
    select(){return this;},
    async maybeSingle(){return {data:{data:structuredClone(entity)},error:null};},
    then(resolve){
      writes++;
      if(writes===1)entity={...entity,creditRevision:'r2',influencerCredits:{prior:{cost:125,state:'refunded'}}};
      const matched=filters.get('data->>credits')===String(entity.credits)&&filters.get('data->>creditRevision')===(entity.creditRevision??null);
      if(matched)entity=next;
      resolve({data:matched?[{id:'user'}]:[],error:null});
    },
  };}};
  const db=loader({env:{SUPABASE_URL:'https://db.example',SUPABASE_KEY:'test'},mocks:{'@supabase/supabase-js':{createClient:()=>sb}}})('src/lib/db.ts');
  assert.equal(await db.reserveInfluencerCredits('user','new',125),true); assert.equal(writes,2);
  assert.equal(entity.influencerCredits.prior.state,'refunded');assert.equal(entity.credits,875);
  assert.equal(await db.reserveVideoCredits('user',300),true);assert.equal(entity.credits,575);
  await db.refundInfluencerCredits('user','new');await db.refundInfluencerCredits('user','new');
  await db.adjustCredits('user',20);assert.equal(entity.credits,720);assert.equal(entity.influencerCredits.new.state,'refunded');
});

test('stale preparation and submission are mutually exclusive; a late reservation is refunded without submitting',async()=>{
  const f=await fixture();
  try{
    const stale={id:'stale-job',userId:f.user.id,name:'Stale',tier:'normal',selection:{},brief:'',seed:1,status:'queued',createdAt:Date.now()-181000};
    await f.db.createInfluencerOnce(stale);
    assert.equal(await f.db.failAbandonedInfluencerPreparation(f.user.id,stale.id),true);
    await f.db.refundInfluencerCredits(f.user.id,stale.id);
    assert.equal(await f.db.reserveInfluencerCredits(f.user.id,stale.id,125),true);
    assert.equal(await f.db.claimInfluencerSubmission(f.user.id,stale.id),false);
    await f.db.refundInfluencerCredits(f.user.id,stale.id);
    assert.equal((await f.db.findUserById(f.user.id)).credits,10000);
    const started={...stale,id:'started-job',status:'queued'};await f.db.createInfluencerOnce(started);
    await f.db.reserveInfluencerCredits(f.user.id,started.id,125);
    assert.equal(await f.db.claimInfluencerSubmission(f.user.id,started.id),true);
    assert.equal(await f.db.failAbandonedInfluencerPreparation(f.user.id,started.id),false);
    assert.equal(await f.db.claimInfluencerSubmission(f.user.id,started.id),false);
    assert.equal((await f.db.findUserById(f.user.id)).credits,9875);
  }finally{f.close();}
});

test('confirmation timeout starts at submission, and a persisted provider request cannot be abandoned by a stale poll',async()=>{
  const f=await fixture();
  try{
    const job={id:'confirmation-race',userId:f.user.id,name:'Delayed',tier:'normal',selection:{},brief:'',seed:1,status:'queued',createdAt:Date.now()-400000};
    await f.db.createInfluencerOnce(job);
    await f.db.claimInfluencerSubmission(f.user.id,job.id);
    assert.equal(await f.db.markUnconfirmedInfluencerSubmission(f.user.id,job.id),false);
    await f.db.updateInfluencer(job.id,{submissionStartedAt:Date.now()-181000,requestId:'confirmed'},f.user.id);
    assert.equal(await f.db.markUnconfirmedInfluencerSubmission(f.user.id,job.id),false);
    await f.db.updateInfluencer(job.id,{requestId:undefined},f.user.id);
    assert.equal(await f.db.markUnconfirmedInfluencerSubmission(f.user.id,job.id),true);
    assert.equal((await f.db.getInfluencer(f.user.id,job.id)).submissionUncertain,true);
  }finally{f.close();}
});
