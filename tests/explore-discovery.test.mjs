import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

/* Descobrir personagens IA, tendências descobertas × efeitos executáveis e
   dedupe com o catálogo. Tudo roda sobre módulos TS em contexto isolado,
   sem rede e sem geração paga. */

const require = createRequire(import.meta.url), root = fileURLToPath(new URL("..", import.meta.url));
const plain = (value) => JSON.parse(JSON.stringify(value));

function loader({ env = {}, mocks = {} } = {}) {
  const cache = new Map();
  function load(file) {
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
    }, process: { env, cwd: () => root }, Buffer, URL, URLSearchParams, AbortSignal, Date, Math, JSON, Promise, Set, Map, fetch: () => assert.fail("No real network request is permitted"), setTimeout, clearTimeout, console }, { filename: file });
    return module.exports;
  }
  return load;
}

function cleanup(directory) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.match(path.basename(directory), /^mi-explore-test-/);
  rmSync(directory, { recursive: true });
}

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
let counter = 0;
const viral = (extra = {}) => ({ id: `v${++counter}`, source: "tiktok", videoId: String(7_000_000_000_000 + counter), pageUrl: `https://www.tiktok.com/@autor/video/${7_000_000_000_000 + counter}`, playUrl: "https://media.example/v.mp4", coverUrl: "https://media.example/c.jpg", title: "Personagem de IA no rolê", authorName: "Autor", authorHandle: "autor", duration: 12, views: 0, likes: 0, comments: 0, shares: 0, region: "AI", minedAt: NOW - HOUR, discoveredAt: NOW - HOUR, ...extra });

const load = loader();
const { groupCharacters } = load("src/lib/character-discovery.ts");
const { buildCharacterSections, viralItem, postItem } = load("src/lib/explore-items.ts");
const { discoveredTrends, listExecutableEffects, isExecutableEffect, effectRelevance } = load("src/lib/effects-catalog.ts");
const { VIRAL_EFFECTS } = load("src/data/viral-effects.ts");
const { AI_PROFILES } = load("src/data/ai-profiles.ts");
const { durationLabel } = load("src/lib/explore-format.ts");
const { toYoutubeViral, parseIsoDuration } = load("src/lib/youtube-discovery.ts");

test("new videos since the last visit are flagged; catalog entries never are", () => {
  const seenAt = NOW - 2 * HOUR;
  const fresh = viralItem(viral({ discoveredAt: NOW - HOUR }), seenAt);
  const old = viralItem(viral({ discoveredAt: NOW - 3 * HOUR, minedAt: NOW - 3 * HOUR }), seenAt);
  const catalog = viralItem(viral({ minedAt: 0, discoveredAt: undefined }), seenAt);
  const unavailable = viralItem(viral({ discoveredAt: NOW - HOUR, unavailableAt: NOW }), seenAt);
  assert.equal(fresh.isNew, true);
  assert.equal(old.isNew, false);
  assert.equal(catalog.isNew, false);
  assert.equal(catalog.origin, "catalog");
  assert.equal(catalog.discoveredAt, undefined, "catalog has no discovery date to show");
  assert.equal(unavailable.isNew, false);
  assert.equal(viralItem(viral(), null).isNew, false, "first visit has no baseline");
});

test("missing metrics stay absent instead of becoming zero", () => {
  const item = viralItem(viral({ views: 0, likes: 0, comments: 0, duration: 0 }), null);
  assert.equal("views" in item, false);
  assert.equal("likes" in item, false);
  assert.equal("comments" in item, false);
  assert.equal("duration" in item, false);
  const rich = viralItem(viral({ views: 1200, likes: 30, metricsUpdatedAt: NOW, publishedAt: NOW - 5 * HOUR }), null);
  assert.deepEqual([rich.views, rich.likes, rich.metricsAt, rich.publishedAt], [1200, 30, NOW, NOW - 5 * HOUR]);
});

