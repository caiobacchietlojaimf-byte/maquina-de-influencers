import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/instagram-performance.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const BASIC = "instagram_business_basic", INSIGHTS = "instagram_business_manage_insights";
function account(userId = "owner", extra = {}) {
  return { id: `account-${userId}`, userId, platform: "instagram", status: "connected", username: userId,
    accessToken: `sealed-${userId}`, connectedAt: 123, igUserId: userId === "owner" ? "12345" : "67890", providerUserId: userId === "owner" ? "12345" : "67890",
    oauthProvider: "instagram", scopes: [BASIC, "instagram_business_content_publish"], ...extra };
}
function reel(index, extra = {}) {
  return { id: `${10000 + index}`, caption: `Cena ${index}? #PersonagemIA`, media_type: "VIDEO", media_product_type: "REELS", like_count: index * 2,
    comments_count: index, timestamp: "2026-10-08T12:00:00+0000", permalink: `https://www.instagram.com/reel/code${index}/`, ...extra };
}
function fixture(options = {}) {
  const state = { now: Date.parse("2026-10-09T12:00:00Z"), accounts: new Map([["owner", account()]]), calls: [], refreshes: 0, opens: [], listCalls: [], posts: [], media: [reel(1), reel(2), reel(3)] };
  Object.assign(state, options.state);
  class Clock extends Date { static now() { return state.now; } }
  const mocks = {
    "server-only": {},
    "./db": { getSocialAccount: async (owner, platform) => {
      assert.equal(platform, "instagram");
      return options.getAccount ? options.getAccount(owner) : state.accounts.get(owner);
    }, listPosts: async owner => { state.listCalls.push(owner); return state.posts; } },
    "./social": { freshSocialAccount: async stored => { state.refreshes++; return options.fresh ? options.fresh(stored) : stored; } },
    "./social-token": { openSocialToken: (token, owner) => {
      state.opens.push({ token, owner });
      assert.equal(token, `sealed-${owner.split(":")[0]}`);
      return `private-token-${owner.split(":")[0]}`;
    } },
  };
  const fetch = async (value, init) => {
    const url = new URL(value); state.calls.push({ url, init });
    if (options.fetch) return options.fetch(url, init, state);
    const owner = init.headers.Authorization.replace("Bearer private-token-", "");
    const current = state.accounts.get(owner);
    if (url.pathname.endsWith("/me")) return Response.json({ user_id: current?.igUserId, username: owner });
    if (url.pathname.endsWith("/media")) return Response.json({ data: state.media });
    if (url.pathname.endsWith("/insights")) return Response.json({ data: [] });
    return Response.json(reel(Number(url.pathname.split("/").at(-1)) - 10000));
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: id => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected dependency ${id}`);
  }, fetch, URL, AbortSignal, structuredClone, TextDecoder, Date: Clock });
  return { state, get: module.exports.getInstagramPerformance };
}

test("missing, demo and foreign-owned connections do not fetch or open credentials", async () => {
  for (const stored of [undefined, account("owner", { status: "demo" }), account("stranger")]) {
    const f = fixture({ getAccount: () => stored });
    const result = await f.get("owner");
    assert.equal(result.status, "disconnected");
    assert.equal(f.state.calls.length, 0); assert.equal(f.state.opens.length, 0);
  }
});

test("basic scope reads confirmed Reels with GET/bearer and ranks real likes plus comments only", async () => {
  const f = fixture({ state: { media: [reel(1), reel(9, { media_product_type: "FEED" }), reel(0), reel(3), reel(1)] } });
  const result = await f.get("owner");
  assert.equal(result.status, "ready"); assert.equal(result.sampleSize, 3);
  assert.deepEqual(result.posts.map(post => post.id), ["10003", "10001", "10000"]);
  assert.equal(result.posts[2].likes, 0); assert.equal(result.posts[2].comments, 0);
  assert.deepEqual(result.metricsAvailable, ["likes", "comments"]);
  assert.match(result.summary, /Ranking por curtidas \+ comentários/);
  assert.match(result.summary, /precisam da permissão de insights/);
  assert.equal(f.state.calls.length, 2);
  for (const { url, init } of f.state.calls) {
    assert.equal(url.origin, "https://graph.instagram.com"); assert.ok(url.pathname.startsWith("/v24.0/"));
    assert.equal(url.searchParams.has("access_token"), false);
    assert.equal(init.method, "GET"); assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
    assert.equal(init.headers.Authorization, "Bearer private-token-owner"); assert.ok(init.signal instanceof AbortSignal);
  }
  const media = f.state.calls[1].url;
  assert.equal(media.searchParams.get("limit"), "20");
  assert.equal(media.searchParams.get("fields"), "id,caption,permalink,timestamp,like_count,comments_count,media_type,media_product_type");
  assert.doesNotMatch(JSON.stringify(result), /private-token|sealed-owner/);
});

test("fewer than three complete measurements gives no winner; unavailable counters are not zero", async () => {
  const f = fixture({ state: { media: [reel(1, { like_count: undefined }), reel(2, { comments_count: -1 }), reel(0)] } });
  const result = await f.get("owner");
  assert.equal(result.sampleSize, 3); assert.match(result.summary, /amostra é insuficiente/);
  assert.equal(result.posts.find(post => post.id === "10001").likes, undefined);
  assert.equal(result.posts.find(post => post.id === "10002").comments, undefined);
  assert.equal(result.posts.find(post => post.id === "10000").likes, 0);
  assert.ok(result.recommendations.some(item => /não entram como zero/.test(item)));
  assert.doesNotMatch(result.summary, /Ranking|vencedor|viralizou/);
});

test("Instagram-owned permalinks only, finite counters only, and no chasing supplied pagination URLs", async () => {
  const f = fixture({ fetch: async url => url.pathname.endsWith("/me") ? Response.json({ user_id: "12345", username: "owner" }) : Response.json({
    data: [reel(1, { permalink: "https://attacker.example/?secret=x", like_count: "9" }), reel(2, { permalink: "javascript:alert(1)", comments_count: 1.5 }), reel(3, { permalink: "https://www.instagram.com/reel/code3/?utm=x" })],
    paging: { next: "https://attacker.example/private" },
  }) });
  const result = await f.get("owner");
  assert.equal(result.posts.find(post => post.id === "10001").permalink, undefined);
  assert.equal(result.posts.find(post => post.id === "10001").likes, undefined);
  assert.equal(result.posts.find(post => post.id === "10002").permalink, undefined);
  assert.equal(result.posts.find(post => post.id === "10003").permalink, "https://www.instagram.com/reel/code3/");
  assert.equal(f.state.calls.length, 2);
});

test("already-granted insights are optional, scoped to at most five Reels, and preserve missing versus zero", async () => {
  const f = fixture({ state: { accounts: new Map([["owner", account("owner", { scopes: [BASIC, INSIGHTS] })]]), media: Array.from({ length: 8 }, (_, index) => reel(index)) },
    fetch: async (url, _init, state) => {
      if (url.pathname.endsWith("/me")) return Response.json({ user_id: "12345", username: "owner" });
      if (url.pathname.endsWith("/media")) return Response.json({ data: state.media });
      if (url.pathname.includes("10001/")) return Response.json({ error: { code: 10, message: "private-token-owner" } }, { status: 400 });
      return Response.json({ data: [
        { name: "views", values: [{ value: 0 }] }, { name: "reach", total_value: { value: 15 } },
        { name: "saved", values: [] }, { name: "shares", values: [{ value: 3 }] }, { name: "invented", values: [{ value: 999 }] },
      ] });
    } });
  const result = await f.get("owner");
  assert.equal(result.status, "ready"); assert.equal(result.sampleSize, 8);
  assert.equal(f.state.calls.filter(call => call.url.pathname.endsWith("/insights")).length, 5);
  assert.equal(result.posts.find(post => post.id === "10000").views, 0);
  assert.equal(result.posts.find(post => post.id === "10000").reach, 15);
  assert.equal(result.posts.find(post => post.id === "10000").saved, undefined);
  assert.equal(result.posts.find(post => post.id === "10001").views, undefined);
  assert.equal(result.posts.find(post => post.id === "10007").views, undefined);
  assert.deepEqual(result.metricsAvailable, ["likes", "comments", "views", "reach", "shares"]);
  assert.match(result.summary, /48 horas/); assert.doesNotMatch(JSON.stringify(result), /private-token|invented/);
  for (const call of f.state.calls.filter(call => call.url.pathname.endsWith("/insights"))) {
    assert.equal(call.url.searchParams.get("metric"), "views,reach,saved,shares");
    assert.equal(call.url.searchParams.get("period"), "lifetime");
  }
});

test("unavailable optional insights leave the successfully fetched basic metrics visible", async () => {
  const f = fixture({ state: { accounts: new Map([["owner", account("owner", { scopes: [BASIC, INSIGHTS] })]]) }, fetch: async (url, _init, state) => {
    if (url.pathname.endsWith("/me")) return Response.json({ user_id: "12345", username: "owner" });
    if (url.pathname.endsWith("/media")) return Response.json({ data: state.media });
    throw new Error("timeout private-token-owner");
  } });
  const result = await f.get("owner");
  assert.equal(result.status, "ready"); assert.equal(result.posts.length, 3);
  assert.deepEqual(result.metricsAvailable, ["likes", "comments"]);
  assert.match(result.summary, /insights não foram disponibilizados/);
});

test("cache deduplicates concurrent work, isolates accounts, returns copies and expires within five minutes", async () => {
  const f = fixture(); f.state.accounts.set("another", account("another"));
  const [first, second] = await Promise.all([f.get("owner"), f.get("owner")]);
  assert.equal(f.state.calls.length, 2); assert.equal(f.state.refreshes, 1);
  first.posts[0].caption = "mutated";
  assert.notEqual(second.posts[0].caption, "mutated");
  assert.notEqual((await f.get("owner")).posts[0].caption, "mutated");
  await f.get("another"); assert.equal(f.state.calls.length, 4);
  f.state.now += 5 * 60_000 + 1; await f.get("owner"); assert.equal(f.state.calls.length, 6);
  f.state.accounts.set("owner", account("owner", { connectedAt: 999 }));
  await f.get("owner"); assert.equal(f.state.calls.length, 8);
  f.state.accounts.delete("owner");
  assert.equal((await f.get("owner")).status, "disconnected"); assert.equal(f.state.calls.length, 8);
});

test("wrong /me identity, absent basic scope, changed refreshed account and raw failures are safe", async () => {
  const wrong = fixture({ fetch: async () => Response.json({ user_id: "99999", username: "stranger" }) });
  assert.equal((await wrong.get("owner")).status, "unavailable"); assert.equal(wrong.state.calls.length, 1);
  const missing = fixture({ state: { accounts: new Map([["owner", account("owner", { scopes: [] })]]) } });
  assert.equal((await missing.get("owner")).status, "unavailable"); assert.equal(missing.state.calls.length, 0);
  const changed = fixture({ fresh: () => account("stranger") });
  assert.equal((await changed.get("owner")).status, "unavailable"); assert.equal(changed.state.calls.length, 0);
  const error = fixture({ fetch: async () => { throw new Error("private-token-owner AUTH_SECRET raw private provider error"); } });
  const result = await error.get("owner");
  assert.equal(result.status, "unavailable"); assert.doesNotMatch(JSON.stringify(result), /private-token|AUTH_SECRET|raw private/);
});

test("unsupported media listing falls back only to owned published media IDs in the same account", async () => {
  const base = { userId: "owner", platform: "instagram", status: "posted", mode: "live", accountId: "account-owner", accountUserId: "12345" };
  const f = fixture({ state: { posts: [
    { ...base, publishedMediaId: "10001" }, { ...base, providerId: "55555" },
    { ...base, userId: "stranger", publishedMediaId: "10002" }, { ...base, accountUserId: "old-account", publishedMediaId: "10003" },
    { ...base, deletedAt: 5, publishedMediaId: "10004" }, { ...base, publishedMediaId: "https://attacker.example" },
  ] }, fetch: async url => {
    if (url.pathname.endsWith("/me")) return Response.json({ user_id: "12345", username: "owner" });
    if (url.pathname.endsWith("/media")) return Response.json({ error: { code: 100 } }, { status: 400 });
    assert.equal(url.pathname, "/v24.0/10001"); return Response.json(reel(1));
  } });
  const result = await f.get("owner");
  assert.equal(result.status, "ready"); assert.equal(result.sampleSize, 1);
  assert.deepEqual(f.state.listCalls, ["owner"]); assert.equal(f.state.calls.length, 3);
  assert.match(result.summary, /publicações deste sistema/);
});

test("authentication failures do not fan out to fallback queries or repeat publication", async () => {
  const f = fixture({ fetch: async url => url.pathname.endsWith("/me") ? Response.json({ user_id: "12345" }) : Response.json({ error: { code: 190 } }, { status: 401 }) });
  assert.equal((await f.get("owner")).status, "unavailable");
  assert.equal(f.state.listCalls.length, 0); assert.equal(f.state.calls.length, 2);
  assert.ok(f.state.calls.every(call => call.init.method === "GET"));
});

test("provider response size is bounded even when Content-Length is missing or incorrect", async () => {
  for (const headers of [{}, { "Content-Length": "1" }, { "Content-Length": "2000000" }]) {
    const f = fixture({ fetch: async () => new Response(JSON.stringify({ user_id: "12345", padding: "x".repeat(1_048_576) }), { headers }) });
    const result = await f.get("owner");
    assert.equal(result.status, "unavailable"); assert.equal(f.state.calls.length, 1);
    assert.equal(result.posts.length, 0);
  }
});
