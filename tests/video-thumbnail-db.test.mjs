import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url), NOW = 10_000_000;
const code = ts.transpileModule(readFileSync(new URL('../src/lib/db.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const SOURCE = 'https://result.test/final.mp4', REPLACEMENT = 'https://result.test/replacement.mp4', COVER = 'https://store.public.blob.vercel-storage.com/cover.jpg';
const video = () => ({ id: 'video', userId: 'owner', status: 'completed', resultUrl: SOURCE, thumbnailUrl: 'https://original.test/old.jpg', edit: {}, createdAt: NOW });
const user = () => ({ id: 'owner', credits: 3875, createdAt: NOW });
function load(env, client) {
  const module = { exports: {} };
  class Clock extends Date { static now() { return NOW; } }
  vm.runInNewContext(code, { module, exports: module.exports, Buffer, Date: Clock, process: { env, cwd: () => env.DATA_DIR ?? process.cwd() }, require: id => id === 'server-only' ? {} : id === '@supabase/supabase-js' ? { createClient: () => { assert.ok(client); return client; } } : require(id) });
  return module.exports;
}
function local(t) {
  const folder = mkdtempSync(path.join(tmpdir(), 'mi-thumbnail-db-'));
  writeFileSync(path.join(folder, 'db.json'), JSON.stringify({ users: [user()], videos: [video()], influencers: [], posts: [], virals: [], socialAccounts: [] }));
  t.after(() => { assert.equal(path.dirname(path.resolve(folder)), path.resolve(tmpdir())); assert.ok(path.basename(folder).startsWith('mi-thumbnail-db-')); rmSync(folder, { recursive: true, force: true }); });
  const reopen = () => load({ DATA_DIR: folder });
  return { db: reopen(), reopen };
}
function remote() {
  const tables = new Map([['mi_users', [{ id: 'owner', data: user() }]], ['mi_videos', [{ id: 'video', user_id: 'owner', data: video() }]]]);
  const state = { tables, beforeUpdate: undefined };
  const field = (row, key) => key.startsWith('data->>') ? (row.data[key.slice(7)] == null ? null : String(row.data[key.slice(7)])) : row[key];
  const from = table => {
    const query = { table, conditions: [], operation: 'select', columns: '*', patch: undefined };
    const run = async single => {
      if (query.operation === 'update') await state.beforeUpdate?.(query, tables);
      const rows = tables.get(table).filter(row => query.conditions.every(([kind, key, value]) => kind === 'is' ? field(row, key) == null : field(row, key) === value));
      if (query.operation === 'update') rows.forEach(row => Object.assign(row, structuredClone(query.patch)));
      const result = rows.map(row => query.columns === 'id' ? { id: row.id } : { data: structuredClone(row.data) });
      return { data: single ? result[0] ?? null : result, error: null };
    };
    const api = {
      select(value) { query.columns = value; return api; }, update(value) { query.operation = 'update'; query.patch = structuredClone(value); return api; },
      eq(key, value) { query.conditions.push(['eq', key, value]); return api; }, is(key, value) { query.conditions.push(['is', key, value]); return api; },
      maybeSingle() { return run(true); }, then(resolve, reject) { return run(false).then(resolve, reject); },
    };
    return api;
  };
  const reopen = () => load({ SUPABASE_URL: 'https://mock.test', SUPABASE_KEY: 'mock' }, { from });
  return { db: reopen(), reopen, state };
}

for (const [mode, setup] of [['local', local], ['remote CAS', remote]]) {
  test(`${mode}: a single persistent claim wins and only its frame replaces the reference cover`, async t => {
    const f = setup(t);
    const claims = await Promise.all(['a', 'b'].map(id => f.db.claimVideoThumbnail('owner', 'video', SOURCE, id, NOW)));
    assert.equal(claims.filter(Boolean).length, 1);
    const row = await f.reopen().getVideo('owner', 'video'), winner = row.thumbnailJob.claimId;
    assert.equal(row.thumbnailUrl, 'https://original.test/old.jpg'); assert.equal(row.thumbnailSourceUrl, undefined);
    assert.equal(await f.db.finishVideoThumbnail('owner', 'video', SOURCE, 'wrong', COVER, NOW), false);
    assert.equal(await f.db.finishVideoThumbnail('owner', 'video', SOURCE, winner, COVER, NOW), true);
    const ready = await f.reopen().getVideo('owner', 'video');
    assert.equal(ready.thumbnailUrl, COVER); assert.equal(ready.thumbnailSourceUrl, SOURCE); assert.equal(ready.thumbnailJob, undefined);
    assert.equal(await f.db.claimVideoThumbnail('owner', 'video', SOURCE, 'new', NOW + 90001), false);
    assert.equal((await f.reopen().findUserById('owner')).credits, 3875);
  });
  test(`${mode}: foreign owners, changed media, deletion and wrong status cannot save or claim a thumbnail`, async t => {
    const f = setup(t);
    assert.equal(await f.db.claimVideoThumbnail('stranger', 'video', SOURCE, 'a', NOW), false);
    assert.equal(await f.db.claimVideoThumbnail('owner', 'video', REPLACEMENT, 'a', NOW), false);
    await f.db.updateVideo('video', { status: 'processing' });
    assert.equal(await f.db.claimVideoThumbnail('owner', 'video', SOURCE, 'a', NOW), false);
    await f.db.updateVideo('video', { status: 'review' });
    assert.equal(await f.db.claimVideoThumbnail('owner', 'video', SOURCE, 'a', NOW), true);
    await f.db.updateVideo('video', { resultUrl: REPLACEMENT });
    assert.equal(await f.db.finishVideoThumbnail('owner', 'video', SOURCE, 'a', COVER, NOW), false);
    assert.equal(await f.db.claimVideoThumbnail('owner', 'video', REPLACEMENT, 'b', NOW), true);
    await f.db.updateVideo('video', { deletedAt: NOW });
    assert.equal(await f.db.finishVideoThumbnail('owner', 'video', REPLACEMENT, 'b', COVER, NOW), false);
    assert.equal(await f.db.claimVideoThumbnail('owner', 'video', REPLACEMENT, 'c', NOW), false);
    assert.equal((await f.reopen().getVideo('owner', 'video')).thumbnailSourceUrl, undefined);
  });
  test(`${mode}: failures cool down and crashed extraction claims expire safely`, async t => {
    const f = setup(t);
    assert.equal(await f.db.claimVideoThumbnail('owner', 'video', SOURCE, 'a', NOW), true);
    assert.equal(await f.db.claimVideoThumbnail('owner', 'video', SOURCE, 'b', NOW + 89999), false);
    assert.equal(await f.db.claimVideoThumbnail('owner', 'video', SOURCE, 'b', NOW + 90001), true);
    assert.equal(await f.db.finishVideoThumbnail('owner', 'video', SOURCE, 'a', COVER, NOW + 90001), false);
    assert.equal(await f.db.finishVideoThumbnail('owner', 'video', SOURCE, 'b', undefined, NOW + 90001), true);
    assert.equal(await f.db.claimVideoThumbnail('owner', 'video', SOURCE, 'c', NOW + 149999), false);
    assert.equal(await f.db.claimVideoThumbnail('owner', 'video', SOURCE, 'c', NOW + 150002), true);
  });
  test(`${mode}: distributed worker capacity admits two, deduplicates a video, and preserves credits`, async t => {
    const f = setup(t);
    const admitted = await Promise.all(['video', 'video2', 'video3'].map(id => f.db.reserveVideoThumbnailWorker('owner', id, `claim-${id}`, NOW)));
    assert.equal(admitted.filter(Boolean).length, 2);
    assert.equal(await f.db.reserveVideoThumbnailWorker('owner', 'video', 'duplicate', NOW), false);
    await f.db.releaseVideoThumbnailWorker('owner', 'video', 'wrong');
    assert.equal(await f.db.reserveVideoThumbnailWorker('owner', 'video3', 'third', NOW), false);
    await f.db.releaseVideoThumbnailWorker('owner', 'video', 'claim-video');
    assert.equal(await f.db.reserveVideoThumbnailWorker('owner', 'video3', 'third', NOW), true);
    assert.equal(await f.db.reserveVideoThumbnailWorker('owner', 'after-crash', 'fresh', NOW + 90001), true);
    assert.equal((await f.reopen().findUserById('owner')).credits, 3875);
  });
}
test('remote CAS retries preserve a simultaneous caption update instead of erasing its cache', async () => {
  const f = remote(); let injected = false;
  f.state.beforeUpdate = (query, tables) => {
    if (injected || query.table !== 'mi_videos') return;
    injected = true;
    const row = tables.get('mi_videos')[0]; row.data.captionRevision = 'caption-won'; row.data.captionCache = { saved: { state: 'ready', caption: 'Preserved' } };
  };
  assert.equal(await f.db.claimVideoThumbnail('owner', 'video', SOURCE, 'thumbnail', NOW), true);
  assert.equal((await f.db.getVideo('owner', 'video')).captionCache.saved.caption, 'Preserved');
});
