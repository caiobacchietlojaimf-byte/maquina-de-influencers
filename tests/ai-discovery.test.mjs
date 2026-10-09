import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const asModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const rulesUrl = asModule(compile(await readFile(new URL("../src/lib/ai-discovery.ts", import.meta.url), "utf8")));
const rules = await import(rulesUrl);
const candidate = (title, authorHandle = "creator") => ({ title, authorHandle, authorName: authorHandle });

test("only named profiles or explicit AI character context qualify", () => {
  assert.equal(rules.isAiCharacterVideo(candidate("Hoje no rolê", "moroniduarte")), true);
  assert.equal(rules.matchesAiProfile(candidate("Hoje no rolê", "moroniduarte0"), "moroniduarte"), true);
  assert.equal(rules.matchesAiProfile({ title: "Rolê", authorHandle: "creator", authorName: "Morôni Duarte" }, "moroniduarte"), true);
  assert.equal(rules.isAiCharacterVideo(candidate("Olha o @dahab.daddy nessa cena")), true);
  assert.equal(rules.isAiCharacterVideo(candidate("My AI generated character goes shopping")), true);
  assert.equal(rules.isAiCharacterVideo(candidate("Uma personagem de IA no shopping")), true);
  for (const title of ["Dança #viral #fyp", "Latest AI news", "Um influencer gritou ai meu Deus", "Como criar influencer de IA tutorial", "Curso de inteligência artificial", "Aprenda a fazer esse mesmo vídeo com IA🚨 #ia #viral #moroniduarte"]) {
    assert.equal(rules.isAiCharacterVideo(candidate(title)), false, title);
  }
  assert.equal(rules.isAiCharacterVideo(candidate("", "notmoroniduarte")), false);
  assert.equal(rules.matchesAiProfile(candidate("@dahabXdaddy"), "dahab.daddy"), false);
});

test("social URL validation rejects spoofed hosts, arbitrary MP4s, credentials and profiles", () => {
  assert.deepEqual(rules.parseSocialVideoUrl("https://www.tiktok.com/@moroniduarte/video/123456?tracking=1"), { source: "tiktok", url: "https://www.tiktok.com/@moroniduarte/video/123456" });
  assert.equal(rules.parseSocialVideoUrl("https://vm.tiktok.com/Abc123/").source, "tiktok");
  assert.equal(rules.parseSocialVideoUrl("https://www.instagram.com/reel/Ab_Cd-12/?igsh=x").code, "Ab_Cd-12");
  for (const url of ["https://tiktok.com.attacker.invalid/@a/video/123", "https://attacker.invalid/?tiktok.com/@a/video/123", "https://user:pw@tiktok.com/@a/video/123", "https://www.tiktok.com/@a", "https://example.com/video.mp4", "http://127.0.0.1/video.mp4"]) assert.equal(rules.parseSocialVideoUrl(url), null, url);
});

async function minerFixture(seed = [], profiles = []) {
  const dbUrl = asModule(`export const stored = ${JSON.stringify(seed)}; export async function listVirals() { return stored; } export async function upsertVirals(items) { let added = 0; for (const item of items) { const old = stored.find(v => item.videoId ? v.videoId === item.videoId : v.pageUrl === item.pageUrl); if (old) Object.assign(old,item); else { stored.push({...item,id: String(stored.length + 1)}); added++; } } return added; } //${Math.random()}`);
  const profilesUrl = asModule(`export const AI_PROFILES = ${JSON.stringify(profiles)};`);
  const source = (await readFile(new URL("../src/lib/miner.ts", import.meta.url), "utf8"))
    .replace('import "server-only";', "")
    .replace('from "./db"', `from ${JSON.stringify(dbUrl)}`)
    .replace('from "./ai-discovery"', `from ${JSON.stringify(rulesUrl)}`)
    .replace('from "@/data/ai-profiles"', `from ${JSON.stringify(profilesUrl)}`);
  return { miner: await import(asModule(compile(source))), db: await import(dbUrl) };
}

const item = (video_id, title = "Uma personagem de IA", extra = {}) => ({ video_id, title, duration: 12, play: "https://media.example/video.mp4", author: { unique_id: "creator" }, play_count: 321, ...extra });

