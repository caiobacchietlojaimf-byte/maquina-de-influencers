import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/lib/publication-assistant.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const input = (patch = {}) => ({ videoId: 'video-1', platform: 'instagram', goal: 'comments', ...patch });
const improveInput = (patch = {}) => input({ caption: 'Meu passeio de hoje pelo parque. Qual caminho você escolheria?', ...patch });
const generated = () => ({ caption: 'Legenda factual criada da cena observada.', alternatives: ['Outra abordagem do vídeo.'], keywords: ['parque', 'passeio', 'natureza'], hashtags: ['#Parque', '#Passeio', '#Natureza'], sceneSummary: 'Uma pessoa caminha no parque.' });
function setup(options = {}) {
  const calls = { getVideo: [], influencer: [], context: [], claim: [], reserve: [], provider: [], performance: [], finish: [], finishError: [], fallback: [] };
  const state = {
    video: { id: 'video-1', userId: 'owner', influencerId: 'selected-version', status: 'completed', resultUrl: 'https://blob.test/complete.mp4', ...options.video },
    context: { sourceTitle: 'Passeio no parque', characterName: 'Dante', keywords: [], matchedBy: 'id', ...options.context },
    performance: options.performance ?? { status: 'disconnected', sampleSize: 0, posts: [], recommendations: [], summary: 'Desconectado' },
    quota: options.quota ?? true,
  };
  let clock = options.now ?? 1_000_000, claimIndex = 0;
  const env = { FAL_KEY: 'fake-server-fal-key', ...options.env }, module = { exports: {} };
  class Clock extends Date { static now() { return clock; } }
  const db = {
    getVideo: async (...args) => { calls.getVideo.push(args); return state.video ? structuredClone(state.video) : undefined; },
    getInfluencer: async (...args) => { calls.influencer.push(args); return { id: 'selected-version', userId: 'owner', name: 'Dante' }; },
    reserveCaptionRequest: async (...args) => { calls.reserve.push(args); return state.quota; },
    claimVideoCaption: async (userId, id, slot, fingerprint, expectedResultUrl) => {
      calls.claim.push({ userId, id, slot, fingerprint, expectedResultUrl });
      if (options.claimMissing || (expectedResultUrl && state.video.resultUrl !== expectedResultUrl)) return;
      const prior = state.video.captionCache?.[slot];
      const mayRetryUnsubmitted = prior?.state === 'ready' && prior.error && prior.retryAt && prior.retryAt <= clock;
      if (prior && prior.resultUrl === state.video.resultUrl && !mayRetryUnsubmitted && (prior.fingerprint === fingerprint || prior.state === 'pending')) return { claimed: false, entry: structuredClone(prior) };
      const entry = { fingerprint, claimId: `claim-${++claimIndex}`, state: 'pending', startedAt: clock, resultUrl: state.video.resultUrl };
      state.video.captionCache = { ...state.video.captionCache, [slot]: entry };
      return { claimed: true, entry: structuredClone(entry) };
    },
    finishVideoCaption: async (userId, id, slot, claimId, suggestion) => {
      calls.finish.push({ userId, id, slot, claimId, suggestion });
      const row = state.video, entry = row?.captionCache?.[slot];
      if (!row || row.userId !== userId || row.id !== id || row.deletedAt || row.status !== 'completed' || !row.resultUrl || entry?.claimId !== claimId || entry.state !== 'pending' || entry.resultUrl !== row.resultUrl) return false;
      row.captionCache[slot] = { ...entry, state: 'ready', suggestion: structuredClone(suggestion), error: undefined, retryAt: undefined };
      return true;
    },
    finishVideoCaptionError: async (userId, id, slot, claimId, error, retryAt) => {
      calls.finishError.push({ userId, id, slot, claimId, error, retryAt });
      const row = state.video, entry = row?.captionCache?.[slot];
      if (!row || row.userId !== userId || row.id !== id || row.deletedAt || row.status !== 'completed' || !row.resultUrl || entry?.claimId !== claimId || entry.state !== 'pending' || entry.resultUrl !== row.resultUrl) return false;
      row.captionCache[slot] = { ...entry, state: 'ready', suggestion: undefined, error: error.slice(0, 500), ...(retryAt ? { retryAt } : {}) };
      return true;
    },
  };
  const mocks = {
    'server-only': {}, 'node:crypto': { createHash }, './db': db,
    './publication-context': { resolvePublicationContext: async (...args) => { calls.context.push(args); return state.context; } },
    './caption-provider': { CAPTION_PROVIDER_VERSION: 'test-v1', generatePublicationCaption: async (args) => { calls.provider.push(args); return options.generate ? options.generate(args, state) : generated(); } },
    './instagram-performance': { getInstagramPerformance: async (...args) => { calls.performance.push(args); return options.readPerformance ? options.readPerformance(state) : state.performance; } },
    './publication-fallback': { publicationFallback: (videoId, context, goal, notice) => {
      calls.fallback.push({ videoId, context, goal, notice });
      return { videoId, caption: 'Rascunho baseado no contexto conhecido.', alternatives: [{ label: 'Variação 2', caption: 'Alternativa do contexto.' }], keywords: ['contexto'], hashtags: ['#Contexto'], goal, source: { title: context.sourceTitle ?? 'Vídeo', kind: 'reference-context' }, method: 'context', generatedAt: clock, notice };
    } },
  };
  vm.runInNewContext(code, { module, exports: module.exports, Date: Clock, process: { env }, setTimeout: fn => { clock += 1000; queueMicrotask(fn); }, require: id => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected import ${id}; this test must not call a live API`);
  } });
  return { ...module.exports, calls, state, env, advance: amount => { clock += amount; } };
}

test('invalid selection, ownership or readiness blocks context, quota and every provider', async () => {
  for (const malformed of [undefined, {}, input({ videoId: '../secret' }), input({ videoId: '' }), input({ platform: 'youtube' }), input({ goal: 'sell' })]) {
    const api = setup();
    assert.ok('error' in await api.preparePublication('owner', malformed));
    assert.equal(api.calls.getVideo.length, 0); assert.equal(api.calls.provider.length, 0);
  }
  for (const patch of [{ userId: 'stranger' }, { deletedAt: 10 }, { status: 'processing' }, { resultUrl: undefined }]) {
    const api = setup({ video: patch });
    assert.ok('error' in await api.preparePublication('owner', input()));
    for (const key of ['context', 'claim', 'reserve', 'provider', 'performance']) assert.equal(api.calls[key].length, 0, key);
  }
});
test('the same completed suggestion is reused without another paid call, quota reservation or analytics request', async () => {
  const api = setup();
  const first = await api.preparePublication('owner', input()), reopened = await api.preparePublication('owner', input());
  assert.equal(JSON.stringify(first), JSON.stringify(reopened));
  assert.equal(first.suggestion.method, 'ai');
  assert.equal(api.calls.provider.length, 1); assert.equal(api.calls.reserve.length, 1); assert.equal(api.calls.performance.length, 1);
  assert.equal(api.calls.influencer[0][0], 'owner'); assert.equal(api.calls.influencer[0][1], 'selected-version'); assert.equal(api.calls.influencer[0][2], true);
  assert.equal(api.calls.finish[0].userId, 'owner'); assert.equal(api.calls.finish[0].claimId, 'claim-1');
});
test('quota exhaustion saves a disclosed contextual fallback without contacting providers', async () => {
  const api = setup({ quota: false });
  const first = await api.preparePublication('owner', input()), reopened = await api.preparePublication('owner', input());
  assert.equal(first.suggestion.method, 'context'); assert.match(first.suggestion.notice, /análise visual não ficou disponível/);
  assert.equal(JSON.stringify(first), JSON.stringify(reopened));
  assert.equal(api.calls.provider.length, 0); assert.equal(api.calls.performance.length, 0); assert.equal(api.calls.reserve.length, 1);
});
test('no configured fal key uses a cached fallback without consuming quota', async () => {
  const api = setup({ env: { FAL_KEY: '' } });
  assert.equal((await api.preparePublication('owner', input())).suggestion.method, 'context');
  assert.equal(api.calls.provider.length, 0); assert.equal(api.calls.reserve.length, 0);
});
test('an uncertain provider error is persisted as fallback and reopening cannot submit a second POST', async () => {
  const api = setup({ generate: () => { throw new Error('PRIVATE_PROVIDER_ERROR or timeout after acceptance'); } });
  const first = await api.preparePublication('owner', input()), reopened = await api.preparePublication('owner', input());
  assert.equal(first.suggestion.method, 'context'); assert.equal(JSON.stringify(first), JSON.stringify(reopened));
  assert.doesNotMatch(JSON.stringify(first), /PRIVATE_PROVIDER_ERROR/);
  assert.equal(api.calls.provider.length, 1); assert.equal(api.calls.reserve.length, 1); assert.equal(api.calls.finish.length, 1);
});
test('AI alternatives are mapped and only the top three comparable posts reach editorial context', async () => {
  const posts = Array.from({ length: 8 }, (_, index) => ({ id: String(index), caption: `Legenda ${index}`, likes: 100 - index, comments: index, accessToken: 'MUST_NOT_FORWARD', mediaUrl: 'https://example.test/private.mp4' }));
  const api = setup({ performance: { status: 'ready', sampleSize: 8, posts, summary: 'Resumo observado', recommendations: ['Compare os ganchos.'] } });
  const result = await api.preparePublication('owner', input({ goal: 'shares' }));
  assert.equal(result.suggestion.caption, generated().caption); assert.equal(result.suggestion.notice, undefined);
  assert.equal(result.suggestion.alternatives[0].label, 'Variação 2'); assert.equal(result.suggestion.alternatives[0].caption, generated().alternatives[0]);
  const sent = api.calls.provider[0];
  assert.equal(sent.userId, 'owner'); assert.equal(sent.platform, 'instagram'); assert.equal(sent.goal, 'shares');
  assert.equal(sent.performanceContext.bestPosts.length, 3); assert.equal(sent.performanceContext.bestPosts[0].caption, 'Legenda 0');
  assert.deepEqual(Object.keys(sent.performanceContext.bestPosts[0]).sort(), ['caption', 'comments', 'likes']);
  assert.doesNotMatch(JSON.stringify(sent.performanceContext), /MUST_NOT_FORWARD|private\.mp4/);
});
test('three total Reels with fewer than three comparable counts must not imply performance evidence', async () => {
  const api = setup({ performance: { status: 'ready', sampleSize: 5, posts: [
    { caption: 'Um tem números.', likes: 20, comments: 1 }, { caption: 'Contagem oculta.', likes: 100 },
    { caption: 'Só comentários.', comments: 2 }, { caption: 'Nenhuma contagem.' }, { caption: 'Outro.' },
  ], summary: 'Amostra insuficiente', recommendations: ['Aguarde mais dados.'] } });
  const result = await api.preparePublication('owner', input());
  assert.equal(result.suggestion.method, 'ai');
  assert.equal(api.calls.provider[0].performanceContext, undefined);
});
test('TikTok captions never query Instagram metrics and each platform/goal has a distinct cache slot', async () => {
  const api = setup();
  await api.preparePublication('owner', input({ platform: 'tiktok' }));
  await api.preparePublication('owner', input({ platform: 'tiktok', goal: 'saves' }));
  assert.equal(api.calls.performance.length, 0); assert.equal(api.calls.provider.length, 2);
  assert.deepEqual(api.calls.claim.map(call => call.slot), ['tiktok:comments', 'tiktok:saves']);
  assert.notEqual(api.calls.claim[0].fingerprint, api.calls.claim[1].fingerprint);
});
test('deletion while the provider runs prevents its result from being returned or resurrecting the video', async () => {
  const api = setup({ generate: (_input, state) => { state.video.deletedAt = 100; return generated(); } });
  const result = await api.preparePublication('owner', input());
  assert.ok('error' in result); assert.match(result.error, /vídeo mudou/);
  assert.equal(api.calls.provider.length, 1); assert.equal(api.state.video.deletedAt, 100);
  assert.equal(api.state.video.captionCache['instagram:comments'].state, 'pending');
});
test('an absent claim returns immediately without quota or paid work', async () => {
  const api = setup({ claimMissing: true });
  const result = await api.preparePublication('owner', input());
  assert.ok('error' in result); assert.equal(api.calls.provider.length, 0); assert.equal(api.calls.reserve.length, 0);
});
test('an abandoned claim is resolved to fallback, never resubmitted even with new context', async () => {
  const api = setup({ video: { captionCache: { 'instagram:comments': { claimId: 'abandoned', state: 'pending', startedAt: 1, fingerprint: 'old-fingerprint', resultUrl: 'https://blob.test/complete.mp4' } } } });
  const result = await api.preparePublication('owner', input());
  assert.equal(result.suggestion.method, 'context'); assert.equal(api.calls.provider.length, 0); assert.equal(api.calls.reserve.length, 0);
  assert.equal(api.calls.finish[0].claimId, 'abandoned');
});
test('another live claim can finish while this request waits, with no duplicate paid operation', { timeout: 3000 }, async () => {
  let providerStarted, releaseProvider;
  const started = new Promise(resolve => { providerStarted = resolve; }), deferred = new Promise(resolve => { releaseProvider = resolve; });
  const api = setup({ generate: async () => { providerStarted(); return deferred; } });
  const first = api.preparePublication('owner', input());
  await started;
  const second = api.preparePublication('owner', input());
  queueMicrotask(() => releaseProvider(generated()));
  const results = await Promise.all([first, second]);
  assert.equal(results[0].suggestion.caption, results[1].suggestion.caption);
  assert.equal(api.calls.provider.length, 1); assert.equal(api.calls.reserve.length, 1);
});
test('a replacement of the video URL during analysis rejects the stale caption atomically', async () => {
  const api = setup({ generate: (_input, state) => { state.video.resultUrl = 'https://blob.test/replacement.mp4'; return generated(); } });
  const result = await api.preparePublication('owner', input());
  assert.ok('error' in result); assert.match(result.error, /vídeo mudou/);
  assert.equal(api.calls.provider.length, 1); assert.equal(api.state.video.captionCache['instagram:comments'].state, 'pending');
  assert.equal(api.calls.claim[0].expectedResultUrl, 'https://blob.test/complete.mp4');
});

test('improvement rejects malformed input and non-owned or unfinished media before reserving paid work', async () => {
  for (const malformed of [undefined, null, {}, improveInput({ caption: '' }), improveInput({ caption: '  \n ' }), improveInput({ caption: 123 }), improveInput({ caption: 'a'.repeat(2201) }), improveInput({ videoId: '../other' }), improveInput({ platform: 'youtube' }), improveInput({ goal: 'sell' })]) {
    const api = setup();
    assert.ok('error' in await api.improvePublication('owner', malformed));
    assert.equal(api.calls.getVideo.length, 0); assert.equal(api.calls.provider.length, 0);
  }
  for (const patch of [{ userId: 'stranger' }, { deletedAt: 10 }, { status: 'processing' }, { resultUrl: undefined }]) {
    const api = setup({ video: patch });
    assert.ok('error' in await api.improvePublication('owner', improveInput()));
    for (const key of ['context', 'claim', 'reserve', 'provider', 'performance']) assert.equal(api.calls[key].length, 0, key);
  }
});

test('improvement uses the selected owner version and user draft without mutating its input or publishing', async () => {
  const api = setup(), draft = Object.freeze(improveInput({ caption: '  Meu passeio no cafe\u0301 do parque. Qual caminho você escolheria?  ' }));
  const result = await api.improvePublication('owner', draft);
  assert.equal(result.suggestion.method, 'ai'); assert.equal(result.suggestion.caption, generated().caption);
  assert.equal(api.calls.provider[0].currentCaption, 'Meu passeio no café do parque. Qual caminho você escolheria?');
  assert.equal(draft.caption, '  Meu passeio no cafe\u0301 do parque. Qual caminho você escolheria?  ');
  assert.equal(api.calls.influencer[0][0], 'owner'); assert.equal(api.calls.influencer[0][1], 'selected-version');
  assert.equal(api.calls.provider[0].video.influencerId, 'selected-version');
  assert.equal(api.calls.claim[0].slot, 'instagram:comments:improve');
  assert.equal(api.calls.claim[0].expectedResultUrl, 'https://blob.test/complete.mp4');
  assert.equal(api.state.video.caption, undefined, 'suggestion is stored only as a suggestion, not applied as a draft');
});

test('unchanged and canonically equivalent drafts reuse the improvement with no second provider call', async () => {
  const api = setup();
  const first = await api.improvePublication('owner', improveInput({ caption: '  Café de hoje no parque. Qual caminho você escolheria?  ' }));
  const reopened = await api.improvePublication('owner', improveInput({ caption: 'Cafe\u0301 de hoje no parque. Qual caminho você escolheria?' }));
  assert.equal(JSON.stringify(first), JSON.stringify(reopened));
  assert.equal(api.calls.claim[0].fingerprint, api.calls.claim[1].fingerprint);
  assert.equal(api.calls.provider.length, 1); assert.equal(api.calls.reserve.length, 1); assert.equal(api.calls.performance.length, 1);
});

test('changed ready drafts get distinct fingerprints while preparation and improvement caches stay separate', async () => {
  const api = setup();
  await api.preparePublication('owner', input());
  await api.improvePublication('owner', improveInput());
  await api.improvePublication('owner', improveInput({ caption: 'O caminho ganhou outra cor hoje. Você também passeia por aqui?' }));
  assert.deepEqual(api.calls.claim.map(call => call.slot), ['instagram:comments', 'instagram:comments:improve', 'instagram:comments:improve']);
  assert.notEqual(api.calls.claim[1].fingerprint, api.calls.claim[2].fingerprint);
  assert.equal(Object.keys(api.state.video.captionCache).length, 2);
  assert.equal(api.calls.provider.length, 3);
});

test('a live improvement with another caption blocks new work and never applies that older suggestion', async () => {
  let markStarted, releaseProvider;
  const started = new Promise(resolve => { markStarted = resolve; }), waiting = new Promise(resolve => { releaseProvider = resolve; });
  const api = setup({ generate: async () => { markStarted(); return waiting; } });
  const first = api.improvePublication('owner', improveInput());
  await started;
  const changed = await api.improvePublication('owner', improveInput({ caption: 'Outro rascunho diferente, que escrevi enquanto esperava.' }));
  assert.ok('error' in changed); assert.match(changed.error, /andamento/);
  assert.equal(api.calls.provider.length, 1); assert.equal(api.calls.reserve.length, 1);
  releaseProvider(generated());
  assert.ok('suggestion' in await first);
});

test('an expired pending improvement with another caption is retired without new paid work', async () => {
  const api = setup({ video: { captionCache: { 'instagram:comments:improve': { claimId: 'abandoned', state: 'pending', startedAt: 1, fingerprint: 'old-fingerprint', resultUrl: 'https://blob.test/complete.mp4' } } } });
  const result = await api.improvePublication('owner', improveInput());
  assert.ok('error' in result); assert.equal(api.calls.provider.length, 0); assert.equal(api.calls.reserve.length, 0);
  assert.equal(api.state.video.captionCache['instagram:comments:improve'].state, 'ready');
  assert.equal(api.calls.finishError[0].claimId, 'abandoned');
});

test('same-caption concurrent improvements share one paid operation', { timeout: 3000 }, async () => {
  let markStarted, releaseProvider;
  const started = new Promise(resolve => { markStarted = resolve; }), waiting = new Promise(resolve => { releaseProvider = resolve; });
  const api = setup({ generate: async () => { markStarted(); return waiting; } });
  const first = api.improvePublication('owner', improveInput());
  await started;
  const second = api.improvePublication('owner', improveInput());
  queueMicrotask(() => releaseProvider(generated()));
  const results = await Promise.all([first, second]);
  assert.equal(results[0].suggestion.caption, results[1].suggestion.caption);
  assert.equal(api.calls.provider.length, 1); assert.equal(api.calls.reserve.length, 1);
});

test('uncertain improvement failures preserve the draft and terminal error prevents another POST', async () => {
  const api = setup({ generate: () => { throw new Error('PRIVATE_PROVIDER_ERROR accepted then timed out'); } }), draft = improveInput();
  const original = JSON.stringify(draft), first = await api.improvePublication('owner', draft);
  api.advance(86_400_001);
  const reopened = await api.improvePublication('owner', draft);
  assert.ok('error' in first); assert.equal(JSON.stringify(first), JSON.stringify(reopened));
  assert.equal(JSON.stringify(draft), original); assert.doesNotMatch(JSON.stringify(first), /PRIVATE_PROVIDER_ERROR/);
  assert.equal(api.calls.provider.length, 1); assert.equal(api.calls.reserve.length, 1);
  assert.equal(api.state.video.captionCache['instagram:comments:improve'].retryAt, undefined);
  assert.equal(api.state.video.captionCache['instagram:comments:improve'].suggestion, undefined);
});

test('quota failure may retry after its safe deadline but cannot call providers before then', async () => {
  const api = setup({ quota: false });
  const limited = await api.improvePublication('owner', improveInput());
  assert.ok('error' in limited); assert.match(limited.error, /limite/);
  api.state.quota = true;
  assert.equal(JSON.stringify(await api.improvePublication('owner', improveInput())), JSON.stringify(limited));
  assert.equal(api.calls.provider.length, 0); assert.equal(api.calls.reserve.length, 1); assert.equal(api.calls.performance.length, 0);
  api.advance(3_600_001);
  const later = await api.improvePublication('owner', improveInput());
  assert.ok('suggestion' in later); assert.equal(api.calls.provider.length, 1); assert.equal(api.calls.reserve.length, 2);
  const entry = api.state.video.captionCache['instagram:comments:improve'];
  assert.equal(entry.error, undefined); assert.equal(entry.retryAt, undefined);
});

test('no provider key or missing claim cannot reserve improvement quota or submit work', async () => {
  for (const options of [{ env: { FAL_KEY: '' } }, { claimMissing: true }]) {
    const api = setup(options);
    const result = await api.improvePublication('owner', improveInput());
    assert.ok('error' in result); assert.equal(api.calls.provider.length, 0); assert.equal(api.calls.reserve.length, 0);
    assert.equal(api.calls.performance.length, 0); assert.equal(api.calls.finish.length, 0);
  }
});

test('deletion or media replacement during improvement prevents returning and persisting stale suggestions', async () => {
  for (const mutation of [state => { state.video.deletedAt = 100; }, state => { state.video.resultUrl = 'https://blob.test/replacement.mp4'; }]) {
    const api = setup({ generate: (_input, state) => { mutation(state); return generated(); } });
    const result = await api.improvePublication('owner', improveInput());
    assert.ok('error' in result); assert.match(result.error, /vídeo mudou/);
    assert.equal(api.calls.provider.length, 1); assert.equal(api.state.video.captionCache['instagram:comments:improve'].suggestion, undefined);
  }
});

test('media deletion while reading account metrics blocks the paid improvement call', async () => {
  const api = setup({ readPerformance: state => { state.video.deletedAt = 100; return state.performance; } });
  const result = await api.improvePublication('owner', improveInput());
  assert.ok('error' in result); assert.equal(api.calls.provider.length, 0); assert.equal(api.calls.reserve.length, 1);
});

test('TikTok improvement skips Instagram metrics and only verified comparable records inform Instagram drafts', async () => {
  const api = setup({ performance: { status: 'ready', posts: [{ caption: 'Oculto', comments: 1 }, { caption: 'Outro', likes: 2 }, { caption: 'Visível', likes: 5, comments: 2 }], summary: 'Amostra incompleta', recommendations: [] } });
  await api.improvePublication('owner', improveInput());
  assert.equal(api.calls.provider[0].performanceContext, undefined);
  await api.improvePublication('owner', improveInput({ platform: 'tiktok' }));
  assert.equal(api.calls.performance.length, 1);
  assert.equal(api.calls.claim[1].slot, 'tiktok:comments:improve');
});
