import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const compile = file => ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const serviceCode = compile('src/lib/published-post-editor.ts'), actionCode = compile('src/app/actions/published-post-editor.ts');
function setup(options = {}) {
  const calls = { posts: [], save: [], sync: [], provider: [] };
  const state = {
    post: { id: 'post', userId: 'owner', videoId: 'video', platform: 'instagram', status: 'posted', mode: 'live', caption: 'Legenda registrada', accountId: 'connection', accountUserId: '123', publishedMediaId: '777', providerId: '999', postedUrl: 'https://www.instagram.com/reel/Correct/?igsh=tracking', revision: 'first', ...options.post },
    account: options.noAccount ? undefined : { id: 'connection', userId: 'owner', platform: 'instagram', status: 'connected', oauthProvider: 'instagram', providerUserId: '123', igUserId: '123', connectedAt: 100, scopes: ['instagram_business_basic'], accessToken: 'secret-server-token', ...options.account },
    video: { id: 'video', userId: 'owner', status: 'completed', resultUrl: 'https://video.test/final.mp4', ...options.video },
    provider: { status: 'ready', postId: 'post', caption: 'Legenda atual confirmada', accountId: 'connection', accountUserId: '123', publishedMediaId: '777', connectedAt: 100, checkedAt: 1000, permalink: 'https://www.instagram.com/reel/Correct/', ...options.provider },
  };
  const modules = {
    'server-only': {}, './publish-caption': { CAPTION_LIMIT: 2200 },
    './db': {
      getPublishedPost: async (userId, id) => { calls.posts.push({ userId, id }); return state.post ? structuredClone(state.post) : undefined; },
      getSocialAccount: async (userId, platform) => { assert.equal(userId, 'owner'); assert.equal(platform, 'instagram'); return structuredClone(state.account); },
      getVideo: async (userId, id) => { assert.equal(userId, 'owner'); assert.equal(id, 'video'); return structuredClone(state.video); },
      savePublishedCaptionDraft: async (userId, id, revision, caption) => {
        calls.save.push({ userId, id, revision, caption });
        if (options.saveConflict || !state.post || state.post.deletedAt || state.post.revision !== revision) return;
        state.post = { ...state.post, captionDraft: { caption, baseCaption: state.post.caption, updatedAt: 500 }, revision: 'draft-saved' };
        return structuredClone(state.post);
      },
      syncPublishedCaption: async (userId, id, revision, verified) => {
        calls.sync.push({ userId, id, revision, verified });
        if (!state.post || state.post.deletedAt || state.post.revision !== revision || !state.account || state.account.connectedAt !== verified.connectedAt) return;
        state.post = { ...state.post, caption: verified.caption, captionSyncedAt: verified.checkedAt, postedUrl: verified.permalink, revision: 'synced', ...(state.post.captionDraft?.caption === verified.caption ? { captionDraft: undefined } : {}) };
        return structuredClone(state.post);
      },
    },
    './instagram-performance': { getInstagramPublishedCaption: async (...args) => {
      calls.provider.push(args);
      if (options.read) return options.read(state);
      return structuredClone(state.provider);
    } },
  };
  const module = { exports: {} };
  vm.runInNewContext(serviceCode, { module, exports: module.exports, URL, require: id => { if (id in modules) return modules[id]; throw new Error(`Unexpected import ${id}; no network or paid providers in editor tests`); } });
  return { ...module.exports, calls, state };
}
test('opening an eligible post returns only local editor data without remote calls or fabricated freshness', async () => {
  const api = setup({ post: { captionDraft: { caption: 'Meu rascunho', baseCaption: 'Legenda registrada', updatedAt: 500 } } });
  const result = await api.getPublishedPostEditor('owner', 'post');
  assert.equal(result.editor.currentCaption, 'Legenda registrada'); assert.equal(result.editor.draft.caption, 'Meu rascunho');
  assert.equal(result.editor.checkedAt, undefined); assert.equal(result.editor.canSync, true); assert.equal(result.editor.canImprove, true);
  assert.equal(result.editor.permalink, 'https://www.instagram.com/reel/Correct/');
  assert.equal(api.calls.provider.length, 0); assert.equal(api.calls.sync.length, 0); assert.equal(api.calls.save.length, 0);
  const payload = JSON.stringify(result);
  for (const forbidden of ['secret-server-token', 'accessToken', 'providerId', 'accountId', 'resultUrl']) assert.equal(payload.includes(forbidden), false, forbidden);
});
test('invalid identifiers and foreign, deleted, demo or unposted rows never reach provider or mutations', async () => {
  for (const id of [undefined, '', '../post', 'x'.repeat(101)]) {
    const api = setup(); assert.ok('error' in await api.getPublishedPostEditor('owner', id)); assert.ok('error' in await api.syncPublishedPostCaption('owner', id)); assert.equal(api.calls.posts.length, 0);
  }
  for (const patch of [{ userId: 'other' }, { deletedAt: 500 }, { status: 'scheduled' }, { mode: 'demo' }, { platform: 'tiktok' }]) {
    const api = setup({ post: patch });
    assert.ok('error' in await api.getPublishedPostEditor('owner', 'post'));
    assert.ok('error' in await api.syncPublishedPostCaption('owner', 'post'));
    assert.ok('error' in await api.savePublishedPostCaptionDraft('owner', { postId: 'post', caption: 'Draft', baseRevision: 'first' }));
    assert.equal(api.calls.provider.length, 0); assert.equal(api.calls.sync.length, 0); assert.equal(api.calls.save.length, 0);
  }
});
test('offline saves persist only the draft and require the revision from the opened editor', async () => {
  const api = setup({ noAccount: true });
  const result = await api.savePublishedPostCaptionDraft('owner', { postId: 'post', caption: '  Melhor versão  ', baseRevision: 'first', userId: 'foreign', captionSyncedAt: 999, captionPublished: 'Forged' });
  assert.equal(result.editor.currentCaption, 'Legenda registrada'); assert.equal(result.editor.draft.caption, '  Melhor versão  '); assert.equal(result.editor.canSync, false);
  assert.ok(result.editor.connectionMessage); assert.equal(result.editor.checkedAt, undefined); assert.equal(api.calls.provider.length, 0);
  const conflict = await api.savePublishedPostCaptionDraft('owner', { postId: 'post', caption: 'Stale', baseRevision: 'first' });
  assert.equal(conflict.conflict, true); assert.equal(api.calls.save.length, 1);
  assert.equal(api.state.post.captionDraft.caption, '  Melhor versão  ');
});
test('empty editorial captions are valid, while oversized and malformed drafts never mutate', async () => {
  for (const input of [undefined, {}, { postId: 'post', caption: 'Missing base' }, { postId: 'post', caption: 123, baseRevision: 'first' }, { postId: 'post', caption: 'x'.repeat(2201), baseRevision: 'first' }, { postId: 'post', caption: 'secret\0text', baseRevision: 'first' }]) {
    const api = setup(); assert.ok('error' in await api.savePublishedPostCaptionDraft('owner', input)); assert.equal(api.calls.save.length, 0);
  }
  const api = setup(); const result = await api.savePublishedPostCaptionDraft('owner', { postId: 'post', caption: '', baseRevision: 'first' });
  assert.equal(result.editor.draft.caption, ''); assert.equal(result.editor.currentCaption, 'Legenda registrada');
});
test('missing video permits manual editing but never advertises AI availability', async () => {
  for (const patch of [{ deletedAt: 500 }, { status: 'processing' }, { resultUrl: undefined }, { userId: 'foreign' }]) {
    const api = setup({ video: patch }); const result = await api.getPublishedPostEditor('owner', 'post');
    assert.equal(result.editor.canImprove, false); assert.equal(result.editor.canSync, true);
  }
});
test('invalid connected account bindings block only fresh synchronization, not local drafts', async () => {
  for (const options of [{ noAccount: true }, { account: { userId: 'foreign' } }, { account: { providerUserId: '456' } }, { account: { igUserId: '456' } }, { account: { id: 'different' } }, { account: { status: 'demo' } }, { account: { oauthProvider: 'facebook' } }, { account: { scopes: [] } }, { account: { accessToken: undefined } }]) {
    const api = setup(options);
    const result = await api.getPublishedPostEditor('owner', 'post'); assert.equal(result.editor.canSync, false);
    assert.ok('error' in await api.syncPublishedPostCaption('owner', 'post')); assert.equal(api.calls.provider.length, 0);
    assert.ok('editor' in await api.savePublishedPostCaptionDraft('owner', { postId: 'post', caption: 'Local', baseRevision: 'first' }));
  }
});
test('a provider read is the sole source of caption updates and never receives the client draft', async () => {
  const api = setup({ post: { captionDraft: { caption: 'Texto ainda não publicado', baseCaption: 'Legenda registrada', updatedAt: 100 } } });
  const result = await api.syncPublishedPostCaption('owner', 'post');
  assert.equal(result.editor.currentCaption, 'Legenda atual confirmada'); assert.equal(result.editor.checkedAt, 1000);
  assert.equal(result.editor.draft.caption, 'Texto ainda não publicado');
  assert.equal(api.calls.provider.length, 1); assert.equal(JSON.stringify(api.calls.provider[0]), JSON.stringify(['owner', 'post']));
  assert.equal(api.calls.sync[0].verified.caption, 'Legenda atual confirmada'); assert.equal(api.calls.save.length, 0);
});
test('empty remote captions are valid, exact applied drafts clear, unavailable reads preserve everything', async () => {
  const api = setup({ post: { captionDraft: { caption: '', baseCaption: 'old', updatedAt: 100 } }, provider: { caption: '' } });
  const result = await api.syncPublishedPostCaption('owner', 'post');
  assert.equal(result.editor.currentCaption, ''); assert.equal(result.editor.draft, undefined);
  for (const status of ['unavailable', 'disconnected']) {
    const failed = setup({ provider: { status, message: 'Falha segura.' } });
    assert.equal((await failed.syncPublishedPostCaption('owner', 'post')).error, 'Falha segura.');
    assert.equal(failed.calls.sync.length, 0); assert.equal(failed.state.post.caption, 'Legenda registrada');
  }
});
test('wrong provider post, media or connection never reaches persistence', async () => {
  for (const patch of [{ postId: 'different' }, { publishedMediaId: '999' }, { accountId: 'different' }, { accountUserId: '456' }, { connectedAt: 101 }]) {
    const api = setup({ provider: patch }); const result = await api.syncPublishedPostCaption('owner', 'post');
    assert.equal(result.conflict, true); assert.equal(api.calls.sync.length, 0);
  }
});
test('concurrent draft edits, post deletion and account reconnect reject stale synchronization', async () => {
  for (const mutate of [state => { state.post.revision = 'newer'; state.post.captionDraft = { caption: 'Newest', baseCaption: 'old', updatedAt: 500 }; }, state => { state.post.deletedAt = 500; }, state => { state.account.connectedAt = 101; }]) {
    const api = setup({ read: state => { mutate(state); return state.provider; } });
    const result = await api.syncPublishedPostCaption('owner', 'post');
    assert.equal(result.conflict, true); assert.equal(api.state.post.caption, 'Legenda registrada');
  }
});
test('untrusted stored permalinks cannot become an Open Instagram link', async () => {
  for (const postedUrl of ['javascript:alert(1)', 'https://evil.test/reel/x/', 'https://www.instagram.com@evil.test/reel/x/', 'https://www.instagram.com:8080/reel/x/', 'https://www.instagram.com/direct/inbox/']) {
    const api = setup({ post: { postedUrl } }); assert.equal((await api.getPublishedPostEditor('owner', 'post')).editor.permalink, undefined);
  }
});

