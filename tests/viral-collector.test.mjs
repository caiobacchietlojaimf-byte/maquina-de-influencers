import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url), root = fileURLToPath(new URL("..", import.meta.url));
const plain = (value) => JSON.parse(JSON.stringify(value));

/* Carrega os módulos TS num contexto isolado. O banco é o driver local (JSON
   em pasta temporária); o minerador é substituído por um dublê controlável, então
   nenhuma chamada real ao provedor acontece. */
function loader({ env = {}, mocks = {}, globals = {} } = {}) {
  const cache = new Map();
  function load(file, extraGlobals = {}) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require(id) {
      if (id in mocks) return mocks[id];
      if (id === "server-only" || id === "@supabase/supabase-js") return {};
      if (id.startsWith("./")) return load(path.resolve(path.dirname(file), `${id}.ts`));
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      return require(id);
    }, process: { env, cwd: () => root }, Buffer, URL, URLSearchParams, AbortSignal, Date, Math, JSON, Promise, Request, Response, Headers, fetch: () => assert.fail("No real network request is permitted"), setTimeout, clearTimeout, console, ...globals, ...extraGlobals }, { filename: file });
    return module.exports;
  }
  return load;
}

function cleanup(directory) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.match(path.basename(directory), /^mi-collector-test-/);
  rmSync(directory, { recursive: true });
}

const viral = (videoId, extra = {}) => ({ source: "tiktok", videoId, pageUrl: `https://www.tiktok.com/@moroniduarte/video/${videoId}`, playUrl: "https://media.example/v.mp4", coverUrl: "", title: `Rolê ${videoId}`, authorName: "Morôni Duarte", authorHandle: "moroniduarte", duration: 12, views: 100, likes: 5, comments: 1, shares: 0, region: "AI", minedAt: Date.now(), ...extra });

/** Dublê do minerador: controla descoberta, renovação e falhas, sem rede. */
function fakeMiner(db, plan) {
  class MiningProviderError extends Error { constructor(message, unavailable = false) { super(message); this.unavailable = unavailable; } }
  return {
    MiningProviderError,
    async listAiVirals() { return db.listVirals("AI"); },
    async mineTrending(_region, options) { plan.calls.push({ kind: "discover", cursors: options?.cursors }); if (plan.gate) await plan.gate; if (plan.discoverError) throw plan.discoverError; const added = await db.upsertVirals(plan.discovered ?? []); return { added, cursors: plan.nextCursors ?? {}, hasMore: Boolean(plan.nextCursors && Object.keys(plan.nextCursors).length) }; },
    async refreshViralMedia(item) { plan.calls.push({ kind: "refresh", videoId: item.videoId }); if (plan.refreshError) throw plan.refreshError; const refreshed = { ...item, views: item.views + 1000, metricsUpdatedAt: Date.now() }; await db.upsertVirals([refreshed]); return refreshed; },
  };
}

/** Dublê do Instagram: sem conta por padrão; o plano pode fornecer conta e rodadas. */
function fakeInstagram(plan) {
  return {
    async instagramDiscoveryAccount() { return plan.instagramAccount ?? null; },
    async runInstagramDiscovery(options) { plan.calls.push({ kind: "instagram", now: options?.now }); if (!plan.instagramAccount) return null; return plan.instagramRound ?? { account: plan.instagramAccount.username, added: 0, profiles: [], errors: [] }; },
  };
}

function setup(plan = { calls: [] }, env = {}, extraMocks = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-collector-test-"));
  const load = loader({ env: { DATA_DIR: directory } });
  const db = load("src/lib/db.ts");
  const miner = fakeMiner(db, plan);
  const collectorLoad = loader({ env: { DATA_DIR: directory, VIRAL_COLLECTION_ENABLED: "true", TIKTOK_DISCOVERY_ENABLED: "true", ...env }, mocks: { "./miner": miner, "./db": db, "./server-db": { serverDb: () => null }, "./instagram-discovery": fakeInstagram(plan), ...extraMocks } });
  const collector = collectorLoad("src/lib/viral-collector.ts");
  return { directory, db, collector, plan, miner };
}

test("discovery dates survive metric updates and new rows get one", async () => {
  const { directory, db } = setup();
  try {
    const t0 = 1_700_000_000_000;
    await db.upsertVirals([viral("1", { minedAt: t0 })]);
    const first = (await db.listVirals("AI"))[0];
    assert.equal(first.discoveredAt, t0);
    await db.upsertVirals([viral("1", { minedAt: t0 + 60_000, views: 999 })]);
    const [after] = await db.listVirals("AI");
    assert.equal(after.discoveredAt, t0, "discovery date never moves");
    assert.equal(after.views, 999, "metrics do update");
    assert.equal(after.minedAt, t0 + 60_000);
  } finally { cleanup(directory); }
});