test("mining deduplicates overlapping results, rejects generic videos/photos and preserves cursors", async (t) => {
  const { miner, db } = await minerFixture();
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(String(url));
    return Response.json({ code: 0, data: { videos: [item("123"), item("123"), item("456", "Dança #viral"), item("789", "AI character", { images: ["photo.jpg"] })], cursor: "20", hasMore: true } });
  });
  const result = await miner.mineTrending("BR", { force: true, cursors: { moroniduarte: "0", arbitrary: "0" } });
  assert.equal(result.added, 1);
  assert.equal(db.stored.length, 1);
  assert.equal(db.stored[0].region, "AI");
  assert.equal(db.stored[0].views, 321);
  assert.deepEqual(result.cursors, { moroniduarte: "20" });
  assert.equal(urls.length, 1);
  assert.match(urls[0], /feed\/search/);
  assert.doesNotMatch(urls[0], /feed\/list/);
  await miner.mineTrending("AI", { force: true, cursors: result.cursors });
  assert.match(urls[1], /cursor=20/);
});

test("new provider results preserve the observed caption, hashtags and line breaks with explicit provenance", async (t) => {
  const { miner, db } = await minerFixture();
  const observed = "  Uma personagem de IA na praia 🌊\nO vento levou meu chapéu!\n#PersonagemIA #Praia #Humor  ";
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: 0, data: { videos: [item("123", observed)], hasMore: false } }));
  await miner.mineTrending("AI", { force: true, cursors: { moroniduarte: "0" } });
  assert.equal(db.stored.length, 1);
  assert.equal(db.stored[0].sourceCaption, observed.trim());
  assert.equal(db.stored[0].sourceCaptionOrigin, "provider-title");
  assert.match(db.stored[0].sourceCaption, /#Praia #Humor/);
  assert.ok(db.stored[0].sourceCaption.includes("\nO vento levou meu chapéu!\n"));
});

test("captions are capped at 2200 characters and missing provider titles remain unknown", async (t) => {
  const { miner, db } = await minerFixture();
  const observed = `Uma personagem de IA ${"detalhe ".repeat(400)}`;
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: 0, data: { videos: [
    item("123", observed),
    item("456", "  ", { author: { unique_id: "moroniduarte" } }),
    item("789", undefined, { title: undefined, author: { unique_id: "moroniduarte" } }),
  ], hasMore: false } }));
  await miner.mineTrending("AI", { force: true, cursors: { moroniduarte: "0" } });
  assert.equal(db.stored[0].sourceCaption.length, 2200);
  assert.equal(db.stored[0].sourceCaption, observed.trim().slice(0, 2200));
  for (const record of db.stored.slice(1)) {
    assert.equal(record.sourceCaption, undefined);
    assert.equal(record.sourceCaptionOrigin, undefined);
    assert.equal(record.title, "Sem legenda");
  }
  assert.equal(db.stored.length, 3);
});

test("blocked provider stops the batch and exposes the error without fabricating rows", async (t) => {
  const { miner, db } = await minerFixture();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("blocked", { status: 403 }); });
  await assert.rejects(miner.mineTrending("AI", { force: true }), /bloqueando/);
  assert.equal(calls, 1);
  assert.equal(db.stored.length, 0);
});

test("import verifies resolved character metadata and retains short-link canonical identity", async (t) => {
  const { miner, db } = await minerFixture();
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: 0, data: item("123", "Rolê", { author: { unique_id: "moroniduarte" } }) }));
  await miner.mineByUrl("https://vm.tiktok.com/Abc123/");
  assert.equal(db.stored[0].pageUrl, "https://www.tiktok.com/@moroniduarte/video/123");
  await assert.rejects(miner.mineByUrl("https://tiktok.com.attacker.invalid/@a/video/123"), /Cole o link/);
});

test("motion boundaries are enforced while longer AI videos remain discoverable", () => {
  assert.equal(rules.isMotionReference(3), true);
  assert.equal(rules.isMotionReference(30), true);
  for (const seconds of [0, 2, 31, NaN, Infinity]) assert.equal(rules.isMotionReference(seconds), false);
  assert.equal(rules.isAiCharacterVideo(candidate("AI generated character", "creator")), true);
});