test("profiles are grouped by evidence from the source, never by appearance", () => {
  const groups = groupCharacters([
    viral({ title: "Treino de hoje", authorHandle: "moroniduarte", authorName: "Morôni Duarte" }),
    viral({ title: "Rolê com @moroniduarte no shopping", authorHandle: "fanpage", authorName: "Fã" }),
    viral({ title: "Novo vídeo do personagem", authorHandle: "lia.ai.influencer", authorName: "Lia · AI influencer" }),
    viral({ title: "Personagem de IA em Paris", authorHandle: "creator_x", authorName: "Creator X" }),
    viral({ title: "Personagem de IA em Roma", authorHandle: "creator_x", authorName: "Creator X" }),
    viral({ title: "Avatar de IA cantando", authorHandle: "solitario", authorName: "Solitário" }),
    viral({ title: "Dancinha normal sem nada", authorHandle: "humano", authorName: "Humano" }),
  ]);
  const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
  assert.equal(byKey["tracked:moroniduarte"].videos.length, 2, "tracked profile collects mentions from other accounts");
  assert.equal(byKey["tracked:moroniduarte"].kind, "tracked");
  assert.equal(byKey["author:tiktok:lia.ai.influencer"].kind, "discovered", "author name declares an AI influencer");
  assert.match(byKey["author:tiktok:lia.ai.influencer"].evidence, /não confirmado na origem/, "an indication is never a confirmation");
  assert.match(byKey["author:tiktok:solitario"].evidence, /não confirmado na origem/);
  assert.equal(byKey["author:tiktok:creator_x"].kind, "discovered", "two AI-titled videos from one author");
  assert.equal(byKey["author:tiktok:creator_x"].videos.length, 2);
  assert.equal(byKey["author:tiktok:solitario"].kind, "candidate", "one AI-titled video is only a candidate for review");
  assert.equal("author:tiktok:humano" in byKey, false, "no AI evidence → not a character at all");
  assert.deepEqual(plain(groups.map((group) => group.kind)), ["tracked", "discovered", "discovered", "candidate"], "tracked first, candidates last");

  const own = groupCharacters([viral({ title: "Treino", authorHandle: "moroniduarte0", authorName: "Morôni" })], ["moroniduarte", "moroniduarte0"]);
  assert.deepEqual(plain(own.map((group) => group.key)), ["tracked:moroniduarte0"], "an exact tracked handle beats an alias of another tracked profile");
  const mention = groupCharacters([viral({ title: "Com @moroniduarte0 hoje", authorHandle: "fan", authorName: "Fã" })], ["moroniduarte", "moroniduarte0"]);
  assert.deepEqual(plain(mention.map((group) => group.key)), ["tracked:moroniduarte"], "a mention still associates with the character it names");
});

test("the same video in the catalog and in the collection appears once, with the catalog file", () => {
  const profile = AI_PROFILES.find((entry) => entry.platform === "instagram" && entry.posts.some((post) => post.video));
  const post = profile.posts.find((entry) => entry.video);
  const collected = viral({ source: "instagram", videoId: undefined, pageUrl: `https://www.instagram.com/reel/${post.code}/`, playUrl: "", coverUrl: "", title: post.scene, authorHandle: profile.handle, authorName: profile.name, discoveredAt: NOW - HOUR, views: 500 });
  const sections = buildCharacterSections([collected], null);
  const section = sections.find((entry) => entry.handle === profile.handle);
  assert.equal(section.kind, "tracked");
  const matches = section.items.filter((item) => item.pageUrl === collected.pageUrl);
  assert.equal(matches.length, 1, "deduplicated by reel code");
  assert.equal(matches[0].origin, "collected", "collection date and metrics are kept");
  assert.equal(matches[0].views, 500);
  assert.equal(matches[0].playUrl, post.video, "catalog file fills in the missing media");
  assert.equal(section.items.length, profile.posts.length, "every catalog post is preserved");
  assert.equal(section.items.filter((item) => item.origin === "catalog").length, profile.posts.length - 1);
  assert.equal(section.collectedCount, 1);
});