test("a successful run records the attempt, success, new count and resets exhausted cursors", async () => {
  const plan = { calls: [], discovered: [viral("10"), viral("11")], nextCursors: {} };
  const { directory, collector } = setup(plan);
  try {
    const run = await collector.runViralCollection({ budgetMs: 5_000 });
    assert.deepEqual(plain(run), { added: 2, metricsUpdated: 0, errors: [], youtube: { skipped: "inactive", added: 0, units: 0 }, instagram: { skipped: "catalog", added: 0, profiles: 0, failed: 0 } });
    const status = await collector.getCollectorStatus();
    assert.ok(status.sources.tiktok.lastAttemptAt && status.sources.tiktok.lastSuccessAt);
    assert.equal(status.sources.tiktok.lastAdded, 2);
    assert.equal(status.sources.tiktok.consecutiveFailures, 0);
    assert.equal(status.sources.instagram.mode, "catalog");
    assert.equal(status.running, false);
    assert.equal("cursors" in status.sources.tiktok, false, "cursors stay internal");
    // Repeating the same discovery adds nothing: deduplicated by platform id.
    const again = await collector.runViralCollection({ budgetMs: 5_000 });
    assert.equal(again.added, 0);
  } finally { cleanup(directory); }
});

test("pagination continues from the stored cursor on the next run", async () => {
  const plan = { calls: [], discovered: [viral("20")], nextCursors: { moroniduarte: "40" } };
  const { directory, collector } = setup(plan);
  try {
    await collector.runViralCollection({ budgetMs: 5_000 });
    plan.nextCursors = {};
    await collector.runViralCollection({ budgetMs: 5_000 });
    const discoverCalls = plan.calls.filter((call) => call.kind === "discover");
    assert.equal(discoverCalls[0].cursors, undefined, "first run starts from the beginning");
    assert.deepEqual(plain(discoverCalls[1].cursors), { moroniduarte: "40" }, "second run resumes the saved page");
  } finally { cleanup(directory); }
});

test("a provider failure keeps the stored videos, records the error and backs off when blocked", async () => {
  const plan = { calls: [], discovered: [viral("30")], nextCursors: {} };
  const { directory, db, collector, miner } = setup(plan);
  try {
    await collector.runViralCollection({ budgetMs: 5_000 });
    assert.equal((await db.listVirals("AI")).length, 1);
    plan.discoverError = new miner.MiningProviderError("bloqueado", true);
    const run = await collector.runViralCollection({ budgetMs: 5_000 });
    assert.deepEqual(plain(run.errors), ["bloqueado"]);
    assert.equal((await db.listVirals("AI")).length, 1, "existing content is never deleted on failure");
    const status = await collector.getCollectorStatus();
    assert.equal(status.sources.tiktok.lastError, "bloqueado");
    assert.equal(status.sources.tiktok.consecutiveFailures, 1);
    assert.ok(status.sources.tiktok.backoffUntil > Date.now(), "blocked provider triggers a backoff");
    assert.ok(status.sources.tiktok.lastSuccessAt, "the last real success stays visible");
    const skipped = await collector.runViralCollection({ budgetMs: 5_000 });
    assert.equal(skipped.skipped, "backoff");
    assert.equal(plan.calls.filter((call) => call.kind === "discover").length, 2, "no provider call during backoff");
  } finally { cleanup(directory); }
});

