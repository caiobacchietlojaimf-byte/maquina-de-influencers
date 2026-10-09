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

test("Instagram credentials accept complete aliases or legacy credentials and trim each pair", () => {
  for (const [env, expected] of [
    [{ ID_INSTAGRAM: " alias-app ", SECRET_INSTAGRAM: " alias-secret \n" }, { appId: "alias-app", appSecret: "alias-secret" }],
    [{ INSTAGRAM_APP_ID: " legacy-app ", INSTAGRAM_APP_SECRET: " legacy-secret \n" }, { appId: "legacy-app", appSecret: "legacy-secret" }],
    [{ ID_INSTAGRAM: " ", SECRET_INSTAGRAM: "\n", INSTAGRAM_APP_ID: "legacy-app", INSTAGRAM_APP_SECRET: "legacy-secret" }, { appId: "legacy-app", appSecret: "legacy-secret" }],
    [{ ID_INSTAGRAM: "alias-app", SECRET_INSTAGRAM: "alias-secret", INSTAGRAM_APP_ID: "legacy-app", INSTAGRAM_APP_SECRET: "legacy-secret" }, { appId: "alias-app", appSecret: "alias-secret" }],
    [{ ID_INSTAGRAM: "alias-app", SECRET_INSTAGRAM: "alias-secret", INSTAGRAM_APP_ID: "incomplete-legacy" }, { appId: "alias-app", appSecret: "alias-secret" }],
  ]) {
    const load = loader({ env });
    const config = load("src/lib/instagram-config.ts").instagramCredentials();
    assert.equal(config.appId, expected.appId); assert.equal(config.appSecret, expected.appSecret);
    assert.equal(load("src/lib/social.ts").instagramOAuthConfigured(), true);
  }
});

test("partial Instagram aliases fail closed without mixing or silently falling back to another app", async () => {
  const legacy = { INSTAGRAM_APP_ID: "legacy-app", INSTAGRAM_APP_SECRET: "legacy-secret" };
  for (const env of [
    {}, { INSTAGRAM_APP_ID: "legacy-app" }, { INSTAGRAM_APP_SECRET: "legacy-secret" },
    { INSTAGRAM_APP_ID: " ", INSTAGRAM_APP_SECRET: "legacy-secret" },
    { INSTAGRAM_APP_ID: "legacy-app", INSTAGRAM_APP_SECRET: " \n" },
    { ID_INSTAGRAM: "alias-app" }, { SECRET_INSTAGRAM: "alias-secret" },
    { ID_INSTAGRAM: "alias-app", INSTAGRAM_APP_SECRET: "legacy-secret" },
    { INSTAGRAM_APP_ID: "legacy-app", SECRET_INSTAGRAM: "alias-secret" },
    { ...legacy, ID_INSTAGRAM: "alias-app" }, { ...legacy, SECRET_INSTAGRAM: "alias-secret" },
    { ...legacy, ID_INSTAGRAM: "alias-app", SECRET_INSTAGRAM: " \n" },
    { ...legacy, ID_INSTAGRAM: " \n", SECRET_INSTAGRAM: "alias-secret" },
    { META_APP_ID: "facebook-app", META_APP_SECRET: "facebook-secret" },
  ]) {
    let requests = 0;
    const load = loader({ env, globals: { fetch: () => { requests++; assert.fail("An incomplete credential pair cannot reach Instagram"); } } });
    assert.equal(load("src/lib/instagram-config.ts").instagramCredentials(), null);
    const social = load("src/lib/social.ts");
    assert.equal(social.instagramOAuthConfigured(), false);
    assert.throws(() => social.instagramAuthorizeUrl("nonce"), /configur/);
    await assert.rejects(() => social.instagramExchangeCode("fake-auth-code"), /configur/);
    assert.equal(requests, 0);
  }
  const noEncryption = loader({ env: { ID_INSTAGRAM: "alias-app", SECRET_INSTAGRAM: "alias-secret", SOCIAL_TOKEN_SECRET: "" } })("src/lib/social.ts");
  assert.equal(noEncryption.instagramOAuthConfigured(), false);
  assert.throws(() => noEncryption.instagramAuthorizeUrl("nonce"), /configur/);
});

