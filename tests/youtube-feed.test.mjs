import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));

/* Carrega youtube-discovery.ts isolado; a rede é um dublê que devolve o feed de exemplo. */
function load(fetchMock) {
  const file = path.resolve(root, "src/lib/youtube-discovery.ts");
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(id) {
    if (id === "server-only") return {};
    if (id === "./ai-discovery") return { isAiCharacterVideo: () => true };
    throw new Error(`unexpected import ${id}`);
  }, process: { env: {} }, URLSearchParams, AbortSignal, Date, Number, String, Response, fetch: fetchMock ?? (() => assert.fail("No real network request is permitted")) }, { filename: file });
  return module.exports;
}

/* Mesmo formato do feed real (youtube.com/feeds/videos.xml), reduzido a três entradas. */
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Canal IA</title>
 <author><name>Canal IA</name><uri>https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa</uri></author>
 <entry>
  <id>yt:video:wXSbAW0B2FQ</id>
  <yt:videoId>wXSbAW0B2FQ</yt:videoId>
  <yt:channelId>UCaaaaaaaaaaaaaaaaaaaaaa</yt:channelId>
  <title>Vovó IA no rolê &amp; &quot;surpresa&quot; 👀 #ai</title>
  <link rel="alternate" href="https://www.youtube.com/shorts/wXSbAW0B2FQ"/>
  <author><name>Canal IA</name><uri>https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa</uri></author>
  <published>2026-10-20T22:00:36+00:00</published>
  <media:group>
   <media:title>Vovó IA no rolê &amp; &quot;surpresa&quot; 👀 #ai</media:title>
   <media:thumbnail url="https://i4.ytimg.com/vi/wXSbAW0B2FQ/hqdefault.jpg" width="480" height="360"/>
   <media:community>
    <media:starRating count="169" average="5.00" min="1" max="5"/>
    <media:statistics views="7577"/>
   </media:community>
  </media:group>
 </entry>
 <entry>
  <id>yt:video:longvideo01</id>
  <yt:videoId>longvideo01</yt:videoId>
  <yt:channelId>UCaaaaaaaaaaaaaaaaaaaaaa</yt:channelId>
  <title>Vídeo longo</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=longvideo01"/>
  <published>2026-10-19T10:00:00+00:00</published>
 </entry>
 <entry>
  <yt:videoId>il_MMI2MOYM</yt:videoId>
  <yt:channelId>UCaaaaaaaaaaaaaaaaaaaaaa</yt:channelId>
  <title></title>
  <link rel="alternate" href="https://www.youtube.com/shorts/il_MMI2MOYM"/>
  <published>2026-10-18T10:00:00+00:00</published>
 </entry>
</feed>`;

test("the public feed keeps only Shorts, with title, cover, date and views", () => {
  const { parseYoutubeFeed } = load();
  const now = Date.UTC(2026, 9, 21);
  const virals = parseYoutubeFeed(FEED, now);
  assert.equal(virals.length, 2, "the long video (watch?v=) is skipped");
  const [first, second] = virals;
  assert.equal(first.source, "youtube");
  assert.equal(first.videoId, "wXSbAW0B2FQ");
  assert.equal(first.pageUrl, "https://www.youtube.com/shorts/wXSbAW0B2FQ");
  assert.equal(first.title, "Vovó IA no rolê & \"surpresa\" 👀 #ai", "XML entities are decoded");
  assert.equal(first.coverUrl, "https://i4.ytimg.com/vi/wXSbAW0B2FQ/hqdefault.jpg");
  assert.equal(first.authorName, "Canal IA");
  assert.equal(first.authorHandle, "UCaaaaaaaaaaaaaaaaaaaaaa", "the channel id identifies the curated channel");
  assert.equal(first.views, 7577);
  assert.equal(first.likes, 169);
  assert.equal(first.publishedAt, Date.parse("2026-10-20T22:00:36+00:00"));
  assert.equal(first.playUrl, "", "no video file: playback is the official embed");
  assert.equal(first.minedAt, now);
  assert.equal(second.title, "Sem título");
  assert.equal(second.authorName, "Canal IA", "falls back to the feed author");
  assert.equal(second.views, 0);
});

test("fetchChannelShorts rejects malformed channel ids without any request and reports HTTP errors", async () => {
  const calls = [];
  const ok = load(async (url) => { calls.push(url); return new Response(FEED, { status: 200 }); });
  assert.equal((await ok.fetchChannelShorts("not-a-channel")).length, 0);
  assert.equal(calls.length, 0);
  const virals = await ok.fetchChannelShorts("UCaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(virals.length, 2);
  assert.equal(calls[0], "https://www.youtube.com/feeds/videos.xml?channel_id=UCaaaaaaaaaaaaaaaaaaaaaa");

  const broken = load(async () => new Response("", { status: 404 }));
  await assert.rejects(() => broken.fetchChannelShorts("UCaaaaaaaaaaaaaaaaaaaaaa"), /HTTP 404/);
});
