import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/app/api/videos/[id]/thumbnail/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(user = { id: 'owner' }, result = { url: 'https://store.public.blob.vercel-storage.com/video-thumbnails/owner/video.jpg' }) {
  const module = { exports: {} }, calls = [];
  vm.runInNewContext(code, { module, exports: module.exports, Response, require: id => id === '@/lib/auth' ? { currentUser: async () => user } : id === '@/lib/video-thumbnail' ? { getVideoThumbnail: async (...args) => { calls.push(args); return result; } } : {} });
  return { ...module.exports, calls };
}
const request = site => new Request('https://app.test/api/videos/video/thumbnail', { headers: site ? { 'Sec-Fetch-Site': site } : {} });
const context = { params: Promise.resolve({ id: 'video' }) };
test('thumbnail GET requires authentication and rejects cross-site generation requests', async () => {
  const anonymous = setup(null), cross = setup();
  assert.equal((await anonymous.GET(request(), context)).status, 401); assert.equal(anonymous.calls.length, 0);
  assert.equal((await cross.GET(request('cross-site'), context)).status, 403); assert.equal(cross.calls.length, 0);
});
test('owned result redirect is private, never cacheable across users, and resolves promised params', async () => {
  const api = setup(), response = await api.GET(request('same-origin'), context);
  assert.equal(response.status, 307); assert.match(response.headers.get('location'), /^https:\/\/store\.public\.blob\.vercel-storage\.com\//);
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('vary'), 'Cookie');
  assert.deepEqual(api.calls, [['owner', 'video']]); assert.equal(api.maxDuration, 75); assert.equal(api.runtime, 'nodejs');
});
test('not-found and busy responses keep controlled retry hints without running HEAD extraction', async () => {
  for (const result of [{ status: 404 }, { status: 503, retryAfter: 3 }]) {
    const api = setup({ id: 'owner' }, result), response = await api.GET(request(), context);
    assert.equal(response.status, result.status); assert.equal(response.headers.get('retry-after'), result.retryAfter ? '3' : null);
  }
  const api = setup(); assert.equal((await api.HEAD()).status, 405); assert.equal(api.calls.length, 0);
});
