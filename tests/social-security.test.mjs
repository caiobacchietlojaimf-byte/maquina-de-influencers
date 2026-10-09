import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const secret = "42".repeat(32);
function loader({ env = {}, mocks = {}, globals = {} } = {}) {
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
    }, process: { env: { SOCIAL_TOKEN_SECRET: secret, ...env }, cwd: () => root }, Buffer, URL, URLSearchParams, AbortSignal, Response, Request, fetch: () => assert.fail("Unexpected network access"), setTimeout, clearTimeout, console, ...globals }, { filename: file });
    return module.exports;
  }
  return load;
}
function cleanup(directory) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.match(path.basename(directory), /^mi-social-test-/);
  rmSync(directory, { recursive: true });
}
const json = data => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
const realAccount = { id: "account", userId: "u", platform: "instagram", status: "connected", username: "name", connectedAt: 1, igUserId: "123", providerUserId: "123", oauthProvider: "instagram" };
const options = { privacyLevel: "SELF_ONLY", allowComment: false, allowDuet: false, allowStitch: false, brandOrganic: false, brandedContent: false, consentAt: Date.now() };

test("social tokens use random authenticated encryption bound to user and network", () => {
  const token = loader()("src/lib/social-token.ts");
  const a = token.sealSocialToken("private-access-token", "u:instagram");
  const b = token.sealSocialToken("private-access-token", "u:instagram");
  assert.notEqual(a, b); assert.ok(!a.includes("private-access-token"));
  assert.equal(token.openSocialToken(a, "u:instagram"), "private-access-token");
  assert.throws(() => token.openSocialToken(a, "other:instagram"));
  assert.throws(() => token.openSocialToken(a, "u:tiktok"));
  assert.throws(() => token.openSocialToken(a.slice(0, -3) + "xxx", "u:instagram"));
  assert.throws(() => token.openSocialToken("legacy-plaintext", "u:instagram"));
});

test("OAuth nonce requires matching signed cookie, user, platform and unexpired timestamp", () => {
  let now = 100000;
  class Clock extends Date { static now() { return now; } }
  const oauth = loader({ globals: { Date: Clock } })("src/lib/social-oauth-state.ts");
  const state = oauth.createOAuthState("u", "instagram");
  assert.notEqual(state, oauth.createOAuthState("u", "instagram"));
  assert.equal(oauth.verifyOAuthState(state, state, "u", "instagram"), true);
  for (const values of [[state, undefined, "u", "instagram"], [state, state, "other", "instagram"], [state, state, "u", "tiktok"], [state + "x", state + "x", "u", "instagram"]]) assert.equal(oauth.verifyOAuthState(...values), false);
  now += 601000;
  assert.equal(oauth.verifyOAuthState(state, state, "u", "instagram"), false);
});

test("Instagram authorization uses its own app ID and only profile/publish permissions", () => {
  const social = loader({ env: { INSTAGRAM_APP_ID: "instagram-id", INSTAGRAM_APP_SECRET: "server-secret", META_APP_ID: "different-facebook-id", PUBLIC_BASE_URL: "https://app.example" } })("src/lib/social.ts");
  const url = new URL(social.instagramAuthorizeUrl("nonce"));
  assert.equal(url.hostname, "www.instagram.com");
  assert.equal(url.searchParams.get("client_id"), "instagram-id");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.example/api/oauth/instagram/callback");
  assert.equal(url.searchParams.get("scope"), "instagram_business_basic,instagram_business_content_publish");
  assert.ok(!url.href.includes("server-secret"));
});

test("tokens are ciphertext on disk and refresh cannot resurrect a disconnected account", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mi-social-test-"));
  try {
    const db = loader({ env: { DATA_DIR: dir } })("src/lib/db.ts");
    const account = await db.upsertSocialAccount({ ...realAccount, accessToken: "ACCESS-PRIVATE", refreshToken: "REFRESH-PRIVATE" });
    const disk = readFileSync(path.join(dir, "db.json"), "utf8");
    assert.ok(!disk.includes("ACCESS-PRIVATE") && !disk.includes("REFRESH-PRIVATE"));
    assert.match(account.accessToken, /^enc:v1:/);
    await db.deleteSocialAccount("u", "instagram");
    assert.equal(await db.refreshSocialAccountTokens(account, { accessToken: "NEW", expiresAt: Date.now() + 100000 }), undefined);
    assert.equal(await db.getSocialAccount("u", "instagram"), undefined);
  } finally { cleanup(dir); }
});

