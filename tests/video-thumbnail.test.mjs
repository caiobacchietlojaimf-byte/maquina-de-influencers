import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const compile = file => ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const thumbnailCode = compile('src/lib/video-thumbnail.ts');
const jpeg = Buffer.from([255, 216, 255, 224, 1, 2, 255, 217]);
function setup(options = {}) {
  const module = { exports: {} }, files = new Map(), leases = new Map();
  const state = { videos: { video: { id: 'video', userId: 'owner', status: 'completed', resultUrl: 'https://results.test/edited.mp4', edit: { sourceUrl: 'https://original.test/original.mp4' }, thumbnailUrl: 'https://reference.test/wrong-face.jpg', ...options.video }, ...options.videos } };
  const calls = { download: [], put: [], run: [], removed: [], get: [], release: [], claims: [] };
  let directory = 0, active = 0, maxActive = 0;
  const db = {
    getVideo: async (user, id) => { calls.get.push([user, id]); return state.videos[id] ? structuredClone(state.videos[id]) : undefined; },
    reserveVideoThumbnailWorker: async (user, id, claim) => { if (leases.has(`${user}:${id}`)) return false; leases.set(`${user}:${id}`, claim); return true; },
    releaseVideoThumbnailWorker: async (user, id, claim) => { calls.release.push([user, id, claim]); if (leases.get(`${user}:${id}`) === claim) leases.delete(`${user}:${id}`); },
    claimVideoThumbnail: async (user, id, source, claim) => { calls.claims.push([user, id, source, claim]); const row = state.videos[id]; if (!row || row.deletedAt || row.resultUrl !== source || row.userId !== user) return false; row.thumbnailJob = { sourceUrl: source, claimId: claim, state: 'processing', startedAt: Date.now() }; return true; },
    finishVideoThumbnail: async (user, id, source, claim, url) => { const row = state.videos[id]; if (!row || row.deletedAt || row.resultUrl !== source || row.userId !== user || row.thumbnailJob?.claimId !== claim) return false; if (url) { row.thumbnailUrl = url; row.thumbnailSourceUrl = source; delete row.thumbnailJob; } else row.thumbnailJob = { ...row.thumbnailJob, state: 'failed', retryAfter: Date.now() + 60000 }; return true; },
  };
  const mocks = {
    'server-only': {}, './db': db,
    './video-media': { readPublicVideo: async (...args) => { calls.download.push(args); active++; maxActive = Math.max(maxActive, active); try { return options.download ? await options.download(...args) : Buffer.from('source-video'); } finally { active--; } } },
    './video-reference': { mp4Metadata: () => ({ duration: 10, width: 1080, height: 1920, ...options.metadata }) },
    '@vercel/blob': { put: async (pathname, bytes, config) => { calls.put.push({ pathname, bytes, config }); if (options.beforePut) options.beforePut(state); return { url: `https://unit-test.public.blob.vercel-storage.com/${pathname}` }; } },
    'node:fs/promises': {
      mkdtemp: async prefix => `${prefix}${++directory}`, writeFile: async (name, bytes) => { files.set(name, bytes); },
      readFile: async name => files.get(name), stat: async name => ({ size: files.get(name)?.length ?? 0 }),
      rm: async (name, config) => { calls.removed.push({ name, config }); },
    },
    'node:child_process': { execFile: (_binary, args, config, callback) => { calls.run.push({ args, config }); files.set(args.at(-1), jpeg); callback(null, '', ''); } },
    sharp: () => ({ metadata: async () => ({ format: 'jpeg', width: 360, height: 640 }) }),
  };
  vm.runInNewContext(thumbnailCode, { module, exports: module.exports, Buffer, URL, AbortSignal, setTimeout, clearTimeout, process: { env: { BLOB_READ_WRITE_TOKEN: 'mock-blob-only', ...options.env } }, require: id => id in mocks ? mocks[id] : require(id) });
  return { ...module.exports, calls, state, leases, get maxActive() { return maxActive; } };
}

