import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../src/lib/instagram-performance.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const BASIC = "instagram_business_basic";
function setup(options = {}) {
  const state = {
    account: { id: "connection", userId: "owner", platform: "instagram", status: "connected", username: "name", oauthProvider: "instagram", providerUserId: "12345", igUserId: "12345", accessToken: "sealed", connectedAt: 100, scopes: [BASIC] },
    post: { id: "post-1", userId: "owner", platform: "instagram", status: "posted", mode: "live", accountId: "connection", accountUserId: "12345", publishedMediaId: "77777", providerId: "88888", postedUrl: "https://www.instagram.com/reel/RightCode/", caption: "Old caption in the database" },
    media: { id: "77777", owner: { id: "12345" }, caption: "  Legenda atual no Instagram.\n\n#Passeio  ", permalink: "https://www.instagram.com/reel/RightCode/" },
    calls: [], reads: [], tokens: 0, ...options.state,
  };
  const modules = {
    "server-only": {},
    "./db": {
      listPosts: async userId => { state.reads.push(userId); return state.post ? [structuredClone(state.post)] : []; },
      getSocialAccount: async (userId, platform) => { assert.equal(userId, "owner"); assert.equal(platform, "instagram"); return structuredClone(state.account); },
    },
    "./social": { freshSocialAccount: async account => options.fresh ? options.fresh(account) : account },
    "./social-token": { openSocialToken: (value, owner) => { assert.equal(value, "sealed"); assert.equal(owner, "owner:instagram"); state.tokens++; return "private-token"; } },
  };
  const normal = async url => {
    if (url.pathname.endsWith("/me")) return Response.json({ user_id: "12345" });
    if (url.pathname.endsWith("/media")) return Response.json({ data: [state.media] });
    assert.equal(url.pathname, "/v24.0/77777"); return Response.json(state.media);
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, URL, AbortSignal, TextDecoder, structuredClone,
    require: name => { if (name in modules) return modules[name]; throw new Error(`Unexpected dependency ${name}`); },
    fetch: async (value, init) => {
      const url = new URL(value); state.calls.push({ url, init });
      assert.equal(url.origin, "https://graph.instagram.com"); assert.equal(init.method, "GET");
      assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store"); assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.headers.Authorization, "Bearer private-token"); assert.equal(url.searchParams.has("access_token"), false);
      return options.fetch ? options.fetch(url, state, normal) : normal(url);
    },
  });
  return { state, get: module.exports.getInstagramPublishedCaption };
}

test("current published caption is exact, owned, sourced live and tied to a connection snapshot", async () => {
  const f = setup();
  const result = await f.get("owner", "post-1");
  assert.equal(result.status, "ready"); assert.equal(result.caption, f.state.media.caption);
  assert.notEqual(result.caption, f.state.post.caption);
  assert.equal(result.publishedMediaId, "77777"); assert.equal(result.accountId, "connection");
  assert.equal(result.accountUserId, "12345"); assert.equal(result.connectedAt, 100); assert.ok(Number.isFinite(result.checkedAt));
  assert.equal(result.permalink, "https://www.instagram.com/reel/RightCode/");
  assert.ok(f.state.calls[1].url.searchParams.get("fields").split(",").includes("caption"));
  assert.doesNotMatch(JSON.stringify(result), /private-token|sealed|88888/);
});

test("empty caption is a confirmed value but missing, null, non-text or oversized captions are not", async () => {
  const empty = setup(); empty.state.media.caption = "";
  assert.equal((await empty.get("owner", "post-1")).caption, "");
  for (const missing of [undefined, null, 123, "x".repeat(10_001)]) {
    const f = setup(); f.state.media.caption = missing;
    const result = await f.get("owner", "post-1");
    assert.equal(result.status, "unavailable"); assert.equal(result.caption, undefined);
    assert.equal(f.state.post.caption, "Old caption in the database");
  }
});

test("explicit checks do not reuse a stale caption result", async () => {
  const f = setup();
  const first = await f.get("owner", "post-1");
  f.state.media.caption = "Legenda alterada no Instagram depois da primeira consulta.";
  const next = await f.get("owner", "post-1");
  assert.notEqual(first.caption, next.caption); assert.equal(next.caption, f.state.media.caption);
  assert.equal(f.state.calls.length, 4);
});

test("simultaneous checks share only inflight requests and receive isolated return objects", async () => {
  const f = setup();
  const [first, other] = await Promise.all([f.get("owner", "post-1"), f.get("owner", "post-1")]);
  assert.equal(f.state.calls.length, 2); assert.equal(f.state.tokens, 1);
  first.caption = "mutated client result"; assert.notEqual(other.caption, first.caption);
  await f.get("owner", "post-1"); assert.equal(f.state.calls.length, 4);
});