test("Instagram authorization and code exchange consistently use the selected complete credential pair", async () => {
  for (const [credentials, appId, appSecret] of [
    [{ ID_INSTAGRAM: " alias-app ", SECRET_INSTAGRAM: " alias-private ", INSTAGRAM_APP_ID: "legacy-app", INSTAGRAM_APP_SECRET: "legacy-private" }, "alias-app", "alias-private"],
    [{ INSTAGRAM_APP_ID: " legacy-app ", INSTAGRAM_APP_SECRET: " legacy-private " }, "legacy-app", "legacy-private"],
  ]) {
    const calls = [];
    const social = loader({ env: { ...credentials, PUBLIC_BASE_URL: "https://app.example" }, globals: { fetch: async (url, init) => {
      calls.push({ url: new URL(url), init });
      if (calls.length === 1) return json({ access_token: "fixture-short", user_id: "123", permissions: ["instagram_business_basic", "instagram_business_content_publish"] });
      if (calls.length === 2) return json({ access_token: "fixture-long", expires_in: 5184000 });
      if (calls.length === 3) return json({ user_id: "123", username: "fixture-creator" });
      assert.fail("Unexpected OAuth request");
    } } })("src/lib/social.ts");
    const authorization = new URL(social.instagramAuthorizeUrl("fixture-state"));
    assert.equal(authorization.searchParams.get("client_id"), appId);
    assert.equal(authorization.searchParams.get("state"), "fixture-state");
    assert.equal(authorization.searchParams.has("client_secret"), false);
    assert.ok(!authorization.href.includes("private"));
    assert.equal(authorization.searchParams.get("redirect_uri"), "https://app.example/api/oauth/instagram/callback");
    const connection = await social.instagramExchangeCode("fixture-auth-code");
    assert.equal(calls.length, 3);
    assert.equal(calls[0].url.href, "https://api.instagram.com/oauth/access_token");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.body.get("client_id"), appId);
    assert.equal(calls[0].init.body.get("client_secret"), appSecret);
    assert.equal(calls[0].init.body.get("code"), "fixture-auth-code");
    assert.equal(calls[0].init.body.get("redirect_uri"), authorization.searchParams.get("redirect_uri"));
    assert.equal(calls[1].url.origin, "https://graph.instagram.com");
    assert.equal(calls[1].url.searchParams.get("client_secret"), appSecret);
    assert.equal(calls[1].url.searchParams.get("access_token"), "fixture-short");
    assert.equal(calls[2].init.headers.Authorization, "Bearer fixture-long");
    assert.equal(connection.accessToken, "fixture-long"); assert.equal(connection.username, "fixture-creator");
    assert.equal(connection.oauthProvider, "instagram");
  }
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

test("confirmed Instagram media ID is saved separately from the upload container for future insights", async () => {
  const f = publisherFixture({
    post: { providerId: "upload-container-id" },
    social: { instagramPublishContainer: async (_account, container) => {
      assert.equal(container, "upload-container-id");
      return { status: "posted", publishedMediaId: "published-media-id", postedUrl: "https://www.instagram.com/reel/actual/" };
    } },
  });
  await f.api.publisherTick();
  assert.equal(f.state().status, "posted");
  assert.equal(f.state().providerId, "upload-container-id");
  assert.equal(f.state().publishedMediaId, "published-media-id");
  assert.equal(f.state().postedUrl, "https://www.instagram.com/reel/actual/");
  assert.ok(f.calls[0].publishStartedAt, "Existing persisted publication boundary must remain intact");
});

test("a published container without a returned media ID cannot invent one or erase a previously known ID", async () => {
  for (const publishedMediaId of [undefined, "known-media-id"]) {
    const f = publisherFixture({
      post: { providerId: "container-only", publishedMediaId },
      social: { instagramContainerStatus: async () => ({ status: "posted" }) },
    });
    await f.api.publisherTick();
    assert.equal(f.state().status, "posted");
    assert.equal(f.state().publishedMediaId, publishedMediaId);
    assert.ok(!f.calls.includes("publish"));
  }
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
  const api = loader({ env: { CRON_SECRET: "cron-private-test" }, mocks: { "@/lib/publisher": { publisherTick: async () => ticks++ }, "@/lib/publication-cron-health": { startPublicationCronRun: async () => ({ id: "test", startedAt: 1 }), finishPublicationCronRun: async () => undefined } } })("src/app/api/cron/publish/route.ts");
  for (const value of [undefined, "cron-private-test", "Bearer wrong", "Bearer cron-private-testx"]) {
    const response = await api.GET(new Request("https://app.example/api/cron/publish", { headers: value ? { authorization: value } : {} }));
    assert.equal(response.status, 401);
  }
  assert.equal(ticks, 0);
  assert.equal((await api.GET(new Request("https://app.example/api/cron/publish", { headers: { authorization: "Bearer cron-private-test" } }))).status, 200);
  assert.equal(ticks, 1);
});
