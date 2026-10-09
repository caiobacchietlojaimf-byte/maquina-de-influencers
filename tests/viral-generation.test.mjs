import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, mocks = {}, env = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id === 'server-only' ? {} : id in mocks ? mocks[id] : require(id), process: { env } });
  return module.exports;
}
class PlatformError extends Error { constructor(status) { super('Provider refused'); this.status = status; } }
const input = { requestKey: '11111111-1111-4111-8111-111111111111', influencerId: 'character', effectId: 'effect', extraPrompt: 'scene' };
async function fixture(t, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mi-viral-generation-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = load('src/lib/db.ts', { '@supabase/supabase-js': {} }, { DATA_DIR: dir });
  const user = await db.createUser({ email: 'test@example.com', name: 'Tester', credits: options.credits ?? 3000, passwordHash: 'unused', salt: 'unused' });
  const snapshot = structuredClone(user);
  const submits = [], refunds = [];
  const actions = load('src/app/actions/videos.ts', {
    'next/cache': { revalidatePath() {} }, '@/lib/auth': { requireUser: async () => snapshot },
    '@/lib/db': { ...db, getInfluencer: async () => ({ id: 'character', status: 'completed', imageUrl: 'https://media.example/person.jpg' }), adjustCredits: async (...args) => { refunds.push(args); return db.adjustCredits(...args); } },
    '@/data/viral-effects': { getViralEffect: id => id === 'effect' ? { id, name: 'Effect', description: 'Description', thumbnail: 'https://media.example/poster.jpg' } : undefined },
    '@/lib/prompt': { buildViralPrompt: () => 'Use the requested effect' }, '@/lib/costs': load('src/lib/costs.ts'), '@/lib/credit-pricing': load('src/lib/credit-pricing.ts'),
    '@/lib/platform': { PlatformError, isConfigured: () => options.configured !== false, TERMINAL_STATUSES: new Set(), submitGeneration: async (...args) => { submits.push(args); if (options.error) throw options.error; return { requestId: 'provider-' + submits.length }; } },
    '@/lib/finalize-edit': {}, '@/lib/reconcile-fal-video': {},
  });
  return { db, user, actions, submits, refunds, balance: async () => (await db.findUserById(user.id)).credits };
}

test('an unconfigured viral generator fails before storing a fake request or charging', async t => {
  const f = await fixture(t, { configured: false });
  assert.match((await f.actions.createViralVideoAction(input)).error, /configurada/);
  assert.equal(await f.balance(), 3000); assert.equal(f.submits.length, 0); assert.equal((await f.db.listVideos(f.user.id)).length, 0);
});

test('same request key across simultaneous viral actions is charged and submitted only once', async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.actions.createViralVideoAction(input), f.actions.createViralVideoAction(input)]);
  assert.equal(results[0].id, results[1].id); assert.equal(f.submits.length, 1); assert.equal(await f.balance(), 2993);
  assert.equal((await f.db.getVideo(f.user.id, results[0].id)).creditCost, 7);
  const changed = await f.actions.createViralVideoAction({ ...input, extraPrompt: 'different' });
  assert.ok(changed.error); assert.equal(f.submits.length, 1);
  assert.equal(await f.db.deleteVideo(f.user.id, results[0].id), false);
  await f.db.updateVideo(results[0].id, { status: 'completed', resultUrl: 'https://media.example/final.mp4' });
  assert.equal(await f.db.deleteVideo(f.user.id, results[0].id), true);
  assert.ok((await f.actions.createViralVideoAction(input)).error); assert.equal(f.submits.length, 1);
});

test('concurrent distinct requests cannot overspend a stale balance snapshot', async t => {
  const f = await fixture(t, { credits: 7 });
  const results = await Promise.all([f.actions.createViralVideoAction(input), f.actions.createViralVideoAction({ ...input, requestKey: '22222222-2222-4222-8222-222222222222' })]);
  assert.equal(results.filter(r => r.id).length, 1); assert.equal(f.submits.length, 1); assert.equal(await f.balance(), 0);
});

test('a definitive provider refusal is refunded once and repeating its key does not resubmit', async t => {
  const f = await fixture(t, { error: new PlatformError(422) });
  assert.ok((await f.actions.createViralVideoAction(input)).error);
  assert.ok((await f.actions.createViralVideoAction(input)).error);
  assert.equal(f.submits.length, 1); assert.equal(f.refunds.length, 1); assert.equal(await f.balance(), 3000);
});

test('timeouts and unknown transport errors preserve the uncertain request without refund or paid retry', async t => {
  for (const error of [new PlatformError(408), new PlatformError(502), new Error('lost reply')]) {
    const f = await fixture(t, { error });
    const result = await f.actions.createViralVideoAction(input);
    assert.ok(result.id); assert.equal((await f.db.getVideo(f.user.id, result.id)).status, 'review');
    assert.equal((await f.actions.createViralVideoAction(input)).id, result.id);
    assert.equal(f.submits.length, 1); assert.equal(f.refunds.length, 0); assert.equal(await f.balance(), 2993);
  }
});

test('old pending demo videos become a truthful failure and completed historical assets remain intact', async t => {
  const f = await fixture(t);
  const pending = await f.db.createVideo({ userId: f.user.id, requestId: 'demo', status: 'processing', kind: 'viral', prompt: 'old' });
  const completed = await f.db.createVideo({ userId: f.user.id, requestId: 'demo', status: 'completed', resultUrl: 'https://media.example/historical.mp4', kind: 'viral', prompt: 'old' });
  await f.actions.pollVideosAction();
  assert.equal((await f.db.getVideo(f.user.id, pending.id)).status, 'failed');
  assert.equal((await f.db.getVideo(f.user.id, pending.id)).resultUrl, undefined);
  assert.equal((await f.db.getVideo(f.user.id, completed.id)).resultUrl, completed.resultUrl);
  assert.equal(f.submits.length, 0); assert.equal(await f.balance(), 3000);
});
