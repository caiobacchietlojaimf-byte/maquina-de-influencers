import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url), NOW = 10_000_000;
const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/db.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const post = () => ({ id: 'post', userId: 'owner', videoId: 'video', platform: 'instagram', status: 'posted', mode: 'live', caption: 'Legenda publicada.', accountId: 'connection', accountUserId: '123', publishedMediaId: '777', providerId: '999', postedUrl: 'https://www.instagram.com/reel/Correct/', revision: 'first', createdAt: NOW });
const account = () => ({ id: 'connection', userId: 'owner', platform: 'instagram', status: 'connected', oauthProvider: 'instagram', providerUserId: '123', igUserId: '123', connectedAt: 100, scopes: ['instagram_business_basic'] });
const verified = (patch = {}) => ({ caption: 'Texto confirmado pela Meta.', accountId: 'connection', accountUserId: '123', connectedAt: 100, publishedMediaId: '777', permalink: 'https://www.instagram.com/reel/Correct/', checkedAt: NOW, ...patch });
function load(env, client) {
  const module = { exports: {} };
  class Clock extends Date { static now() { return NOW; } }
  vm.runInNewContext(compiled, { module, exports: module.exports, URL, structuredClone, Date: Clock, Buffer, process: { env, cwd: () => env.DATA_DIR ?? process.cwd() }, require: id => id === 'server-only' ? {} : id === '@supabase/supabase-js' ? { createClient: () => { assert.ok(client); return client; } } : require(id) });
  return module.exports;
}
function local(t, options = {}) {
  const folder = mkdtempSync(path.join(tmpdir(), 'mi-post-editor-db-'));
  writeFileSync(path.join(folder, 'db.json'), JSON.stringify({ users: [], videos: [], influencers: [], posts: [{ ...post(), ...options.post }], virals: [], socialAccounts: options.noAccount ? [] : [{ ...account(), ...options.account }] }));
  t.after(() => { assert.equal(path.dirname(path.resolve(folder)), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('mi-post-editor-db-')); rmSync(folder, { recursive: true, force: true }); });
  const reopen = () => load({ DATA_DIR: folder });
  return { db: reopen(), reopen };
}
function remote(_t, options = {}) {
  const original = { ...post(), ...options.post }, connected = { ...account(), ...options.account };
  const tables = new Map([['mi_posts', [{ id: original.id, user_id: original.userId, status: original.status, data: original }]], ['mi_social_accounts', options.noAccount ? [] : [{ id: connected.id, user_id: connected.userId, platform: connected.platform, data: connected }]]]);
  const state = { tables, beforeUpdate: undefined };
  const field = (row, key) => key.startsWith('data->>') ? row.data[key.slice(7)] == null ? null : String(row.data[key.slice(7)]) : row[key];
  const from = table => {
    const query = { table, conditions: [], operation: 'select', columns: '*', patch: undefined };
    const run = async single => {
      if (query.operation === 'update') await state.beforeUpdate?.(query, tables);
      const rows = tables.get(table).filter(row => query.conditions.every(([kind, key, value]) => kind === 'is' ? field(row, key) == null : kind === 'neq' ? field(row, key) !== value : field(row, key) === value));
      if (query.operation === 'update') rows.forEach(row => Object.assign(row, structuredClone(query.patch)));
      const result = rows.map(row => query.columns === 'id' ? { id: row.id } : { data: structuredClone(row.data) });
      return { data: single ? result[0] ?? null : result, error: null };
    };
    const api = {
      select(value) { query.columns = value; return api; }, update(value) { query.operation = 'update'; query.patch = structuredClone(value); return api; },
      eq(key, value) { query.conditions.push(['eq', key, value]); return api; }, is(key, value) { query.conditions.push(['is', key, value]); return api; }, neq(key, value) { query.conditions.push(['neq', key, value]); return api; },
      maybeSingle() { return run(true); }, then(resolve, reject) { return run(false).then(resolve, reject); },
    };
    return api;
  };
  const reopen = () => load({ SUPABASE_URL: 'https://mock.test', SUPABASE_KEY: 'mock' }, { from });
  return { db: reopen(), reopen, state };
}