test("scheduler leases reject stale workers and deduplicate request IDs", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mi-social-test-"));
  try {
    const db = loader({ env: { DATA_DIR: dir } })("src/lib/db.ts");
    const input = { id: "post", userId: "u", platform: "instagram", videoId: "v", caption: "x", scheduledAt: 1, status: "scheduled" };
    const first = await db.createPostOnce(input), repeated = await db.createPostOnce({ ...input, caption: "changed" });
    assert.equal(repeated.caption, "x");
    const [a, b] = await Promise.all([db.claimPostWork(first, 100), db.claimPostWork(first, 100)]);
    assert.ok(a); assert.equal(b, undefined);
    const checkpoint = await db.savePostWork(a, { submissionStartedAt: 100 }, false);
    assert.equal(await db.savePostWork(a, { providerId: "stale" }), undefined);
    assert.equal(await db.claimPostWork(checkpoint, 200), undefined);
    const recovered = await db.claimPostWork(checkpoint, 100000);
    assert.ok(recovered); assert.equal(recovered.submissionStartedAt, 100);
    assert.equal(await db.savePostWork(checkpoint, { providerId: "stale" }), undefined);
  } finally { cleanup(dir); }
});

test("TikTok options use server creator limits and exact verified URL prefix boundaries", () => {
  const social = loader({ env: { TIKTOK_VERIFIED_MEDIA_PREFIXES: "https://videos.example/owned/" } })("src/lib/social.ts");
  const creator = { privacyOptions: ["SELF_ONLY"], commentDisabled: true, duetDisabled: true, stitchDisabled: true, maxDuration: 30 };
  assert.doesNotThrow(() => social.validateTikTokOptions(options, creator, 17));
  for (const value of [{ ...options, privacyLevel: "PUBLIC_TO_EVERYONE" }, { ...options, allowComment: true }, { ...options, brandedContent: true }, { ...options, consentAt: 0 }]) assert.throws(() => social.validateTikTokOptions(value, creator, 17));
  assert.throws(() => social.validateTikTokOptions(options, creator, 31));
  assert.doesNotThrow(() => social.validateTikTokMediaUrl("https://videos.example/owned/v.mp4"));
  for (const url of ["https://videos.example.evil/owned/v.mp4", "https://videos.example/owned-other/v.mp4", "http://videos.example/owned/v.mp4", "https://user@videos.example/owned/v.mp4"]) assert.throws(() => social.validateTikTokMediaUrl(url));
});

test("TikTok sends the chosen privacy/disclosures and AIGC flag, with encrypted tokens decrypted only server-side", async () => {
  const calls = [];
  const load = loader({ env: { TIKTOK_VERIFIED_MEDIA_PREFIXES: "https://videos.example/" }, globals: { fetch: async (url, init) => { calls.push([url, init]); return json({ data: { publish_id: "id" }, error: { code: "ok" } }); } } });
  const crypto = load("src/lib/social-token.ts");
  const social = load("src/lib/social.ts");
  await social.tiktokPublish({ ...realAccount, platform: "tiktok", accessToken: crypto.sealSocialToken("secret-token", "u:tiktok") }, { videoUrl: "https://videos.example/v.mp4", caption: "My caption", options });
  const body = JSON.parse(calls[0][1].body);
  assert.equal(body.post_info.privacy_level, "SELF_ONLY");
  assert.equal(body.post_info.disable_comment, true);
  assert.equal(body.post_info.brand_content_toggle, false);
  assert.equal(body.post_info.is_aigc, true);
  assert.equal(calls[0][1].headers.Authorization, "Bearer secret-token");
  assert.ok(!calls[0][0].includes("secret-token"));
});

function publisherFixture(overrides = {}) {
  let state = { id: "post", userId: "u", accountId: "account", accountUserId: "123", platform: "instagram", status: "posting", mode: "live", scheduledAt: 1, createdAt: Date.now(), leaseId: undefined, ...overrides.post };
  const calls = [];
  class SocialApiError extends Error { constructor(message, uncertain = false, retryable = false) { super(message); Object.assign(this, { uncertain, retryable }); } }
  const social = { SocialApiError, freshSocialAccount: async a => a, instagramContainerStatus: async () => ({ status: "ready" }), instagramPublishContainer: async () => { calls.push("publish"); return { status: "posted" }; }, instagramCreateContainer: async () => { calls.push("create"); return "container"; }, ...overrides.social };
  const db = {
    listPendingPosts: async () => state.status === "posting" ? [{ ...state }] : [], listDuePosts: async () => [],
    claimPostWork: async p => { if (state.leaseId) return; state = { ...p, leaseId: "lease" }; return { ...state }; },
    getPostOwnerAccount: async () => ({ ...realAccount, ...overrides.account }),
    getVideo: async () => ({ status: "completed", resultUrl: "https://video.example/v.mp4", ...overrides.video }),
    savePostWork: async (p, patch, release = true) => { if (p.leaseId !== state.leaseId) return; calls.push({ ...patch }); state = { ...state, ...patch, ...(release ? { leaseId: undefined } : {}) }; return { ...state }; },
  };
  const api = loader({ mocks: { "./db": db, "./social": social } })("src/lib/publisher.ts");
  return { api, calls, state: () => state, SocialApiError };
}

