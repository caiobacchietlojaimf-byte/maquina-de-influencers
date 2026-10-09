import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../src/lib/instagram-performance.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const BASIC = "instagram_business_basic", INSIGHTS = "instagram_business_manage_insights";
const connected = (extra = {}) => ({ id: "account-owner", userId: "owner", platform: "instagram", status: "connected", username: "owner", oauthProvider: "instagram",
  accessToken: "sealed-owner", providerUserId: "12345", igUserId: "12345", connectedAt: 123, scopes: [BASIC, "instagram_business_content_publish"], ...extra });
const published = (extra = {}) => ({ id: "post-1", userId: "owner", platform: "instagram", status: "posted", mode: "live", accountId: "account-owner", accountUserId: "12345",
  publishedMediaId: "77777", providerId: "88888", postedUrl: "https://www.instagram.com/reel/RightCode/", ...extra });
const media = (extra = {}) => ({ id: "77777", owner: { id: "12345" }, media_type: "VIDEO", permalink: "https://www.instagram.com/reel/RightCode/", like_count: 0, comments_count: 8, ...extra });
function fixture(options = {}) {
  const state = { now: Date.parse("2026-10-09T12:00:00Z"), account: connected(), posts: [published()], calls: [], refreshes: 0, opens: [], lists: [], accountReads: [], ...options.state };
  class Clock extends Date { static now() { return state.now; } }
  const mocks = {
    "server-only": {}, "./db": {
      getSocialAccount: async (userId, platform) => { state.accountReads.push([userId, platform]); assert.equal(platform, "instagram"); return structuredClone(state.account); },
      listPosts: async userId => { state.lists.push(userId); return structuredClone(state.posts); },
    },
    "./social": { freshSocialAccount: async account => { state.refreshes++; return options.fresh ? options.fresh(account, state) : account; } },
    "./social-token": { openSocialToken: (value, scope) => { state.opens.push([value, scope]); assert.equal(value, "sealed-owner"); assert.equal(scope, "owner:instagram"); return "private-server-token"; } },
  };
  const defaultFetch = async url => {
    if (url.pathname.endsWith("/me")) return Response.json({ user_id: "12345", username: "owner" });
    if (url.pathname.endsWith("/media")) return Response.json({ data: [media()] });
    if (url.pathname.endsWith("/insights")) return Response.json({ data: [{ name: url.searchParams.get("metric"), values: [{ value: 0 }] }] });
    assert.equal(url.pathname, "/v24.0/77777"); return Response.json(media());
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Date: Clock, URL, AbortSignal, structuredClone, TextDecoder,
    require: name => { if (name in mocks) return mocks[name]; throw new Error(`Unexpected dependency ${name}`); },
    fetch: async (value, init) => {
      const url = new URL(value); state.calls.push({ url, init });
      assert.equal(url.origin, "https://graph.instagram.com"); assert.equal(init.method, "GET"); assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store"); assert.equal(url.searchParams.has("access_token"), false);
      assert.equal(init.headers.Authorization, "Bearer private-server-token"); assert.ok(init.signal instanceof AbortSignal);
      return options.fetch ? options.fetch(url, state, defaultFetch) : defaultFetch(url);
    },
  });
  return { state, get: module.exports.getInstagramPostInsights };
}

test("malformed, foreign-owned, deleted, demo and unpublished posts cannot open a token", async () => {
  for (const id of [undefined, null, "", "../secret", "a".repeat(101), {}]) {
    const f = fixture(); assert.equal((await f.get("owner", id)).status, "unavailable");
    assert.equal(f.state.lists.length, 0); assert.equal(f.state.opens.length, 0);
  }
  for (const patch of [{ userId: "stranger" }, { id: "another-post" }, { deletedAt: 5 }, { platform: "tiktok" }, { status: "posting" }, { mode: "demo" }, { mode: undefined }]) {
    const f = fixture({ state: { posts: [published(patch)] } });
    assert.equal((await f.get("owner", "post-1")).status, "unavailable"); assert.equal(f.state.opens.length, 0); assert.equal(f.state.calls.length, 0);
  }
});

test("the publication must be bound to the exact connected account and provider identity", async () => {
  for (const patch of [{ accountId: undefined }, { accountId: "old-connection" }, { accountUserId: undefined }, { accountUserId: "99999" }]) {
    const f = fixture({ state: { posts: [published(patch)] } });
    assert.equal((await f.get("owner", "post-1")).status, "unavailable"); assert.equal(f.state.opens.length, 0);
  }
  for (const account of [undefined, connected({ userId: "stranger" }), connected({ status: "demo" })]) {
    const f = fixture({ state: { account } });
    assert.equal((await f.get("owner", "post-1")).status, "disconnected"); assert.equal(f.state.opens.length, 0);
  }
  for (const patch of [{ oauthProvider: "facebook" }, { providerUserId: "99999" }, { providerUserId: undefined, igUserId: undefined }]) {
    const f = fixture({ state: { account: connected(patch) } });
    assert.equal((await f.get("owner", "post-1")).status, "unavailable"); assert.equal(f.state.opens.length, 0);
  }
});