test("invalid selections, foreign posts and disconnected or changed accounts never open credentials", async () => {
  for (const id of [undefined, null, "", "../secret", "x".repeat(101)]) {
    const f = setup(); assert.equal((await f.get("owner", id)).status, "unavailable"); assert.equal(f.state.tokens, 0);
  }
  for (const patch of [{ userId: "foreign" }, { status: "scheduled" }, { mode: "demo" }, { deletedAt: 1 }, { platform: "tiktok" }, { accountId: "old" }, { accountUserId: "99999" }]) {
    const f = setup(); Object.assign(f.state.post, patch);
    assert.equal((await f.get("owner", "post-1")).status, "unavailable"); assert.equal(f.state.tokens, 0);
  }
  const disconnected = setup({ state: { account: undefined } });
  assert.equal((await disconnected.get("owner", "post-1")).status, "disconnected"); assert.equal(disconnected.state.tokens, 0);
  const changed = setup({ fresh: account => ({ ...account, connectedAt: 101 }) });
  assert.equal((await changed.get("owner", "post-1")).status, "unavailable"); assert.equal(changed.state.tokens, 0);
});

test("wrong /me identity cannot read media or return the database caption", async () => {
  const f = setup({ fetch: () => Response.json({ user_id: "99999" }) });
  const result = await f.get("owner", "post-1");
  assert.equal(result.status, "unavailable"); assert.equal(result.caption, undefined); assert.equal(f.state.calls.length, 1);
});

test("missing owner or unsupported direct owner field uses a caption from the verified account edge", async () => {
  for (const unsupported of [false, true]) {
    const f = setup({ fetch: (url, state, normal) => {
      if (url.pathname === "/v24.0/77777") return unsupported
        ? Response.json({ error: { code: 100, message: "owner field unavailable private-token" } }, { status: 400 })
        : Response.json({ ...state.media, owner: { id: "different-namespace" }, caption: "Unverified object caption" });
      if (url.pathname.endsWith("/media")) {
        assert.equal(url.pathname, "/v24.0/12345/media"); assert.ok(!url.searchParams.get("fields").includes("owner"));
        return Response.json({ data: [{ ...state.media, owner: undefined }] });
      }
      return normal(url);
    } });
    const result = await f.get("owner", "post-1");
    assert.equal(result.status, "ready"); assert.equal(result.caption, f.state.media.caption); assert.equal(f.state.calls.length, 3);
  }
});

test("an omitted direct caption can be confirmed by a fresh account-edge response", async () => {
  const f = setup({ fetch: (url, state, normal) => url.pathname === "/v24.0/77777" ? Response.json({ ...state.media, caption: undefined }) : normal(url) });
  assert.equal((await f.get("owner", "post-1")).caption, f.state.media.caption); assert.equal(f.state.calls.length, 3);
});

test("legacy posts resolve by exact permalink and never query their container as media", async () => {
  const f = setup(); delete f.state.post.publishedMediaId; delete f.state.media.owner;
  const result = await f.get("owner", "post-1");
  assert.equal(result.status, "ready"); assert.equal(result.publishedMediaId, "77777");
  assert.deepEqual(f.state.calls.map(call => call.url.pathname), ["/v24.0/me", "/v24.0/12345/media"]);
});

test("fallback never confuses another media ID or permalink with this post", async () => {
  for (const patch of [{ id: "55555" }, { permalink: "https://www.instagram.com/reel/OtherCode/" }]) {
    const f = setup({ fetch: (url, state, normal) => {
      if (url.pathname === "/v24.0/77777") return Response.json({ ...state.media, owner: undefined });
      if (url.pathname.endsWith("/media")) return Response.json({ data: [{ ...state.media, ...patch }] });
      return normal(url);
    } });
    const result = await f.get("owner", "post-1");
    assert.equal(result.status, "unavailable"); assert.equal(result.caption, undefined);
  }
});

test("connection changes, post replacement and deletion during reads discard the live caption", async () => {
  for (const change of [state => { state.account.connectedAt = 999; }, state => { state.post.deletedAt = 5; }, state => { state.post.publishedMediaId = "11111"; }]) {
    const f = setup({ fetch: (url, state, normal) => { if (url.pathname === "/v24.0/77777") change(state); return normal(url); } });
    const result = await f.get("owner", "post-1"); assert.equal(result.status, "unavailable"); assert.equal(result.caption, undefined);
  }
});

test("provider errors reveal no credentials and do not masquerade as confirmed saved text", async () => {
  const f = setup({ fetch: () => { throw new Error("private-token provider raw response"); } });
  const result = await f.get("owner", "post-1");
  assert.equal(result.status, "unavailable"); assert.equal(result.caption, undefined);
  assert.doesNotMatch(JSON.stringify(result), /private-token|provider raw|Old caption/);
});
