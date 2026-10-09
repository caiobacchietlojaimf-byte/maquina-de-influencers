import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const image=Buffer.from('selected outfit pixels'), appearance=Buffer.from('body pixels'), frontal=Buffer.from('face pixels'), wan=Buffer.from('padded body');
const sheetBrief='Two-panel sheet: left a tight frontal close-up portrait with the entire head and hair in frame, right a full-body standing shot';
const selected={id:'selected',userId:'owner',status:'completed',imageUrl:'https://media.example/selected.png',brief:sheetBrief};
function fixture({ancestors=[],abort,split=true}={}){
  const calls={downloads:[],reads:[],media:[],uploads:[]};
  const mocks={
    'server-only':{},
    './db':{getInfluencer:async(owner,id,includeDeleted)=>{calls.reads.push([owner,id]);assert.equal(includeDeleted,true);return ancestors.find(i=>i.id===id&&i.userId===owner);}},
    './video-media':{publicMediaUrl:v=>v,readPublicVideo:async(...args)=>{calls.downloads.push(args);abort?.abort();return image;}},
    './character-identity-media':{prepareCharacterIdentityMedia:async(bytes,options)=>{
      options.signal?.throwIfAborted();calls.media.push({bytes,options});
      return {strategy:split?'sheet-panels':'single-image',appearance,wan,...(split?{frontal}:{})};
    }},
    '@vercel/blob':{put:async(...args)=>{calls.uploads.push(args);return {url:`https://assets.example/${args[0]}`};}},
  };
  const module={exports:{}};
  const code=ts.transpileModule(readFileSync(new URL('../src/lib/prepare-character-identity.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,Buffer,require:id=>id in mocks?mocks[id]:require(id)});
  return {...module.exports,calls};
}
test('uses only the selected version pixels while ancestor ownership supplies layout provenance',async()=>{
  const ancestor={...selected,id:'root',imageUrl:'https://media.example/old-outfit.png',deletedAt:1};
  const variant={...selected,brief:'Edit image 1 directly',creationMode:'edit',sourceInfluencerId:'root'};
  const f=fixture({ancestors:[ancestor]});
  const result=await f.readCharacterIdentity(variant,{width:1080,height:1920});
  assert.equal(result.image,image);assert.equal(f.calls.downloads.length,1);
  assert.equal(f.calls.downloads[0][0],selected.imageUrl);assert.equal(f.calls.downloads[0][1],25*1024*1024);
  assert.deepEqual(f.calls.reads,[['owner','root']]);assert.equal(f.calls.media[0].options.knownTwoPanelSheet,true);
  assert.equal(f.calls.media[0].bytes,image);assert.equal(f.calls.uploads.length,0);
});
test('unknown photos, cycles and foreign ancestors cannot enable sheet extraction',async()=>{
  for(const ancestors of [[],[{...selected,id:'root',userId:'other'}],[{...selected,id:'root',brief:'edit',creationMode:'edit',sourceInfluencerId:'selected'},{...selected,brief:'edit',creationMode:'edit',sourceInfluencerId:'root'}]]){
    const f=fixture({ancestors});
    await f.readCharacterIdentity({...selected,brief:'edit',creationMode:'edit',sourceInfluencerId:'root'},{width:720,height:1280});
    assert.equal(f.calls.media[0].options.knownTwoPanelSheet,false);assert.ok(f.calls.reads.length<=3);
  }
  const f=fixture();await f.readCharacterIdentity({...selected,brief:'An uploaded photograph'},{width:720,height:1280});
  assert.equal(f.calls.media[0].options.knownTwoPanelSheet,false);
});
test('Kling and Higgsfield freeze the same version face/body before generation',async()=>{
  for(const engine of ['fal-kling-pro','fal-kling-standard','higgsfield']){
    const f=fixture(),signal=new AbortController().signal;
    const result=await f.prepareCharacterIdentity(selected,{width:1080,height:1920},engine,'quote-id',signal);
    assert.equal(result.strategy,'sheet-panels');assert.ok(result.frontalUrl.endsWith('/frontal.png'));assert.ok(result.appearanceUrl.endsWith('/appearance.png'));
    assert.equal(f.calls.uploads.length,2);assert.equal(f.calls.uploads[0][1],appearance);assert.equal(f.calls.uploads[1][1],frontal);
    for(const [path,,options]of f.calls.uploads){assert.ok(path.startsWith('edit-identities/owner/quote-id/'));assert.equal(options.allowOverwrite,false);assert.equal(options.contentType,'image/png');assert.equal(options.abortSignal,signal);}
  }
});
test('Wan uploads only the padded single character, while fallback never invents a face crop',async()=>{
  const f=fixture();const result=await f.prepareCharacterIdentity(selected,{width:1080,height:1920},'fal-wan','quote-id');
  assert.equal(f.calls.uploads.length,1);assert.equal(f.calls.uploads[0][1],wan);assert.equal(result.wanUrl,result.appearanceUrl);assert.equal(result.frontalUrl,undefined);
  const fallback=fixture({split:false});const other=await fallback.prepareCharacterIdentity(selected,{width:1080,height:1920},'fal-kling-pro','quote-id');
  assert.equal(other.strategy,'single-image');assert.equal(other.frontalUrl,undefined);assert.equal(fallback.calls.uploads.length,1);
});
test('cancelled downloads and non-ready versions never upload identity references',async()=>{
  const abort=new AbortController(),f=fixture({abort});
  await assert.rejects(f.prepareCharacterIdentity(selected,{width:1080,height:1920},'fal-kling-pro','quote-id',abort.signal));
  assert.equal(f.calls.uploads.length,0);assert.equal(f.calls.media.length,0);
  const pending=fixture();await assert.rejects(pending.readCharacterIdentity({...selected,status:'processing'},{width:1080,height:1920}));assert.equal(pending.calls.downloads.length,0);
});
