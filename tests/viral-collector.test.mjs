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
function loader({ env = {}, mocks = {} } = {}) {
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
    }, process: { env, cwd: () => root }, Buffer, URL, URLSearchParams, AbortSignal, Date, Math, JSON, Promise, Request, Response, Headers, fetch: () => assert.fail("No real network request is permitted"), setTimeout, clearTimeout, console, ...extraGlobals }, { filename: file });
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

function setup(plan = { calls: [] }, env = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-collector-test-"));
  const load = loader({ env: { DATA_DIR: directory } });
  const db = load("src/lib/db.ts");
  const miner = fakeMiner(db, plan);
  const collectorLoad = loader({ env: { DATA_DIR: directory, VIRAL_COLLECTION_ENABLED: "true", ...env }, mocks: { "./miner": miner, "./db": db, "./server-db": { serverDb: () => null } } });
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
    assert.deepEqual(plain(run), { added: 2, metricsUpdated: 0, errors: [], youtube: { skipped: "inactive", added: 0, units: 0 } });
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
function setupYoutube(plan = { calls: [] }, env = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-collector-test-"));
  const load = loader({ env: { DATA_DIR: directory } });
  const db = load("src/lib/db.ts");
  const miner = fakeMiner(db, plan);
  class YoutubeProviderError extends Error { constructor(message, quotaExceeded = false) { super(message); this.quotaExceeded = quotaExceeded; } }
  const youtube = {
    YoutubeProviderError,
    YOUTUBE_QUERIES: ["q1", "q2", "q3", "q4"],
    youtubeConfigured: () => Boolean(env.YOUTUBE_API_KEY),
    async searchYoutubeShorts(query) { plan.calls.push({ kind: "youtube", query }); if (plan.youtubeError) throw plan.youtubeError; return { virals: (plan.youtubeVideos ?? []).map((id) => ({ ...viral(id), source: "youtube", playUrl: "", pageUrl: `https://www.youtube.com/shorts/${id}`, title: "AI influencer character" })), units: 101 }; },
  };
  const collector = loader({ env: { DATA_DIR: directory, VIRAL_COLLECTION_ENABLED: "true", ...env }, mocks: { "./miner": miner, "./db": db, "./server-db": { serverDb: () => null }, "./youtube-discovery": youtube } })("src/lib/viral-collector.ts");
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
    assert.equal(soon.youtube.skipped, "interval", "15 minutes later the hourly budget is respected");
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
    const reset = new Date(t0); reset.setUTCHours(8, 5, 0, 0); if (reset.getTime() <= t0) reset.setUTCDate(reset.getUTCDate() + 1);
    assert.equal((await db.listVirals("AI")).length, 1, "stored videos survive");
    const status = await collector.getCollectorStatus(t0);
    assert.match(status.sources.youtube.lastError, /cota/);
    assert.equal(status.sources.youtube.consecutiveFailures, 1);
    assert.equal(status.sources.youtube.backoffUntil, reset.getTime(), "next attempt after midnight Pacific (08:05 UTC covers PST and PDT)");
    const again = await collector.runViralCollection({ now: t0 + 2 * 60 * 60_000, budgetMs: 10_000 });
    assert.equal(again.youtube.skipped, "backoff");
    assert.equal(plan.calls.filter((call) => call.kind === "youtube").length, 1);
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