test('old reference covers are replaced once from the final result and reused persistently', async () => {
  const api = setup();
  const first = await api.getVideoThumbnail('owner', 'video');
  assert.match(first.url, /^https:\/\/unit-test\.public\.blob\.vercel-storage\.com\/video-thumbnails\/owner\/video-[a-f0-9]{24}\.jpg$/);
  assert.equal(api.calls.download[0][0], 'https://results.test/edited.mp4');
  assert.equal(api.calls.download[0][1], 200 * 1024 * 1024); assert.ok(api.calls.download[0][2]);
  assert.equal(api.state.videos.video.thumbnailSourceUrl, api.state.videos.video.resultUrl);
  assert.equal(api.state.videos.video.thumbnailUrl, first.url);
  assert.equal((await api.getVideoThumbnail('owner', 'video')).url, first.url);
  assert.equal(api.calls.download.length, 1); assert.equal(api.calls.put.length, 1); assert.equal(api.calls.run.length, 1);
  const command = api.calls.run[0];
  assert.deepEqual(Array.from(command.args.slice(command.args.indexOf('-protocol_whitelist'), command.args.indexOf('-protocol_whitelist') + 2)), ['-protocol_whitelist', 'file,pipe']);
  assert.equal(command.args[command.args.indexOf('-enable_drefs') + 1], '0'); assert.equal(command.args[command.args.indexOf('-use_absolute_path') + 1], '0');
  assert.equal(command.config.windowsHide, true); assert.equal(command.config.timeout, 12000); assert.equal(command.config.killSignal, 'SIGKILL');
  assert.equal(api.leases.size, 0); assert.equal(api.calls.removed.length, 1);
});
test('unknown, foreign, invalid IDs, deleted and unfinished videos cause no download or storage work', async () => {
  for (const [user, id, video] of [['stranger', 'video', {}], ['owner', 'missing', {}], ['owner', '../video', {}], ['owner', 'video', { deletedAt: 1 }], ['owner', 'video', { status: 'processing' }]]) {
    const api = setup({ video });
    assert.equal((await api.getVideoThumbnail(user, id)).status, 404);
    assert.equal(api.calls.download.length, 0); assert.equal(api.calls.put.length, 0);
  }
});
test('duplicate concurrent image requests share one download and extraction', async () => {
  let release;
  const bytes = new Promise(resolve => { release = resolve; });
  const api = setup({ download: () => bytes });
  const a = api.getVideoThumbnail('owner', 'video'), b = api.getVideoThumbnail('owner', 'video');
  release(Buffer.from('video'));
  assert.equal((await a).url, (await b).url); assert.equal(api.calls.download.length, 1); assert.equal(api.calls.run.length, 1);
});
test('at most two processes/downloads run concurrently for a viewport burst', async () => {
  const videos = Object.fromEntries(['v2', 'v3', 'v4'].map(id => [id, { id, userId: 'owner', status: 'completed', resultUrl: `https://results.test/${id}.mp4` }]));
  const api = setup({ videos, download: async () => { await new Promise(resolve => setTimeout(resolve, 40)); return Buffer.from('video'); } });
  const results = await Promise.all(['video', 'v2', 'v3', 'v4'].map(id => api.getVideoThumbnail('owner', id)));
  assert.ok(results.every(result => result.url)); assert.equal(api.maxActive, 2);
});
test('download failures are cooled down and release capacity without leaking provider details', async () => {
  const api = setup({ download: () => { throw new Error('secret signed URL/provider credential'); } });
  const result = await api.getVideoThumbnail('owner', 'video');
  assert.equal(result.status, 503); assert.equal(result.retryAfter, 60); assert.doesNotMatch(JSON.stringify(result), /secret|credential/);
  assert.equal((await api.getVideoThumbnail('owner', 'video')).status, 503); assert.equal(api.calls.download.length, 1); assert.equal(api.leases.size, 0);
});
test('deletion or replacement during processing prevents persisting or redirecting stale covers', async () => {
  for (const mutate of [row => { row.deletedAt = 2; }, row => { row.resultUrl = 'https://results.test/new.mp4'; }]) {
    const api = setup({ beforePut: state => mutate(state.videos.video) });
    assert.equal((await api.getVideoThumbnail('owner', 'video')).status, 404);
    assert.equal(api.state.videos.video.thumbnailSourceUrl, undefined); assert.equal(api.leases.size, 0);
  }
});
test('a cached thumbnail redirects only to a namespaced Blob for the exact owner, video and source', async () => {
  const api = setup();
  const valid = (await api.getVideoThumbnail('owner', 'video')).url, row = api.state.videos.video;
  assert.equal(api.verifiedVideoThumbnail(row), valid);
  for (const changed of [valid.replace('unit-test.public.blob.vercel-storage.com', 'evil.test'), valid.replace('/owner/', '/stranger/'), `${valid}?secret=x`, valid.replace('/video-', '/other-'), valid.replace('https://', 'http://')]) {
    assert.equal(api.verifiedVideoThumbnail({ ...row, thumbnailUrl: changed }), undefined);
  }
  assert.equal(api.verifiedVideoThumbnail({ ...row, resultUrl: 'https://results.test/new.mp4' }), undefined);
});
test('invalid metadata and pre-aborted requests never start ffmpeg', async () => {
  const api = setup({ metadata: { width: 12000 } });
  await assert.rejects(api.extractVideoThumbnail(Buffer.from('video'), AbortSignal.timeout(5000)), /dimensions/);
  const aborted = AbortSignal.abort(new Error('stop'));
  await assert.rejects(api.extractVideoThumbnail(Buffer.from('video'), aborted), /stop/);
  assert.equal(api.calls.run.length, 0); assert.equal(api.calls.put.length, 0);
});

test('real ffmpeg extracts a bounded JPEG from an MP4 and preserves its scene color/aspect', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'mi-thumbnail-fixture-'));
  t.after(() => { const resolved = path.resolve(directory); assert.equal(path.dirname(resolved), path.resolve(tmpdir())); assert.ok(path.basename(resolved).startsWith('mi-thumbnail-fixture-')); rmSync(resolved, { recursive: true, force: true }); });
  const file = path.join(directory, 'result.mp4');
  execFileSync(require('@ffmpeg-installer/ffmpeg').path, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=360x640:r=24', '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', file], { timeout: 15000, windowsHide: true });
  const mediaModule = { exports: {} };
  vm.runInNewContext(compile('src/lib/video-reference.ts'), { module: mediaModule, exports: mediaModule.exports, Buffer });
  const module = { exports: {} };
  vm.runInNewContext(thumbnailCode, { module, exports: module.exports, Buffer, URL, AbortSignal, setTimeout, clearTimeout, process: { env: {} }, require: id => id === 'server-only' ? {} : id === './video-reference' ? mediaModule.exports : ['./db', './video-media', '@vercel/blob'].includes(id) ? {} : require(id) });
  const image = await module.exports.extractVideoThumbnail(readFileSync(file), AbortSignal.timeout(20000));
  const meta = await sharp(image).metadata();
  assert.equal(meta.format, 'jpeg'); assert.equal(meta.width, 360); assert.equal(meta.height, 640);
  const { data } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[2] > 200 && data[0] < 20 && data[1] < 20, 'the thumbnail is the blue generated scene');
  assert.ok(image.length < 100000);
});