test("the whole catalog is preserved and posts without hosted media stay as references to watch at the source", () => {
  const sections = buildCharacterSections([], null);
  const tracked = sections.filter((section) => section.kind === "tracked");
  assert.equal(tracked.length, AI_PROFILES.length, "every tracked profile is listed even without collected videos");
  const total = tracked.reduce((sum, section) => sum + section.items.length, 0);
  assert.equal(total, AI_PROFILES.reduce((sum, profile) => sum + profile.posts.length, 0), "no catalog post is lost");
  assert.ok(tracked.every((section) => section.items.every((item) => item.origin === "catalog" && item.discoveredAt === undefined && !item.isNew)));
  assert.ok(tracked.every((section) => section.items.every((item) => item.useHref === undefined || item.playUrl)), "only posts with a file can be used as reference");

  const tiktokProfile = { handle: "persona.ai", platform: "tiktok", name: "Persona", bio: "", url: "https://www.tiktok.com/@persona.ai", avatar: "/avatars/x.jpg", followers: "1 mil", posts: [] };
  const noMedia = postItem(tiktokProfile, { code: "7301", scene: "Cena sem arquivo", prompt: "", ar: 0.5625, embeddable: false, metrics: { likes: 10, observedAt: "2026-10-08" } });
  assert.equal(noMedia.playUrl, undefined);
  assert.deepEqual(plain(noMedia.embed), { kind: "tiktok", id: "7301" }, "TikTok without a file plays through the official player");
  assert.equal(noMedia.useHref, undefined, "no file → cannot be used as a motion reference");
  assert.equal(noMedia.views, undefined, "unobserved views are not zero");
  assert.equal(noMedia.likes, 10);
  assert.equal(noMedia.metricsAt, Date.parse("2026-10-08T12:00:00Z"), "observation date comes from the catalog snapshot");
  const instagram = postItem({ ...tiktokProfile, platform: "instagram" }, { code: "DeXYZ", scene: "Reel sem arquivo", prompt: "", ar: 0.5625, embeddable: false });
  assert.equal(instagram.embed, undefined, "Instagram without a file is watched at the source");
  assert.equal(instagram.pageUrl, "https://www.instagram.com/reel/DeXYZ/");
});

test("a newly discovered profile shows up with its videos and discovery dates", () => {
  const first = viral({ title: "AI influencer: primeiro dia em Tóquio", authorHandle: "nova.persona", authorName: "Nova", discoveredAt: NOW - 3 * HOUR });
  const second = viral({ title: "AI influencer: café da manhã", authorHandle: "nova.persona", authorName: "Nova", discoveredAt: NOW - HOUR });
  const sections = buildCharacterSections([first, second], NOW - 2 * HOUR);
  const section = sections.find((entry) => entry.handle === "nova.persona");
  assert.equal(section.kind, "discovered");
  assert.equal(section.verified, false, "a discovered profile stays unverified");
  assert.ok(sections.filter((entry) => entry.kind === "tracked").every((entry) => entry.verified));
  assert.equal(section.items.length, 2);
  assert.equal(section.items[0].id, `viral:${second.id}`, "most recent first");
  assert.equal(section.newCount, 1, "only the one found after the last visit is new");
  assert.deepEqual([section.firstSeenAt, section.lastSeenAt], [NOW - 3 * HOUR, NOW - HOUR]);
  assert.equal(sections.indexOf(section) >= AI_PROFILES.length, true, "tracked profiles come first");
});