test("overlapping runs are skipped by the lease and the lease is released afterwards", async () => {
  const plan = { calls: [], discovered: [], nextCursors: {} };
  const { directory, collector } = setup(plan);
  try {
    let release;
    plan.gate = new Promise((resolve) => { release = resolve; });
    // First run blocks inside discovery until we release it; the second must be skipped.
    const slow = collector.runViralCollection({ budgetMs: 5_000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await collector.runViralCollection({ budgetMs: 5_000 });
    assert.equal(second.skipped, "locked");
    release();
    plan.gate = undefined;
    await slow;
    const after = await collector.runViralCollection({ budgetMs: 5_000 });
    assert.equal(after.skipped, undefined, "lease released after the first run");
  } finally { cleanup(directory); }
});

test("metrics refresh targets recent TikTok videos with the oldest metrics and marks repeated failures", async () => {
  const plan = { calls: [], discovered: [], nextCursors: {} };
  const { directory, db, collector } = setup(plan);
  try {
    const now = Date.now();
    await db.upsertVirals([
      viral("40", { minedAt: now - 2 * 24 * 3_600_000, metricsUpdatedAt: now - 2 * 24 * 3_600_000 }),
      viral("41", { minedAt: now - 1 * 3_600_000, metricsUpdatedAt: now - 1 * 3_600_000 }),
      viral("42", { minedAt: now - 30 * 24 * 3_600_000, metricsUpdatedAt: now - 30 * 24 * 3_600_000 }),
      { ...viral("43", { minedAt: now - 24 * 3_600_000 }), source: "instagram", videoId: undefined, pageUrl: "https://www.instagram.com/reel/abc/" },
    ]);
    const candidates = collector.pickMetricsCandidates(await db.listVirals("AI"), now);
    assert.deepEqual(plain(candidates.map((item) => item.videoId)), ["40"], "only recent TikTok videos with stale metrics");
    const run = await collector.runViralCollection({ budgetMs: 5_000 });
    assert.equal(run.metricsUpdated, 1);
    assert.equal((await db.listVirals("AI")).find((item) => item.videoId === "40").views, 1100, "metrics refreshed from the provider");
    plan.refreshError = new Error("not found");
    for (let i = 0; i < 3; i++) {
      await db.upsertVirals([{ ...(await db.listVirals("AI")).find((item) => item.videoId === "40"), metricsUpdatedAt: now - 2 * 24 * 3_600_000 }]);
      await collector.runViralCollection({ budgetMs: 5_000 });
    }
    const gone = (await db.listVirals("AI")).find((item) => item.videoId === "40");
    assert.equal(gone.checkFailures, 3);
    assert.ok(gone.unavailableAt, "three failed checks mark the video unavailable, without deleting it");
  } finally { cleanup(directory); }
});

test("new-since-last-visit counts discoveries after the visit and ignores unavailable videos", async () => {
  const plan = { calls: [], discovered: [], nextCursors: {} };
  const { directory, db, collector } = setup(plan);
  try {
    const visit = Date.now() - 10 * 60_000;
    await db.upsertVirals([viral("50", { minedAt: visit - 60_000 }), viral("51", { minedAt: visit + 60_000 }), viral("52", { minedAt: visit + 120_000, unavailableAt: Date.now() })]);
    assert.equal(await collector.countNewVirals(visit), 1);
    const status = await collector.getCollectorStatus();
    assert.equal(collector.collectionOverdue(status), true, "no attempt yet means overdue");
  } finally { cleanup(directory); }
});

/* YouTube: fonte oficial, só quando configurada; uma rodada por hora; cota esgotada espera a virada do dia. */
function setupYoutube(plan = { calls: [] }, env = {}, channels = []) {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-collector-test-"));
  const load = loader({ env: { DATA_DIR: directory } });
  const db = load("src/lib/db.ts");
  const miner = fakeMiner(db, plan);
  class YoutubeProviderError extends Error { constructor(message, quotaExceeded = false) { super(message); this.quotaExceeded = quotaExceeded; } }
  const youtube = {
    YoutubeProviderError,
    YOUTUBE_QUERIES: ["q1", "q2", "q3", "q4"],
    youtubeConfigured: () => Boolean(env.YOUTUBE_API_KEY),
    async fetchChannelShorts(channelId) { plan.calls.push({ kind: "feed", channelId }); if (plan.feedError?.[channelId]) throw plan.feedError[channelId]; return (plan.feedVideos?.[channelId] ?? []).map((id) => ({ ...viral(id), source: "youtube", playUrl: "", pageUrl: `https://www.youtube.com/shorts/${id}`, authorHandle: channelId, title: "Cena do canal" })); },
    async searchYoutubeShorts(query) { plan.calls.push({ kind: "youtube", query }); if (plan.youtubeError) throw plan.youtubeError; return { virals: (plan.youtubeVideos ?? []).map((id) => ({ ...viral(id), source: "youtube", playUrl: "", pageUrl: `https://www.youtube.com/shorts/${id}`, title: "AI influencer character" })), units: 101 }; },
  };
  const collector = loader({ env: { DATA_DIR: directory, VIRAL_COLLECTION_ENABLED: "true", TIKTOK_DISCOVERY_ENABLED: "true", ...env }, mocks: { "./miner": miner, "./db": db, "./server-db": { serverDb: () => null }, "./youtube-discovery": youtube, "@/data/youtube-channels": { YOUTUBE_AI_CHANNELS: channels }, "./instagram-discovery": fakeInstagram(plan) } })("src/lib/viral-collector.ts");
  return { directory, db, collector, plan, YoutubeProviderError };
}

test("a key alone does not enable YouTube: the explicit flag is required", async () => {
  const { directory, collector, plan } = setupYoutube({ calls: [] }, { YOUTUBE_API_KEY: "test-key" });
  try {
    const run = await collector.runViralCollection({ budgetMs: 10_000 });
    assert.equal(run.youtube.skipped, "inactive");
    assert.equal(plan.calls.filter((call) => call.kind === "youtube").length, 0);
    assert.equal((await collector.getCollectorStatus()).sources.youtube.mode, "inactive");
  } finally { cleanup(directory); }
});

test("without a key the YouTube source is inactive and never queried", async () => {
  const { directory, collector, plan } = setupYoutube();
  try {
    const run = await collector.runViralCollection({ budgetMs: 10_000 });
    assert.deepEqual(plain(run.youtube), { skipped: "inactive", added: 0, units: 0 });
    assert.equal(plan.calls.filter((call) => call.kind === "youtube").length, 0);
    const status = await collector.getCollectorStatus();
    assert.equal(status.sources.youtube.mode, "inactive");
  } finally { cleanup(directory); }
});

test("with a key YouTube runs two queries per hour, rotates terms and records per-source status", async () => {
  const plan = { calls: [], youtubeVideos: ["yt1", "yt2"] };
  const { directory, db, collector } = setupYoutube(plan, { YOUTUBE_API_KEY: "test-key", YOUTUBE_DISCOVERY_ENABLED: "true" });
  try {
    const t0 = Date.now() - 3 * 60 * 60_000;
    const budgetMs = 6 * 60 * 60_000;
    const first = await collector.runViralCollection({ now: t0, budgetMs });
    assert.deepEqual(plan.calls.filter((call) => call.kind === "youtube").map((call) => call.query), ["q1", "q2"]);
    assert.deepEqual(plain(first.youtube), { added: 2, units: 202 });
    assert.equal((await db.listVirals("AI")).filter((row) => row.source === "youtube").length, 2);
    let status = await collector.getCollectorStatus(t0);
    assert.equal(status.sources.youtube.mode, "discovery");
    assert.equal(status.sources.youtube.lastAdded, 2);
    assert.ok(status.sources.youtube.lastSuccessAt >= t0);

    const soon = await collector.runViralCollection({ now: t0 + 15 * 60_000, budgetMs });
    assert.equal(soon.youtube.skipped, undefined, "the round still runs (public feeds), but the search waits for the hourly budget");
    assert.equal(plan.calls.filter((call) => call.kind === "youtube").length, 2);

    plan.youtubeVideos = ["yt2", "yt3"];
    const later = await collector.runViralCollection({ now: t0 + 61 * 60_000, budgetMs });
    assert.deepEqual(plan.calls.filter((call) => call.kind === "youtube").map((call) => call.query), ["q1", "q2", "q3", "q4"], "next hour continues with the remaining terms");
    assert.equal(later.youtube.added, 1, "already known videos are updated, not re-added");
    status = await collector.getCollectorStatus(t0 + 61 * 60_000);
    assert.equal(status.sources.youtube.lastAdded, 1);
  } finally { cleanup(directory); }
});

test("YouTube quota exhaustion keeps the collection, records the error and waits for the daily reset", async () => {
  const plan = { calls: [] };
  const { directory, db, collector, YoutubeProviderError } = setupYoutube(plan, { YOUTUBE_API_KEY: "test-key", YOUTUBE_DISCOVERY_ENABLED: "true" });
  try {
    await db.upsertVirals([{ ...viral("yt0"), source: "youtube", playUrl: "", pageUrl: "https://www.youtube.com/shorts/yt0" }]);
    plan.youtubeError = new YoutubeProviderError("A cota diária da API do YouTube acabou; a coleta continua amanhã.", true);
    const t0 = Date.now();
    const run = await collector.runViralCollection({ now: t0, budgetMs: 10_000 });
    assert.equal(run.errors.some((message) => message.startsWith("YouTube:")), true, JSON.stringify(run));
    assert.equal((await db.listVirals("AI")).length, 1, "stored videos survive");
    const status = await collector.getCollectorStatus(t0);
    assert.match(status.sources.youtube.lastError, /cota/);
    assert.equal(status.sources.youtube.backoffUntil, undefined, "quota only pauses the search, never the public feeds");
    const again = await collector.runViralCollection({ now: t0 + 60_000, budgetMs: 10_000 });
    assert.equal(again.youtube.skipped, undefined);
    assert.equal(plan.calls.filter((call) => call.kind === "youtube").length, 1, "the search waits for the daily reset");
  } finally { cleanup(directory); }
});

test("without a key, public channel feeds feed the collection in rotation", async () => {
  const channels = Array.from({ length: 10 }, (_, i) => ({ id: `UC${String(i).padStart(22, "0")}`, name: `Canal ${i}` }));
  const plan = { calls: [], feedVideos: { [channels[0].id]: ["f1", "f2"], [channels[9].id]: ["f9"] } };
  const { directory, db, collector } = setupYoutube(plan, { YOUTUBE_DISCOVERY_ENABLED: "true" }, channels);
  try {
    const t0 = Date.now();
    const first = await collector.runViralCollection({ now: t0, budgetMs: 10_000 });
    assert.deepEqual(plan.calls.filter((call) => call.kind === "feed").map((call) => call.channelId), channels.slice(0, 8).map((channel) => channel.id), "8 channels per round");
    assert.equal(plan.calls.filter((call) => call.kind === "youtube").length, 0, "no key, no search");
    assert.equal(first.youtube.added, 2);
    assert.equal((await collector.getCollectorStatus(t0)).sources.youtube.mode, "discovery");

    await collector.runViralCollection({ now: t0 + 15 * 60_000, budgetMs: 10_000 });
    assert.deepEqual(plan.calls.filter((call) => call.kind === "feed").slice(8).map((call) => call.channelId), [8, 9, 0, 1, 2, 3, 4, 5].map((i) => channels[i].id), "next round continues the rotation");
    assert.equal((await db.listVirals("AI")).filter((row) => row.source === "youtube").length, 3);
  } finally { cleanup(directory); }
});

test("one broken feed does not stop the others; all failing backs off", async () => {
  const channels = [{ id: `UC${"a".repeat(22)}`, name: "A" }, { id: `UC${"b".repeat(22)}`, name: "B" }];
  const plan = { calls: [], feedVideos: { [channels[1].id]: ["ok1"] }, feedError: { [channels[0].id]: new Error("Feed do YouTube indisponível (HTTP 500).") } };
  const { directory, collector } = setupYoutube(plan, { YOUTUBE_DISCOVERY_ENABLED: "true" }, channels);
  try {
    const t0 = Date.now();
    const run = await collector.runViralCollection({ now: t0, budgetMs: 10_000 });
    assert.equal(run.youtube.added, 1);
    let status = await collector.getCollectorStatus(t0);
    assert.equal(status.sources.youtube.consecutiveFailures, 0);
    assert.match(status.sources.youtube.lastError, /HTTP 500/);

    plan.feedError[channels[1].id] = new Error("Feed do YouTube indisponível (HTTP 500).");
    await collector.runViralCollection({ now: t0 + 15 * 60_000, budgetMs: 10_000 });
    status = await collector.getCollectorStatus(t0 + 15 * 60_000);
    assert.equal(status.sources.youtube.consecutiveFailures, 1);
    assert.ok(status.sources.youtube.backoffUntil > t0 + 15 * 60_000);
  } finally { cleanup(directory); }
});

/* Trava de ativação: desligada por padrão, nada consulta provedores. */
test("collection is off by default: the run ends before any provider call, lock or state write", async () => {
  for (const value of [undefined, "", "false", "TRUE ", "1", "yes"]) {
    const plan = { calls: [], discovered: [viral("x")] };
    const { directory, db, collector } = setup(plan, { VIRAL_COLLECTION_ENABLED: value });
    try {
      const run = await collector.runViralCollection({ budgetMs: 10_000 });
      const enabled = value === "TRUE ";
      if (enabled) assert.equal(run.skipped, undefined, "the trimmed, case-insensitive true value enables it");
      else {
        assert.deepEqual(plain(run), { skipped: "disabled", added: 0, metricsUpdated: 0, errors: [] }, `value ${JSON.stringify(value)}`);
        assert.equal(plan.calls.length, 0, "no discovery, refresh or YouTube call");
        assert.equal((await db.listVirals("AI")).length, 0, "nothing stored");
        assert.equal(existsSync(path.join(directory, "viral-collector.json")), false, "no lease or state written");
      }
      const status = await collector.getCollectorStatus();
      assert.equal(status.enabled, enabled);
      if (!enabled) assert.equal(collector.collectionOverdue(status), false, "a disabled collector is never overdue, so the page never runs a safety-net round");
    } finally { cleanup(directory); }
  }
});

test("the cron endpoint answers without consulting providers while collection is disabled", async () => {
  const plan = { calls: [], discovered: [viral("x")] };
  const { directory, collector } = setup(plan, { VIRAL_COLLECTION_ENABLED: "false", CRON_SECRET: "s3cret" });
  try {
    const route = loader({ env: { DATA_DIR: directory, VIRAL_COLLECTION_ENABLED: "false", CRON_SECRET: "s3cret" }, mocks: { "@/lib/viral-collector": collector } })("src/app/api/cron/virals/route.ts");
    const denied = await route.GET(new Request("https://example.test/api/cron/virals"));
    assert.equal(denied.status, 401);
    const response = await route.GET(new Request("https://example.test/api/cron/virals", { headers: { authorization: "Bearer s3cret" } }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, skipped: "disabled", added: 0, metricsUpdated: 0, errors: [] });
    assert.equal(plan.calls.length, 0, "the declared cron fires, but no provider is consulted");
  } finally { cleanup(directory); }
});

test("the local scheduler registers no collection timer while collection is disabled", async () => {
  const timers = [];
  const load = loader({ env: { VIRAL_COLLECTION_ENABLED: "false", NEXT_RUNTIME: "nodejs" }, mocks: { "./lib/publisher": { publisherTick: async () => undefined }, "./lib/viral-collector": { collectionEnabled: () => false, runViralCollection: async () => assert.fail("must not run"), COLLECT_INTERVAL_MS: 1 } } });
  const instrumentation = load("src/instrumentation.ts", { setInterval: (fn, ms) => { timers.push(ms); return 0; }, setTimeout: (fn, ms) => { timers.push(ms); return 0; } });
  await instrumentation.register();
  assert.deepEqual(timers, [60_000], "only the publisher tick is scheduled");
});

/* TikTok desligado por padrão (fonte bloqueada): nenhuma consulta repetida. */
test("TikTok discovery stays off unless TIKTOK_DISCOVERY_ENABLED=true, with an explicit reason in the status", async () => {
  const plan = { calls: [], discovered: [viral("x")] };
  const { directory, collector } = setup(plan, { TIKTOK_DISCOVERY_ENABLED: "false" });
  try {
    const run = await collector.runViralCollection({ budgetMs: 10_000 });
    assert.equal(run.skipped, undefined, "the round itself runs (Instagram/YouTube may be active)");
    assert.equal(plan.calls.filter((call) => call.kind === "discover").length, 0, "no tikwm query");
    const status = await collector.getCollectorStatus();
    assert.equal(status.sources.tiktok.mode, "inactive");
    assert.match(status.sources.tiktok.reason, /403/);
    assert.equal(status.sources.tiktok.lastAttemptAt, undefined, "a disabled source never records an attempt");
    assert.equal(collector.collectionOverdue(status), false, "no active source → never overdue");
  } finally { cleanup(directory); }
});

/* Instagram pela API oficial: rodada registrada no estado por fonte. */
test("an Instagram round through the official API is recorded per source and counted in the run", async () => {
  const plan = { calls: [], instagramAccount: { username: "pulse.coding" }, instagramRound: { account: "pulse.coding", added: 3, profiles: [{ username: "moroniduarte", ok: true, videos: 12 }, { username: "red_cresty", ok: false, videos: 0, error: "não é conta profissional" }], errors: ["@red_cresty: não é conta profissional"] } };
  const { directory, collector } = setup(plan, { TIKTOK_DISCOVERY_ENABLED: "false" });
  try {
    const t0 = Date.now();
    const run = await collector.runViralCollection({ now: t0, budgetMs: 10_000 });
    assert.deepEqual(plain(run.instagram), { added: 3, profiles: 1, failed: 1 });
    assert.equal(run.added, 3);
    assert.deepEqual(plain(run.errors), ["Instagram @red_cresty: não é conta profissional"]);
    const status = await collector.getCollectorStatus(t0);
    assert.equal(status.sources.instagram.mode, "discovery");
    assert.equal(status.sources.instagram.account, "pulse.coding");
    assert.equal(status.sources.instagram.lastAttemptAt, t0);
    assert.ok(status.sources.instagram.lastSuccessAt >= t0);
    assert.equal(status.sources.instagram.lastAdded, 3);
    assert.equal(status.sources.instagram.reason, undefined);
    assert.equal(collector.collectionOverdue(status, t0 + 10 * 60_000), false);
    assert.equal(collector.collectionOverdue(status, t0 + 40 * 60_000), true, "overdue follows the active source");

    plan.instagramRound = { account: "pulse.coding", added: 0, profiles: [], errors: ["A autorização do Instagram expirou"], failure: "auth" };
    await collector.runViralCollection({ now: t0 + 15 * 60_000, budgetMs: 10_000 });
    const after = await collector.getCollectorStatus(t0 + 15 * 60_000);
    assert.match(after.sources.instagram.lastError, /expirou/);
    assert.equal(after.sources.instagram.backoffUntil, undefined, "an expired authorization is not retried with backoff; it needs a reconnect");
    assert.equal(after.sources.instagram.lastSuccessAt >= t0, true, "the previous success stays visible");

    plan.instagramRound = { account: "pulse.coding", added: 0, profiles: [], errors: ["limitou"], failure: "rate" };
    await collector.runViralCollection({ now: t0 + 30 * 60_000, budgetMs: 10_000 });
    const limited = await collector.getCollectorStatus(t0 + 30 * 60_000);
    assert.ok(limited.sources.instagram.backoffUntil > t0 + 30 * 60_000, "rate limiting backs off");
    const skipped = await collector.runViralCollection({ now: t0 + 31 * 60_000, budgetMs: 10_000 });
    assert.equal(skipped.instagram.skipped, "backoff");
  } finally { cleanup(directory); }
});

/* Mapeamento e rodada real contra um Graph API simulado (sem rede). */
function setupInstagram(responses, env = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-collector-test-"));
  const requests = [];
  const fetchMock = async (url, init) => {
    requests.push({ url: String(url), auth: init?.headers?.Authorization });
    const username = /username\(([^)]+)\)/.exec(decodeURIComponent(String(url)))?.[1];
    const reply = responses[username] ?? { status: 400, body: { error: { message: "Unsupported get request", code: 100 } } };
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  };
  const load = loader({ env: { DATA_DIR: directory, ADMIN_USER_IDS: "admin-1", ...env }, mocks: { "./social": { freshSocialAccount: async (account) => account }, "./social-token": { openSocialToken: () => "token-abc", sealSocialToken: (token) => token } }, globals: { fetch: fetchMock } });
  const db = load("src/lib/db.ts");
  const instagram = load("src/lib/instagram-discovery.ts");
  return { directory, db, instagram, requests };
}
const media = (code, extra = {}) => ({ id: `1789${code.length}`, caption: `Personagem de IA no rolê #ai\nsegunda linha`, media_type: "VIDEO", media_url: `https://scontent.cdninstagram.com/v/${code}.mp4`, thumbnail_url: `https://scontent.cdninstagram.com/v/${code}.jpg`, permalink: `https://www.instagram.com/reel/${code}/`, timestamp: "2026-10-19T18:00:00+0000", like_count: 120, comments_count: 4, view_count: 9000, ...extra });

test("Instagram media maps to catalog-compatible videos: reel link, caption title, official metrics and dates", () => {
  const { directory, instagram } = setupInstagram({});
  try {
    const item = instagram.toInstagramViral("moroniduarte", "Morôni Duarte", media("DeXYZ123"), 1_700_000_000_000);
    assert.equal(item.source, "instagram");
    assert.equal(item.pageUrl, "https://www.instagram.com/reel/DeXYZ123/", "same shape as the catalog, so duplicates merge");
    assert.equal(item.title, "Personagem de IA no rolê #ai");
    assert.deepEqual([item.views, item.likes, item.comments], [9000, 120, 4]);
    assert.equal(item.publishedAt, Date.parse("2026-10-19T18:00:00+0000"));
    assert.equal(item.minedAt, 1_700_000_000_000);
    assert.equal(instagram.toInstagramViral("x", undefined, media("A", { media_type: "IMAGE" })), null, "photos are ignored");
    assert.equal(instagram.toInstagramViral("x", undefined, media("B", { permalink: "https://evil.example/reel/B/" })), null, "foreign links are ignored");
    const bare = instagram.toInstagramViral("x", undefined, media("C", { caption: "", media_url: undefined, permalink: "https://www.instagram.com/p/C/" }));
    assert.equal(bare.title, "Reel de @x");
    assert.equal(bare.playUrl, "", "missing media_url (licensed audio / downloads off) stays empty, never invented");
    assert.equal(bare.pageUrl, "https://www.instagram.com/reel/C/");
  } finally { cleanup(directory); }
});

test("a real-shaped business_discovery round stores new reels, deduplicates against the catalog and reports per profile", async () => {
  const responses = {
    moroniduarte: { body: { business_discovery: { username: "moroniduarte", name: "Morôni Duarte", followers_count: 308000, media: { data: [media("DeBwwYiIO-F", { view_count: 7500000 }), media("NEWCODE01"), media("PHOTO1", { media_type: "IMAGE" })] } }, id: "1784" } },
    red_cresty: { status: 400, body: { error: { message: "(#100) Unsupported get request. Object with ID 'red_cresty' does not exist", code: 100 } } },
  };
  const { directory, db, instagram, requests } = setupInstagram(responses);
  try {
    assert.equal(await instagram.instagramDiscoveryAccount(), null, "no connected admin account → no reading");
    assert.equal(await instagram.runInstagramDiscovery(), null);
    await db.upsertSocialAccount({ userId: "admin-1", platform: "instagram", status: "connected", username: "pulse.coding", accessToken: "enc:v1:x", igUserId: "17841400000", oauthProvider: "instagram", providerUserId: "17841400000", scopes: ["instagram_business_basic", "instagram_business_content_publish"], connectedAt: Date.now(), expiresAt: Date.now() + 30 * 86400000 });
    // Catálogo já tem o Reel DeBwwYiIO-F com arquivo local.
    await db.upsertVirals([{ source: "instagram", pageUrl: "https://www.instagram.com/reel/DeBwwYiIO-F/", playUrl: "/reel-videos/DeBwwYiIO-F.mp4", coverUrl: "/reel-thumbs/DeBwwYiIO-F.jpg", title: "Trend em alta do perfil", authorName: "Morôni Duarte", authorHandle: "moroniduarte", duration: 21, views: 7400000, likes: 245000, comments: 3240, shares: 0, region: "AI", minedAt: 0 }]);
    const round = await instagram.runInstagramDiscovery({ now: 1_800_000_000_000, profiles: ["moroniduarte", "red_cresty"] });
    assert.equal(round.account, "pulse.coding");
    assert.deepEqual(plain(round.profiles), [{ username: "moroniduarte", ok: true, videos: 2, followers: 308000 }, { username: "red_cresty", ok: false, videos: 0, error: "O Instagram recusou a consulta: (#100) Unsupported get request. Object with ID 'red_cresty' does not exist" }]);
    assert.equal(round.added, 1, "one new reel; the catalog one is an update, not a duplicate");
    assert.equal(round.failure, undefined, "a profile that is not professional does not stop the round");
    const rows = plain(await db.listVirals("AI"));
    assert.equal(rows.length, 2);
    const known = rows.find((row) => row.pageUrl.includes("DeBwwYiIO-F"));
    assert.equal(known.views, 7500000, "official metrics refresh the catalog row");
    assert.equal(known.discoveredAt, undefined, "catalog rows never gain a discovery date");
    const fresh = rows.find((row) => row.pageUrl.includes("NEWCODE01"));
    assert.equal(fresh.discoveredAt, 1_800_000_000_000);
    assert.equal(fresh.publishedAt, Date.parse("2026-10-19T18:00:00+0000"));
    assert.equal(requests.length, 2);
    assert.ok(requests.every((request) => request.url.startsWith("https://graph.instagram.com/v24.0/17841400000?") && request.auth === "Bearer token-abc"));
    assert.ok(requests[0].url.includes("business_discovery.username(moroniduarte)") || decodeURIComponent(requests[0].url).includes("business_discovery.username(moroniduarte)"));
  } finally { cleanup(directory); }
});

test("an expired Instagram authorization or rate limit ends the round with the right failure kind", async () => {
  const { directory, db, instagram } = setupInstagram({ moroniduarte: { status: 401, body: { error: { message: "Invalid OAuth access token", code: 190 } } }, moroniceee: { body: { business_discovery: { media: { data: [media("Z1")] } } } } });
  try {
    await db.upsertSocialAccount({ userId: "admin-1", platform: "instagram", status: "connected", username: "pulse.coding", accessToken: "enc:v1:x", igUserId: "17841400000", oauthProvider: "instagram", providerUserId: "17841400000", scopes: ["instagram_business_basic"], connectedAt: Date.now(), expiresAt: Date.now() + 30 * 86400000 });
    const round = await instagram.runInstagramDiscovery({ profiles: ["moroniduarte", "moroniceee"] });
    assert.equal(round.failure, "auth");
    assert.equal(round.profiles.length, 1, "stops at the first authorization failure instead of repeating blocked calls");
    assert.match(round.errors[0], /Reconecte/);
    assert.equal((await db.listVirals("AI")).length, 0);
  } finally { cleanup(directory); }
});
