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
const configured = {HF_API_KEY:'test-key:test-secret',HF_API_BASE_URL:'https://api.higgsfield.ai',FAL_KEY:'test-fal-key:test-fal-secret',BLOB_READ_WRITE_TOKEN:'test-token'};
const generatedPng = Buffer.alloc(40);
Buffer.from([137,80,78,71,13,10,26,10]).copy(generatedPng);
generatedPng.write('IHDR',12,'ascii'); generatedPng.writeUInt32BE(2048,16); generatedPng.writeUInt32BE(1365,20);
async function fixture(options={}) {
  const dir=mkdtempSync(path.join(tmpdir(),'mi-influencer-generation-'));
  let user;
  const requests=[], uploads=[];
  let status={status:'completed',images:[{url:'https://cdn.example.com/generated.png'}]};
  let falStatus={status:'COMPLETED'}, falResult={images:[{url:'https://v3.fal.media/files/generated.png'}]};
  let failStore=false;
  const load=loader({env:{...configured, DATA_DIR:dir,...options.env},mocks:{
    'next/cache':{revalidatePath(){}}, '@/lib/auth':{requireUser:async()=>user},
    '@/lib/video-media':{readPublicVideo:async()=>generatedPng},
    '@vercel/blob':{put:async(name,bytes,opts)=>{if(failStore&&name.startsWith('influencer-images/'))throw new Error('storage unavailable');uploads.push({name,bytes,opts});return{url:`https://store.public.blob.vercel-storage.com/${name}`};}},
  },fetch:async(url,init)=>{
    requests.push({url,init});
    if(init.method==='POST') {
      if(options.post) return options.post(url,init);
      return Response.json({request_id:'real-provider-request'});
    }
    if(url.startsWith('https://queue.fal.run/'))return Response.json(url.endsWith('/status')?falStatus:falResult);
    return Response.json(status);
  }});
  const db=load('src/lib/db.ts'); user=await db.createUser({email:'test@example.com',name:'Tester',credits:10000,passwordHash:'unused',salt:'unused'});
  return {db,user,load,requests,uploads,actions:load('src/app/actions/influencers.ts'),generation:load('src/lib/influencer-generation.ts'),setStatus:value=>{status=value;},setFalStatus:value=>{falStatus=value;},setFalResult:value=>{falResult=value;},failStore:value=>{failStore=value;},close:()=>rmSync(dir,{recursive:true,force:true})};
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

async function readyInfluencer(f, patch={}) {
  return f.db.createInfluencer({userId:f.user.id,name:'Dante',tier:'freak',selection:{aesthetic:['style_casual']},brief:'Original brief',seed:17,status:'completed',imageUrl:'https://store.public.blob.vercel-storage.com/original.png',...patch});
}
const variant = (id, patch={}) => ({influencerId:id,requestKey,kind:'outfit',prompt:'Troque por uma jaqueta de couro preta, camiseta branca e calça jeans.',name:'Jaqueta preta',...patch});

test('image and prompt uses real fal editing, ignores form traits, persists image before ready and charges two credits',async()=>{
  const f=await fixture();
  try {
    const result=await f.actions.createInfluencerAction({...input,mode:'prompt',tier:'invented',selection:{unknown:['ignored']},referenceUrl:png,prompt:'Use um vestido vermelho longo.'});
    assert.ok(result.id);
    const post=f.requests.find(r=>r.init.method==='POST');
    assert.equal(post.url,'https://queue.fal.run/fal-ai/nano-banana-pro/edit');
    const payload=JSON.parse(post.init.body);
    assert.equal(payload.resolution,'2K'); assert.equal(payload.num_images,1); assert.equal(payload.output_format,'png');
    assert.equal(payload.enable_web_search,false); assert.equal(payload.limit_generations,true);
    assert.match(payload.prompt,/vestido vermelho/); assert.doesNotMatch(payload.prompt,/female|hairstyle/);
    assert.match(payload.image_urls[0],/\/identity.png$/); assert.equal(payload.selection,undefined);
    assert.equal((await f.db.findUserById(f.user.id)).credits,9998);
    const rows=await f.actions.pollInfluencersAction(), image=rows.find(r=>r.id===result.id);
    assert.equal(image.status,'completed');assert.equal(image.creationMode,'prompt');assert.equal(image.provider,'fal');
    assert.match(image.imageUrl,new RegExp(`/influencer-images/${f.user.id}/${result.id}/result.png$`));
    assert.equal(image.pendingImageUrl,undefined);assert.equal(image.creditCost,2);
    assert.equal(f.requests.filter(r=>r.init.method==='POST').length,1);
    assert.ok(f.requests.some(r=>r.url==='https://queue.fal.run/fal-ai/nano-banana-pro/requests/real-provider-request/status'));
    assert.ok(f.requests.some(r=>r.url==='https://queue.fal.run/fal-ai/nano-banana-pro/requests/real-provider-request'));
  } finally { f.close(); }
});

test('outfit edits preserve original and create owned lineage; concurrent submissions charge only once',async()=>{
  const f=await fixture();
  try {
    const original=await readyInfluencer(f), before=JSON.stringify(original);
    const request=variant(original.id,{styleReferenceUrl:png});
    const [a,b]=await Promise.all([f.actions.createInfluencerVariantAction(request),f.actions.createInfluencerVariantAction(request)]);
    assert.ok(a.id);assert.equal(a.id,b.id);assert.equal(f.requests.filter(r=>r.init.method==='POST').length,1);
    assert.equal((await f.db.findUserById(f.user.id)).credits,9998);
    const payload=JSON.parse(f.requests.find(r=>r.init.method==='POST').init.body);
    assert.equal(payload.image_urls[0],original.imageUrl);assert.match(payload.image_urls[1],/\/style.png$/);
    assert.match(payload.prompt,/Change ONLY the clothing/);assert.match(payload.prompt,/Never copy a face/);
    await Promise.all([f.actions.pollInfluencersAction(),f.actions.pollInfluencersAction()]);
    assert.equal(JSON.stringify(await f.db.getInfluencer(f.user.id,original.id)),before);
    const edited=await f.db.getInfluencer(f.user.id,a.id);
    assert.equal(edited.rootInfluencerId,original.id);assert.equal(edited.sourceInfluencerId,original.id);
    assert.equal(edited.variantLabel,'Jaqueta preta');assert.equal(edited.name,'Dante');assert.equal(edited.editKind,'outfit');
    assert.equal(edited.creationMode,'edit');assert.notEqual(edited.imageUrl,original.imageUrl);
    const second=await f.actions.createInfluencerVariantAction(variant(a.id,{requestKey:'c8a3d7c7-2046-4692-9f80-4167a97a9a71',kind:'details',prompt:'Deixe o cabelo castanho.',name:'Cabelo castanho'}));
    const secondRecord=await f.db.getInfluencer(f.user.id,second.id);
    assert.equal(secondRecord.rootInfluencerId,original.id);assert.equal(secondRecord.sourceInfluencerId,edited.id);
    assert.equal(JSON.parse(f.requests.filter(r=>r.init.method==='POST')[1].init.body).image_urls[0],edited.imageUrl);
  } finally { f.close(); }
});

test('editing rejects another owner, forged source/root URLs, invalid prompts and unpaid incomplete jobs',async()=>{
  const f=await fixture();
  try {
    const foreign=await readyInfluencer(f,{userId:'other'}), pending=await readyInfluencer(f,{status:'processing'});
    const brokenRoot=await readyInfluencer(f,{rootInfluencerId:foreign.id});
    for(const source of [foreign,pending,brokenRoot]) assert.ok((await f.actions.createInfluencerVariantAction(variant(source.id))).error);
    const original=await readyInfluencer(f);
    for(const patch of [{kind:'arbitrary'},{prompt:''},{prompt:'x'.repeat(3001)},{name:'x'.repeat(81)},{styleReferenceUrl:'https://attacker.example/secret'},{requestKey:'not-a-uuid'}]) assert.ok((await f.actions.createInfluencerVariantAction(variant(original.id,patch))).error);
    assert.ok((await f.actions.createInfluencerAction({...input,mode:'prompt',prompt:'Just prompt'})).error);
    assert.ok((await f.actions.createInfluencerAction({...input,mode:'prompt',referenceUrl:png})).error);
    assert.equal(f.requests.length,0);assert.equal((await f.db.findUserById(f.user.id)).credits,10000);
    const accepted=await f.actions.createInfluencerVariantAction({...variant(original.id),rootInfluencerId:foreign.id,referenceUrl:'https://attacker.example/photo.png'});
    const record=await f.db.getInfluencer(f.user.id,accepted.id);
    assert.equal(record.rootInfluencerId,original.id);assert.equal(record.referenceUrl,original.imageUrl);
  } finally { f.close(); }
});

test('storage failure remains recoverable without another paid generation or losing the result URL',async()=>{
  const f=await fixture();
  try {
    const original=await readyInfluencer(f), result=await f.actions.createInfluencerVariantAction(variant(original.id));
    f.failStore(true);
    await f.actions.pollInfluencersAction();
    const pending=await f.db.getInfluencer(f.user.id,result.id);
    assert.equal(pending.status,'processing');assert.match(pending.error,/já foi gerada/);assert.match(pending.pendingImageUrl,/fal.media/);
    assert.equal(pending.imageUrl,undefined);assert.equal((await f.db.findUserById(f.user.id)).credits,9998);
    const requestsBefore=f.requests.length;
    f.failStore(false);
    const finalizer=f.load('src/lib/influencer-finalization.ts');
    await finalizer.finalizeInfluencers(await f.db.listPendingInfluencers());
    assert.equal(f.requests.length,requestsBefore,'storage-only recovery does not poll or submit provider again');
    assert.equal((await f.db.getInfluencer(f.user.id,result.id)).status,'completed');
    assert.equal((await f.db.findUserById(f.user.id)).credits,9998);
  } finally { f.close(); }
});

test('fal failure refunds once, retry retains mode/lineage and asynchronous timeout cannot be resubmitted',async()=>{
  const f=await fixture();
  try {
    const original=await readyInfluencer(f), result=await f.actions.createInfluencerVariantAction(variant(original.id));
    f.setFalResult({error:'inference failed'});
    await Promise.all([f.actions.pollInfluencersAction(),f.actions.pollInfluencersAction()]);
    assert.equal((await f.db.findUserById(f.user.id)).credits,10000);
    const retried=await f.actions.retryInfluencerAction(result.id,'c8a3d7c7-2046-4692-9f80-4167a97a9a71');
    const saved=await f.db.getInfluencer(f.user.id,retried.id);
    assert.equal(saved.provider,'fal');assert.equal(saved.creationMode,'edit');assert.equal(saved.editKind,'outfit');assert.equal(saved.variantLabel,'Jaqueta preta');assert.equal(saved.sourceInfluencerId,original.id);
    assert.equal((await f.db.findUserById(f.user.id)).credits,9998);
  } finally { f.close(); }
  const uncertain=await fixture({post:()=>{throw new Error('timeout');}});
  try {
    const original=await readyInfluencer(uncertain), result=await uncertain.actions.createInfluencerVariantAction(variant(original.id));
    assert.equal(result.retryable,false);
    const saved=(await uncertain.db.listInfluencers(uncertain.user.id)).find(i=>i.creationMode==='edit');
    assert.equal(saved.submissionUncertain,true);
    assert.ok((await uncertain.actions.retryInfluencerAction(saved.id,'c8a3d7c7-2046-4692-9f80-4167a97a9a71')).error);
    await uncertain.actions.createInfluencerVariantAction(variant(original.id));
    assert.equal(uncertain.requests.length,1);assert.equal((await uncertain.db.findUserById(uncertain.user.id)).credits,9998);
  } finally { uncertain.close(); }
});

test('archived roots and source versions preserve lineage across racing deletion and retry',async()=>{
  const f=await fixture();
  try {
    const original=await readyInfluencer(f), first=await f.actions.createInfluencerVariantAction(variant(original.id));
    await f.actions.pollInfluencersAction();
    await assert.rejects(f.actions.deleteInfluencerAction(original.id),/versões salvas/);
    assert.equal(await f.db.deleteInfluencer(f.user.id,original.id),true);
    assert.equal(await f.db.getInfluencer(f.user.id,original.id),undefined);
    assert.ok(await f.db.getInfluencer(f.user.id,original.id,true),'legacy root retained as tombstone');
    const next=await f.actions.createInfluencerVariantAction(variant(first.id,{requestKey:'c8a3d7c7-2046-4692-9f80-4167a97a9a71'}));
    assert.ok(next.id);assert.equal((await f.db.getInfluencer(f.user.id,next.id)).rootInfluencerId,original.id);
    f.setFalResult({error:'failed'});await f.actions.pollInfluencersAction();
    await f.actions.deleteInfluencerAction(first.id);
    const retried=await f.actions.retryInfluencerAction(next.id,'d8a3d7c7-2046-4692-9f80-4167a97a9a71');
    assert.ok(retried.id);assert.equal((await f.db.getInfluencer(f.user.id,retried.id)).sourceInfluencerId,first.id);
    assert.equal(await f.db.getInfluencer(f.user.id,original.id),undefined,'never unarchives original');
  } finally { f.close(); }
});

test('late failure cannot undo completion or refund successful generation',async()=>{
  const f=await fixture();
  try {
    const original=await readyInfluencer(f), result=await f.actions.createInfluencerVariantAction(variant(original.id));
    const snapshot=JSON.parse(JSON.stringify(await f.db.getInfluencer(f.user.id,result.id)));
    await f.actions.pollInfluencersAction();
    const finalizer=f.load('src/lib/influencer-finalization.ts');
    await finalizer.failInfluencerGeneration(snapshot,'late provider error');
    assert.equal((await f.db.getInfluencer(f.user.id,result.id)).status,'completed');
    assert.equal((await f.db.findUserById(f.user.id)).credits,9998);
    assert.equal(await f.db.updatePendingInfluencer(f.user.id,result.id,{status:'failed'}),undefined);
  } finally { f.close(); }
});

test('form custom outfit instructions override identity clothing and generic style',async()=>{
  const f=await fixture();
  try {
    await f.actions.createInfluencerAction({...input,referenceUrl:png,prompt:'Regata branca, bermuda azul e chinelos.'});
    const body=JSON.parse(f.requests[0].init.body);
    assert.match(body.brief,/existing clothes are not a clothing instruction/);
    assert.match(body.brief,/highest priority/);assert.match(body.brief,/Regata branca, bermuda azul e chinelos/);
    assert.match(body.brief,/same outfit in both panels/);
  } finally { f.close(); }
});

test('cron queue repairs failed but unrefunded jobs and skips uncertain/refunded/deleted records',async()=>{
  const f=await fixture();
  try {
    const base={userId:f.user.id,name:'Repair',tier:'normal',selection:{},brief:'',seed:1,status:'failed',requestFingerprint:'confirmed-payload'};
    const recover=await f.db.createInfluencer({...base,creditsRefunded:false,submissionUncertain:false});
    await f.db.reserveInfluencerCredits(f.user.id,recover.id,2);
    await f.db.createInfluencer({...base,submissionUncertain:true});
    await f.db.createInfluencer({...base,creditsRefunded:true});
    await f.db.createInfluencer({...base,deletedAt:Date.now()});
    const pending=await f.db.listPendingInfluencers();
    assert.equal(pending.length,1);assert.equal(pending[0].id,recover.id);
    await f.load('src/lib/influencer-finalization.ts').finalizeInfluencers(pending);
    assert.equal((await f.db.findUserById(f.user.id)).credits,10000);
    assert.equal((await f.db.getInfluencer(f.user.id,recover.id)).creditsRefunded,true);
    assert.equal((await f.db.listPendingInfluencers()).length,0);
    assert.equal(f.requests.length,0);
  } finally { f.close(); }
});

test('different concurrent variant payloads cannot consume the same request key or debit twice',async()=>{
  const f=await fixture();
  try {
    const original=await readyInfluencer(f);
    const result=await Promise.all([f.actions.createInfluencerVariantAction(variant(original.id)),f.actions.createInfluencerVariantAction(variant(original.id,{prompt:'Camisa amarela.'}))]);
    assert.equal(result.filter(r=>'id' in r).length,1);
    assert.equal(result.filter(r=>'error' in r).length,1);
    assert.equal((await f.db.findUserById(f.user.id)).credits,9998);
    assert.equal(f.requests.filter(r=>r.init.method==='POST').length,1);
  } finally { f.close(); }
});

test('fal configuration and durable storage are required before creating a paid version',async()=>{
  for(const env of [{FAL_KEY:''},{BLOB_READ_WRITE_TOKEN:''}]) {
    const f=await fixture({env});
    try {
      const original=await readyInfluencer(f);
      const result=await f.actions.createInfluencerVariantAction(variant(original.id));
      assert.ok(result.error);assert.equal(f.requests.length,0);
      assert.equal((await f.db.listInfluencers(f.user.id)).length,1);
      assert.equal((await f.db.findUserById(f.user.id)).credits,10000);
    } finally { f.close(); }
  }
});

test('low balance cannot submit image editing and deleting a failed variant cannot reset its request key',async()=>{
  const f=await fixture();
  try {
    const original=await readyInfluencer(f);await f.db.adjustCredits(f.user.id,-9999);
    assert.match((await f.actions.createInfluencerVariantAction(variant(original.id))).error,/precisa de 2/);
    assert.equal(f.requests.length,0);assert.equal((await f.db.findUserById(f.user.id)).credits,1);
    const failed=(await f.db.listInfluencers(f.user.id)).find(i=>i.creationMode==='edit');
    await f.actions.deleteInfluencerAction(failed.id);await f.db.adjustCredits(f.user.id,10);
    assert.ok((await f.actions.createInfluencerVariantAction(variant(original.id))).error);
    assert.equal(f.requests.length,0);assert.equal((await f.db.findUserById(f.user.id)).credits,11);
  } finally { f.close(); }
});

test('fal output allowlist rejects attacker and private URLs without fetching or exposing them',async()=>{
  const f=await fixture();
  try {
    const original=await readyInfluencer(f), result=await f.actions.createInfluencerVariantAction(variant(original.id));
    f.setFalResult({images:[{url:'https://attacker.example/image.png'},{url:'https://127.0.0.1/private'},{url:'javascript:alert(1)'}]});
    await f.actions.pollInfluencersAction();
    const saved=await f.db.getInfluencer(f.user.id,result.id);
    assert.equal(saved.status,'failed');assert.equal(saved.imageUrl,undefined);
    assert.equal(f.uploads.length,0);assert.equal((await f.db.findUserById(f.user.id)).credits,10000);
    await assert.rejects(f.generation.storeInfluencerEditResult('https://example.com/file.png',f.user.id,result.id),/imagem inválida/);
  } finally { f.close(); }
});