test("expired media renews only when the resolver returns the same AI video", async (t) => {
  const existing = { id: "saved-id", source: "tiktok", videoId: "123", pageUrl: "https://www.tiktok.com/@moroniduarte/video/123", playUrl: "https://expired.example/video.mp4", title: "Rolê", authorName: "Morôni", authorHandle: "moroniduarte", duration: 12, views: 321, minedAt: 1 };
  const { miner, db } = await minerFixture([existing]);
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: 0, data: item("123", "Rolê", { author: { unique_id: "moroniduarte" }, play: "https://renewed.example/video.mp4" }) }));
  const refreshed = await miner.refreshViralMedia(existing);
  assert.equal(refreshed.id, "saved-id");
  assert.equal(refreshed.playUrl, "https://renewed.example/video.mp4");
  assert.equal(db.stored.length, 1);
  assert.equal(db.stored[0].playUrl, refreshed.playUrl);
});

const localProfiles = [
  { handle: "moroniduarte0", name: "Morôni Duarte", platform: "tiktok", posts: [
    { code: "7692575243730160916", scene: "No rolê", video: "/reel-videos/7692575243730160916.mp4", metrics: { likes: 207400, duration: 12.79 } },
  ] },
  { handle: "dahab.daddy", name: "Dahab Daddy", platform: "instagram", posts: [
    { code: "AbCd123", scene: "Uma nova cena", video: "/reel-videos/AbCd123.mp4", metrics: { likes: 200 } },
    { code: "NoFile", scene: "Referência sem arquivo" },
  ] },
];

test("local catalog seeds stable database IDs once with correct platforms and observed metrics", async (t) => {
  const { miner, db } = await minerFixture([], localProfiles);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network must not be used"); });
  const first = await miner.listAiVirals();
  const second = await miner.listAiVirals();
  assert.equal(first.length, 2);
  assert.equal(db.stored.length, 2);
  assert.deepEqual(first.map(v => v.id), second.map(v => v.id));
  assert.equal(first[0].source, "tiktok");
  assert.equal(first[0].videoId, "7692575243730160916");
  assert.equal(first[0].likes, 207400);
  assert.equal(first[0].views, 0);
  assert.equal(first[0].minedAt, 0);
  for (const record of first) {
    assert.equal(record.sourceCaption, undefined, "Catalog scene labels are not observed captions");
    assert.equal(record.sourceCaptionOrigin, undefined);
  }
  assert.equal(first[1].source, "instagram");
  assert.equal(first[1].pageUrl, "https://www.instagram.com/reel/AbCd123/");
  assert.equal(first[1].duration, 0);
  assert.equal(miner.isDuplicable(first[1]), false);
});

test("seeded local videos do not suppress first discovery and remain available after provider 403", async (t) => {
  const { miner } = await minerFixture([], localProfiles);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("blocked", { status: 403 }); });
  await assert.rejects(miner.mineTrending(), /bloqueando/);
  assert.equal(calls, 1);
  assert.equal((await miner.listAiVirals()).length, 2);
});

test("known TikTok import and expired-media refresh use stable local file without replacing fresher metrics", async (t) => {
  const existing = { id: "persisted", source: "tiktok", videoId: "7692575243730160916", pageUrl: "https://www.tiktok.com/@moroniduarte0/video/7692575243730160916", playUrl: "https://expired.example/video.mp4", coverUrl: "https://expired.example/cover.jpg", title: "No rolê", authorName: "Morôni Duarte", authorHandle: "moroniduarte0", duration: 12, views: 876543, likes: 240000, minedAt: 456 };
  const { miner, db } = await minerFixture([existing], localProfiles);
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network must not be used"); });
  await miner.seedProfileVirals();
  assert.equal(db.stored[0].likes, 240000);
  const result = await miner.mineByUrl(existing.pageUrl);
  assert.equal(result.added, false);
  const refreshed = await miner.refreshViralMedia(existing);
  assert.equal(refreshed.id, "persisted");
  assert.equal(refreshed.playUrl, "/reel-videos/7692575243730160916.mp4");
  assert.equal(refreshed.likes, 240000);
  assert.equal(refreshed.views, 876543);
  assert.equal(refreshed.minedAt, 456);
  assert.equal(refreshed.sourceCaption, undefined, "Existing display titles must not become inferred captions");
  assert.equal(refreshed.sourceCaptionOrigin, undefined);
  assert.equal(db.stored.length, 2);
});