test("a crashed submission without provider ID is quarantined and never sent again", async () => {
  const f = publisherFixture({ post: { submissionStartedAt: Date.now() - 100000 } });
  await f.api.publisherTick();
  assert.equal(f.state().status, "failed"); assert.equal(f.state().publicationUncertain, true);
  assert.ok(!f.calls.includes("create"));
});

test("media_publish has a persisted boundary before the request and is called once", async () => {
  const f = publisherFixture({ post: { providerId: "container" } });
  await f.api.publisherTick();
  assert.ok(f.calls[0].publishStartedAt);
  assert.equal(f.calls[1], "publish"); assert.equal(f.state().status, "posted");
  await f.api.publisherTick(); assert.equal(f.calls.filter(v => v === "publish").length, 1);
});

test("ambiguous Instagram publication polls the original container without republishing", async () => {
  const f = publisherFixture({ post: { providerId: "container", publishStartedAt: Date.now() - 10000 } });
  await f.api.publisherTick();
  assert.equal(f.state().status, "posting"); assert.ok(!f.calls.includes("publish"));
});

test("changing the connected account cannot redirect an existing scheduled post", async () => {
  const f = publisherFixture({ account: { providerUserId: "different" } });
  await f.api.publisherTick();
  assert.equal(f.state().status, "failed"); assert.ok(!f.calls.includes("create"));
});

test("a removed video is never uploaded by a previously scheduled job", async () => {
  const f = publisherFixture({ video: { deletedAt: Date.now() } });
  await f.api.publisherTick();
  assert.equal(f.state().status, "failed"); assert.ok(!f.calls.includes("create"));
});

test("cancelling a scheduled job retains its idempotency tombstone", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mi-social-test-"));
  try {
    const db = loader({ env: { DATA_DIR: dir } })("src/lib/db.ts");
    const input = { id: "cancelled", userId: "u", platform: "instagram", videoId: "v", caption: "x", scheduledAt: 1, status: "scheduled" };
    const original = await db.createPostOnce(input);
    assert.equal(await db.deletePost("other", original.id), false);
    assert.equal(await db.deletePost("u", original.id), true);
    assert.equal((await db.listDuePosts(Date.now())).length, 0);
    assert.equal((await db.listPosts("u")).length, 0);
    assert.equal(await db.claimPostWork(original, Date.now()), undefined);
    assert.ok((await db.createPostOnce(input)).deletedAt);
  } finally { cleanup(dir); }
});

test("Instagram callback rejects a forged state before token exchange and clears the nonce", async () => {
  let exchanges = 0, cleared = 0;
  const cookie = "invalid-cookie";
  const load = loader({ env: { PUBLIC_BASE_URL: "https://app.example" }, mocks: {
    "next/server": { NextResponse: { redirect: url => ({ url, headers: new Headers(), cookies: { set: () => cleared++ } }) } },
    "@/lib/auth": { SESSION_COOKIE: "session", readSessionToken: () => "u" },
    "@/lib/db": { upsertSocialAccount: () => assert.fail("No write without OAuth verification") },
    "@/lib/social": { publicBaseUrl: () => "https://app.example", instagramExchangeCode: () => { exchanges++; } },
  } });
  const route = load("src/app/api/oauth/instagram/callback/route.ts");
  const response = await route.GET({ url: "https://app.example/api/oauth/instagram/callback?code=test&state=forged", cookies: { get: () => ({ value: cookie }) } });
  assert.equal(response.url, "https://app.example/app/publicar?erro=oauth");
  assert.equal(exchanges, 0); assert.equal(cleared, 1);
});

test("cron accepts only the exact configured bearer secret", async () => {
  let ticks = 0;
  const api = loader({ env: { CRON_SECRET: "cron-private-test" }, mocks: { "@/lib/publisher": { publisherTick: async () => ticks++ } } })("src/app/api/cron/publish/route.ts");
  for (const value of [undefined, "cron-private-test", "Bearer wrong", "Bearer cron-private-testx"]) {
    const response = await api.GET(new Request("https://app.example/api/cron/publish", { headers: value ? { authorization: value } : {} }));
    assert.equal(response.status, 401);
  }
  assert.equal(ticks, 0);
  assert.equal((await api.GET(new Request("https://app.example/api/cron/publish", { headers: { authorization: "Bearer cron-private-test" } }))).status, 200);
  assert.equal(ticks, 1);
});