test("discovered trends need an explicit effect signal and are never executable effects", () => {
  const collected = viral({ title: "Personagem de IA com efeito clones na rua", discoveredAt: NOW - HOUR, duration: 12 });
  const tooLong = viral({ title: "AI influencer vanish transition", discoveredAt: NOW - 2 * HOUR, duration: 45 });
  const noFile = viral({ source: "youtube", videoId: "abc123XYZ_0", pageUrl: "https://www.youtube.com/shorts/abc123XYZ_0", playUrl: "", title: "AI character floating fall", discoveredAt: NOW - 3 * HOUR, duration: 20 });
  const plain1 = viral({ title: "Personagem de IA tomando café", discoveredAt: NOW - 30 * 60_000, duration: 10 });
  const captionOnly = viral({ title: "Personagem de IA", sourceCaption: "câmera lenta no derrete #ai", discoveredAt: NOW - 4 * HOUR, duration: 10 });
  const catalog = viral({ title: "Clones do catálogo", minedAt: 0, discoveredAt: undefined });
  const gone = viral({ title: "AI clone", discoveredAt: NOW, unavailableAt: NOW });
  const trends = discoveredTrends([catalog, tooLong, collected, noFile, plain1, captionOnly, gone]);
  assert.deepEqual(plain(trends.map((trend) => trend.viral.id)), [collected.id, tooLong.id, noFile.id, captionOnly.id], "newest first; plain videos, catalog and unavailable excluded");
  assert.deepEqual(plain(trends.map((trend) => trend.usableAsReference)), [true, false, false, true], "only 3–30 s with a file can be a motion reference");
  assert.deepEqual(plain(trends[0].relatedEffects.map((effect) => effect.name)), ["Clones", "Infinite clones"], "related catalog effects come from name/tag matches");
  assert.ok(trends[1].relatedEffects.some((effect) => effect.name === "Vanish"));
  assert.deepEqual(plain(trends[3].matchedTerms), ["camera lenta", "derrete"], "caption vocabulary counts; generic #ai does not");
  assert.deepEqual(plain(effectRelevance({ title: "Dancinha do dia", sourceCaption: "#fyp #viral" }).matchedTerms), [], "no signal → not a trend");
  assert.equal(trends.every((trend) => !isExecutableEffect(trend.viral.id)), true);
  const effects = listExecutableEffects();
  assert.equal(effects.length, VIRAL_EFFECTS.length);
  assert.ok(effects.every((effect) => effect.executable && effect.cost > 0 && effect.model.includes("kling") && effect.durationSeconds === 5));
  // O alcance ilustrativo do catálogo existe só para a vitrine da home pública; o app nunca o expõe.
  assert.ok(effects.every((effect) => !("views" in effect)), "no illustrative reach numbers reach the app catalog");
  assert.ok(effects.every((effect) => isExecutableEffect(effect.id)));
});

test("durations always render as mm:ss", () => {
  assert.equal(durationLabel(22), "00:22");
  assert.equal(durationLabel(21.755645), "00:22");
  assert.equal(durationLabel(83), "01:23");
  assert.equal(durationLabel(3661), "1:01:01");
  assert.equal(durationLabel(NaN), "00:00");
});

test("YouTube items keep official metrics, dates and an embed instead of a file", () => {
  assert.equal(parseIsoDuration("PT1M5S"), 65);
  assert.equal(parseIsoDuration("PT45S"), 45);
  assert.equal(parseIsoDuration("garbage"), 0);
  const item = toYoutubeViral({ id: "dQw4w9WgXcQ", snippet: { title: "AI influencer character vlog", channelTitle: "Canal IA", channelId: "UC123", publishedAt: "2026-10-01T10:00:00Z", thumbnails: { high: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" } } }, contentDetails: { duration: "PT22S" }, statistics: { viewCount: "1500", likeCount: "20" } }, NOW);
  assert.equal(item.source, "youtube");
  assert.equal(item.playUrl, "", "no downloadable file: playback uses the official player");
  assert.deepEqual([item.duration, item.views, item.likes, item.comments], [22, 1500, 20, 0]);
  assert.equal(item.publishedAt, Date.parse("2026-10-01T10:00:00Z"));
  assert.equal(toYoutubeViral({ id: "x" }, NOW), null, "invalid id rejected");
  const explore = viralItem({ id: "y1", ...item }, null);
  assert.deepEqual(plain(explore.embed), { kind: "youtube", id: "dQw4w9WgXcQ" });
  assert.equal(explore.useHref, undefined, "YouTube has no file, so it is never a motion reference");
  assert.equal(durationLabel(explore.duration), "00:22");
});

test("YouTube and TikTok ids never collide in the database and re-collection does not duplicate", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-explore-test-"));
  try {
    const db = loader({ env: { DATA_DIR: directory } })("src/lib/db.ts");
    const tiktok = viral({ videoId: "shared-id", pageUrl: "https://www.tiktok.com/@a/video/shared-id" });
    const youtube = viral({ source: "youtube", videoId: "shared-id", pageUrl: "https://www.youtube.com/shorts/shared-id", playUrl: "" });
    delete tiktok.id; delete youtube.id;
    assert.equal(await db.upsertVirals([tiktok, youtube]), 2);
    assert.equal(await db.upsertVirals([{ ...youtube, views: 99 }]), 0, "same YouTube video again → update, not insert");
    const rows = plain(await db.listVirals("AI"));
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.source === "youtube").views, 99);
    assert.equal(rows.find((row) => row.source === "tiktok").views, 0, "the TikTok row with the same id is untouched");
  } finally { cleanup(directory); }
});