function actions(options = {}) {
  const module = { exports: {} }, calls = { auth: 0, get: [], save: [], sync: [], revalidate: [] };
  const handler = name => async (...args) => { calls[name].push(args); if (options.throw) throw new Error('secret-token provider internals'); return options.result ?? { editor: { postId: 'post' } }; };
  const modules = { 'next/cache': { revalidatePath: path => calls.revalidate.push(path) }, '@/lib/auth': { requireUser: async () => { calls.auth++; if (options.unauthorized) throw new Error('Unauthorized'); return { id: 'session-owner' }; } }, '@/lib/published-post-editor': { getPublishedPostEditor: handler('get'), savePublishedPostCaptionDraft: handler('save'), syncPublishedPostCaption: handler('sync') } };
  vm.runInNewContext(actionCode, { module, exports: module.exports, require: id => { if (id in modules) return modules[id]; throw new Error(`Unexpected import ${id}`); } });
  return { ...module.exports, calls };
}
test('server actions use session ownership and only revalidate successful mutations', async () => {
  const api = actions();
  await api.getPublishedPostEditorAction('post'); await api.savePublishedCaptionDraftAction({ postId: 'post', caption: 'draft', baseRevision: 'first', userId: 'attacker' }); await api.syncPublishedPostCaptionAction('post');
  assert.equal(api.calls.auth, 3);
  for (const name of ['get', 'save', 'sync']) assert.equal(api.calls[name][0][0], 'session-owner');
  assert.equal(JSON.stringify(api.calls.revalidate), JSON.stringify(['/app/publicar', '/app/publicar']));
  const rejected = actions({ result: { error: 'Conflict', conflict: true } });
  await rejected.savePublishedCaptionDraftAction({}); await rejected.syncPublishedPostCaptionAction('post'); assert.equal(rejected.calls.revalidate.length, 0);
});
test('server actions do not expose provider errors and authentication stops all service calls', async () => {
  const failed = actions({ throw: true });
  for (const result of [await failed.getPublishedPostEditorAction('post'), await failed.savePublishedCaptionDraftAction({}), await failed.syncPublishedPostCaptionAction('post')]) {
    assert.ok(result.error); assert.equal(result.error.includes('secret-token'), false);
  }
  const denied = actions({ unauthorized: true });
  await assert.rejects(denied.getPublishedPostEditorAction('post'), /Unauthorized/);
  await assert.rejects(denied.savePublishedCaptionDraftAction({}), /Unauthorized/);
  await assert.rejects(denied.syncPublishedPostCaptionAction('post'), /Unauthorized/);
  for (const name of ['get', 'save', 'sync']) assert.equal(denied.calls[name].length, 0);
});