test("direct published media reads are independent of recent-post limits and never use the upload container", async () => {
  const f = fixture();
  const result = await f.get("owner", "post-1");
  assert.equal(result.status, "ready"); assert.equal(result.mediaId, "77777"); assert.equal(result.metrics.likes, 0); assert.equal(result.metrics.comments, 8);
  assert.equal(result.requiredScope, INSIGHTS); assert.deepEqual(result.metricsAvailable, ["likes", "comments"]);
  assert.deepEqual(f.state.calls.map(call => call.url.pathname), ["/v24.0/me", "/v24.0/77777"]);
  assert.ok(f.state.calls[1].url.searchParams.get("fields").includes("owner"));
  assert.ok(!f.state.calls[1].url.searchParams.get("fields").includes("media_product_type"));
  assert.doesNotMatch(JSON.stringify(result), /private-server-token|sealed-owner|88888/);
});

test("verified /me alone never authorizes a public media object belonging to someone else", async () => {
  for (const patch of [{ owner: { id: "99999" } }, { owner: undefined, username: "owner" }, { owner: { id: 12345 } }, { id: "99999" }]) {
    const f = fixture({ state: { account: connected({ scopes: [BASIC, INSIGHTS] }) }, fetch: (url, _state, fallback) => url.pathname === "/v24.0/77777" ? Response.json(media(patch)) : fallback(url) });
    const result = await f.get("owner", "post-1");
    assert.equal(result.status, "unavailable"); assert.deepEqual(result.metrics, {}); assert.equal(f.state.calls.length, 2);
  }
  const stringOwner = fixture({ fetch: (url, _state, fallback) => url.pathname === "/v24.0/77777" ? Response.json(media({ owner: "12345" })) : fallback(url) });
  assert.equal((await stringOwner.get("owner", "post-1")).status, "ready");
});

test("incorrect /me, changed refreshed connection and missing basic permission fail closed", async () => {
  const wrong = fixture({ fetch: () => Response.json({ user_id: "99999" }) });
  assert.equal((await wrong.get("owner", "post-1")).status, "unavailable"); assert.equal(wrong.state.calls.length, 1);
  for (const patch of [{ id: "another-connection" }, { connectedAt: 999 }, { providerUserId: "99999" }, { status: "demo" }, { scopes: [] }]) {
    const f = fixture({ fresh: account => ({ ...account, ...patch }) });
    assert.equal((await f.get("owner", "post-1")).status, "unavailable"); assert.equal(f.state.calls.length, 0);
  }
});

test("already-granted insight metrics are independent and missing values never become zero", async () => {
  const f = fixture({ state: { account: connected({ scopes: [BASIC, INSIGHTS] }) }, fetch: (url, _state, fallback) => {
    if (!url.pathname.endsWith("/insights")) return fallback(url);
    const metric = url.searchParams.get("metric"); assert.equal(url.searchParams.get("period"), "lifetime");
    if (metric === "views") return Response.json({ data: [{ name: "views", values: [{ value: 0 }] }] });
    if (metric === "reach") return Response.json({ data: [{ name: "reach", total_value: { value: 17 } }] });
    if (metric === "saved") return Response.json({ error: { code: 100, message: "private-server-token" } }, { status: 400 });
    return Response.json({ data: [{ name: "shares", values: [] }, { name: "invented", values: [{ value: 999 }] }] });
  } });
  const result = await f.get("owner", "post-1");
  assert.equal(result.status, "ready"); assert.equal(result.metrics.views, 0); assert.equal(result.metrics.reach, 17);
  assert.equal(result.metrics.saved, undefined); assert.equal(result.metrics.shares, undefined); assert.equal(result.requiredScope, undefined);
  assert.deepEqual(result.metricsAvailable, ["likes", "comments", "views", "reach"]);
  assert.equal(f.state.calls.filter(call => call.url.pathname.endsWith("/insights")).length, 4);
  assert.match(result.message, /não disponibilizou todas/); assert.doesNotMatch(JSON.stringify(result), /private-server-token|invented/);
});

