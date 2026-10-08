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

async function minerFixture(seed = []) {
  const dbUrl = asModule(`export const stored = ${JSON.stringify(seed)}; export async function listVirals() { return stored; } export async function upsertVirals(items) { let added = 0; for (const item of items) { const old = stored.find(v => v.videoId === item.videoId); if (old) Object.assign(old,item); else { stored.push({...item,id: String(stored.length + 1)}); added++; } } return added; } //${Math.random()}`);
  const source = (await readFile(new URL("../src/lib/miner.ts", import.meta.url), "utf8"))
    .replace('import "server-only";', "")
    .replace('from "./db"', `from ${JSON.stringify(dbUrl)}`)
    .replace('from "./ai-discovery"', `from ${JSON.stringify(rulesUrl)}`);
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