for (const [mode, setup] of [['local', local], ['remote CAS', remote]]) {
  test(`${mode}: drafts persist offline without changing the public caption, container, status or sync time`, async t => {
    const f = setup(t, { noAccount: true });
    const saved = await f.db.savePublishedCaptionDraft('owner', 'post', 'first', '  Minha nova proposta.\n#Passeio  ');
    assert.equal(saved.caption, post().caption); assert.equal(saved.status, 'posted'); assert.equal(saved.providerId, '999');
    assert.equal(saved.captionSyncedAt, undefined); assert.notEqual(saved.revision, 'first');
    const reopened = await f.reopen().getPublishedPost('owner', 'post');
    assert.equal(reopened.captionDraft.caption, '  Minha nova proposta.\n#Passeio  '); assert.equal(reopened.captionDraft.baseCaption, post().caption); assert.equal(reopened.captionDraft.updatedAt, NOW);
  });
  test(`${mode}: two tabs with the same base revision cannot replace each other's draft`, async t => {
    const f = setup(t);
    const results = await Promise.all(['Proposta A', 'Proposta B'].map(text => f.db.savePublishedCaptionDraft('owner', 'post', 'first', text)));
    assert.equal(results.filter(Boolean).length, 1);
    const winner = results.find(Boolean), reopened = await f.reopen().getPublishedPost('owner', 'post');
    assert.equal(reopened.captionDraft.caption, winner.captionDraft.caption);
    assert.equal(await f.db.savePublishedCaptionDraft('owner', 'post', 'first', 'Sobrescrita atrasada'), undefined);
  });
  test(`${mode}: foreign, deleted, scheduled, demo and wrong-platform posts never become editable`, async t => {
    for (const patch of [{ userId: 'stranger' }, { deletedAt: NOW }, { status: 'scheduled' }, { mode: 'demo' }, { platform: 'tiktok' }]) {
      const f = setup(t, { post: patch });
      assert.equal(await f.db.getPublishedPost('owner', 'post'), undefined);
      assert.equal(await f.db.savePublishedCaptionDraft('owner', 'post', 'first', 'Unwanted'), undefined);
      assert.equal(await f.db.syncPublishedCaption('owner', 'post', 'first', verified()), undefined);
    }
  });
  test(`${mode}: confirmed remote changes preserve a differing draft and clear an exact applied draft`, async t => {
    const f = setup(t);
    const proposal = await f.db.savePublishedCaptionDraft('owner', 'post', 'first', 'Minha proposta');
    const fresh = await f.db.syncPublishedCaption('owner', 'post', proposal.revision, verified());
    assert.equal(fresh.caption, verified().caption); assert.equal(fresh.captionSyncedAt, NOW); assert.equal(fresh.captionDraft.caption, 'Minha proposta');
    assert.equal(fresh.captionDraft.baseCaption, post().caption);
    const applied = await f.db.syncPublishedCaption('owner', 'post', fresh.revision, verified({ caption: 'Minha proposta' }));
    assert.equal(applied.caption, 'Minha proposta'); assert.equal(applied.captionDraft, undefined);
    assert.equal((await f.reopen().getPublishedPost('owner', 'post')).captionDraft, undefined);
  });
  test(`${mode}: synchronization cannot lose a draft changed while the provider was queried`, async t => {
    const f = setup(t), before = await f.db.getPublishedPost('owner', 'post');
    const saved = await f.db.savePublishedCaptionDraft('owner', 'post', before.revision, 'Outra aba ganhou');
    assert.equal(await f.db.syncPublishedCaption('owner', 'post', before.revision, verified()), undefined);
    const latest = await f.db.getPublishedPost('owner', 'post');
    assert.equal(latest.caption, post().caption); assert.equal(latest.captionDraft.caption, saved.captionDraft.caption);
  });
  test(`${mode}: wrong bindings, stale reads and hostile permalinks cannot synchronize`, async t => {
    const f = setup(t);
    for (const patch of [{ accountId: 'different' }, { accountUserId: '456' }, { connectedAt: 101 }, { publishedMediaId: '999' }, { checkedAt: NOW - 60_001 }, { checkedAt: NOW + 30_001 }, { caption: null }, { caption: 'x'.repeat(10001) }, { permalink: 'https://evil.test/reel/Correct/' }, { permalink: 'https://www.instagram.com@evil.test/reel/Correct/' }, { permalink: 'https://www.instagram.com:8080/reel/Correct/' }, { permalink: 'javascript:alert(1)' }]) {
      assert.equal(await f.db.syncPublishedCaption('owner', 'post', 'first', verified(patch)), undefined, JSON.stringify(patch));
    }
    assert.equal((await f.db.getPublishedPost('owner', 'post')).caption, post().caption);
  });
  test(`${mode}: disconnect, reconnect or permission loss invalidates synchronization without losing the draft`, async t => {
    for (const options of [{ noAccount: true }, { account: { status: 'demo' } }, { account: { connectedAt: 101 } }, { account: { providerUserId: '456' } }, { account: { userId: 'stranger' } }, { account: { scopes: [] } }]) {
      const f = setup(t, options), saved = await f.db.savePublishedCaptionDraft('owner', 'post', 'first', 'Mantida');
      assert.equal(await f.db.syncPublishedCaption('owner', 'post', saved.revision, verified()), undefined);
      assert.equal((await f.db.getPublishedPost('owner', 'post')).captionDraft.caption, 'Mantida');
    }
  });
  test(`${mode}: legacy revisions and empty captions remain supported; invalid input is rejected`, async t => {
    const f = setup(t, { post: { revision: undefined, publishedMediaId: undefined } });
    for (const value of [undefined, 'x'.repeat(2201), 'bad\0text']) assert.equal(await f.db.savePublishedCaptionDraft('owner', 'post', null, value), undefined);
    assert.equal(await f.db.savePublishedCaptionDraft('owner', 'post', undefined, 'Missing revision'), undefined);
    const draft = await f.db.savePublishedCaptionDraft('owner', 'post', null, '');
    assert.equal(draft.captionDraft.caption, '');
    const synced = await f.db.syncPublishedCaption('owner', 'post', draft.revision, verified({ caption: '' }));
    assert.equal(synced.caption, ''); assert.equal(synced.captionDraft, undefined); assert.equal(synced.publishedMediaId, '777'); assert.equal(synced.providerId, '999');
  });
}
test('remote CAS blocks an interleaved delete after the read and before the write', async t => {
  const f = remote(t);
  f.state.beforeUpdate = (_query, tables) => {
    const row = tables.get('mi_posts')[0]; row.data.deletedAt = NOW; row.data.revision = 'deleted';
  };
  assert.equal(await f.db.savePublishedCaptionDraft('owner', 'post', 'first', 'Must not survive'), undefined);
  assert.equal(f.state.tables.get('mi_posts')[0].data.captionDraft, undefined);
});
test('remote CAS blocks an interleaved draft change after sync read and before write', async t => {
  const f = remote(t);
  f.state.beforeUpdate = (_query, tables) => {
    const row = tables.get('mi_posts')[0]; row.data.captionDraft = { caption: 'Newest draft', baseCaption: row.data.caption, updatedAt: NOW }; row.data.revision = 'newer';
  };
  assert.equal(await f.db.syncPublishedCaption('owner', 'post', 'first', verified()), undefined);
  const row = f.state.tables.get('mi_posts')[0].data;
  assert.equal(row.captionDraft.caption, 'Newest draft'); assert.equal(row.caption, post().caption);
});