test("hidden, invalid and absent basic counts stay absent even when the other count is zero", async () => {
  const f = fixture({ fetch: (url, _state, fallback) => url.pathname === "/v24.0/77777" ? Response.json(media({ like_count: undefined, comments_count: 0 })) : fallback(url) });
  const result = await f.get("owner", "post-1");
  assert.equal(result.metrics.likes, undefined); assert.equal(result.metrics.comments, 0); assert.equal(result.metrics.views, undefined);
  assert.deepEqual(result.metricsAvailable, ["comments"]);
  for (const invalid of ["15", -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const bad = fixture({ fetch: (url, _state, fallback) => url.pathname === "/v24.0/77777" ? Response.json(media({ like_count: invalid, comments_count: undefined })) : fallback(url) });
    assert.deepEqual((await bad.get("owner", "post-1")).metrics, {});
  }
});

test("legacy lookup requires exact permalink, confirmed media owner and a cursor on the fixed Graph host", async () => {
  const f = fixture({ state: { posts: [published({ publishedMediaId: undefined, postedUrl: "https://instagram.com/reel/RightCode?utm_source=x" })] }, fetch: (url, _state, fallback) => {
    if (!url.pathname.endsWith("/media")) return fallback(url);
    assert.equal(url.pathname, "/v24.0/12345/media"); assert.equal(url.searchParams.get("limit"), "50");
    if (!url.searchParams.has("after")) return Response.json({ data: [media({ id: "100", permalink: "https://www.instagram.com/reel/RightCodeExtra/" }), media({ id: "101", owner: { id: "99999" } })], paging: { next: "https://attacker.example/steal", cursors: { after: "next-page" } } });
    assert.equal(url.searchParams.get("after"), "next-page"); return Response.json({ data: [media()] });
  } });
  const result = await f.get("owner", "post-1");
  assert.equal(result.status, "ready"); assert.equal(result.mediaId, "77777"); assert.equal(f.state.calls.length, 3);
  assert.ok(f.state.calls.every(call => !call.url.pathname.includes("88888")));
});

test("legacy lookup is bounded to 150 media and does not invent a match from a container or username", async () => {
  const f = fixture({ state: { posts: [published({ publishedMediaId: undefined })] }, fetch: (url, state, fallback) => {
    if (!url.pathname.endsWith("/media")) return fallback(url);
    return Response.json({ data: [media({ id: "88888", owner: undefined, username: "owner" })], paging: { next: "https://graph.instagram.com/ignored", cursors: { after: `page-${state.calls.length}` } } });
  } });
  const result = await f.get("owner", "post-1");
  assert.equal(result.status, "unavailable"); assert.match(result.message, /150/); assert.equal(f.state.calls.length, 4);
  assert.equal(result.mediaId, undefined); assert.deepEqual(result.metrics, {});
});

test("invalid provider IDs and legacy links are never used as fetch paths", async () => {
  for (const patch of [{ publishedMediaId: "../me" }, { publishedMediaId: "https://attacker.example" }, { publishedMediaId: undefined, postedUrl: "https://attacker.example/reel/RightCode" }, { publishedMediaId: undefined, postedUrl: undefined }]) {
    const f = fixture({ state: { posts: [published(patch)] } });
    assert.equal((await f.get("owner", "post-1")).status, "unavailable"); assert.equal(f.state.calls.length, 1);
  }
});

test("cache deduplicates, returns copies, expires and is bypassed after connection or media changes", async () => {
  const f = fixture();
  const [a, b] = await Promise.all([f.get("owner", "post-1"), f.get("owner", "post-1")]);
  assert.equal(f.state.calls.length, 2); assert.equal(f.state.refreshes, 1);
  a.metrics.likes = 999; assert.equal(b.metrics.likes, 0); assert.equal((await f.get("owner", "post-1")).metrics.likes, 0);
  f.state.now += 120_001; await f.get("owner", "post-1"); assert.equal(f.state.calls.length, 4);
  f.state.account.connectedAt = 999; await f.get("owner", "post-1"); assert.equal(f.state.calls.length, 6);
  f.state.posts[0].publishedMediaId = "malformed"; assert.equal((await f.get("owner", "post-1")).status, "unavailable"); assert.equal(f.state.calls.length, 7);
  f.state.account = undefined; assert.equal((await f.get("owner", "post-1")).status, "disconnected"); assert.equal(f.state.calls.length, 7);
});

test("a deleted post or newly connected account during Meta reads cannot expose stale metrics", async () => {
  for (const change of [state => { state.posts[0].deletedAt = 5; }, state => { state.posts[0].publishedMediaId = "11111"; }, state => { state.account.connectedAt = 999; }, state => { state.account = undefined; }]) {
    const f = fixture({ fetch: (url, state, fallback) => { if (url.pathname === "/v24.0/77777") change(state); return fallback(url); } });
    const result = await f.get("owner", "post-1");
    assert.equal(result.status, "unavailable"); assert.deepEqual(result.metrics, {}); assert.equal(result.mediaId, undefined);
  }
});

test("raw API errors, malformed JSON and oversized bodies never reach the client", async () => {
  for (const respond of [() => { throw new Error("private-server-token internal secret"); }, () => Response.json({ error: { code: 190, message: "private-server-token" } }, { status: 401 }), () => new Response("not-json"), () => new Response(JSON.stringify({ padding: "x".repeat(1_048_576) }), { headers: { "Content-Length": "1" } })]) {
    const f = fixture({ fetch: respond });
    const result = await f.get("owner", "post-1");
    assert.equal(result.status, "unavailable"); assert.equal(f.state.calls.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /private-server-token|internal secret|not-json/);
  }
});
