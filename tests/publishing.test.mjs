import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadTs(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(
    readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require: (id) =>
        id === "server-only" ? {} : id in mocks ? mocks[id] : id === "./db" ? {} : id === "./social-token" ? { openSocialToken: value => value, socialTokenConfigured: () => false } : require(id),
      process: { env: {} },
      URLSearchParams,
      AbortSignal,
      setTimeout,
      console,
      ...globals,
    },
    { filename: file },
  );
  return module.exports;
}
const caption = loadTs("src/lib/publish-caption.ts");
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

test("Brasília scheduling is independent of the server timezone", () => {
  const timestamp = caption.parsePublishDate("2026-10-08T18:30");
  assert.equal(new Date(timestamp).toISOString(), "2026-10-08T21:30:00.000Z");
  assert.equal(caption.publishDateValue(timestamp), "2026-10-08T18:30");
});

test("caption base has one chosen CTA and only user-provided scene details", () => {
  const result = caption.buildCaption({
    topic: "Dança na praia",
    goal: "saves",
    character: "Luna",
  });
  assert.ok(result.includes("Dança na praia"));
  assert.ok(result.includes(caption.CAPTION_GOALS.saves.cta));
  assert.equal(caption.inspectCaption(result).hashtags.length, 3);
  assert.equal(caption.buildCaption({ topic: " ", goal: "comments" }), "");
  assert.ok(caption.inspectCaption("x".repeat(126)).warnings.length > 0);
});

test("Instagram waits for FINISHED before calling media_publish", async () => {
  const calls = [];
  const api = loadTs(
    "src/lib/social.ts",
    {},
    {
      fetch: async (url) => {
        calls.push(url);
        return json({ status_code: "IN_PROGRESS" });
      },
    },
  );
  assert.equal(
    (
      await api.instagramContainerStatus(
        { igUserId: "account", accessToken: "test" },
        "container",
      )
    ).status,
    "pending",
  );
  assert.equal(calls.length, 1);
  assert.ok(!calls.some((url) => url.includes("media_publish")));
});

test("Instagram publishes processed media and returns the actual permalink", async () => {
  const responses = [
    { id: "media" },
    { permalink: "https://www.instagram.com/reel/real/" },
  ];
  const calls = [];
  const api = loadTs(
    "src/lib/social.ts",
    {},
    {
      fetch: async (url) => {
        calls.push(url);
        return json(responses.shift());
      },
    },
  );
  const result = await api.instagramPublishContainer(
    { igUserId: "account", accessToken: "test" },
    "container",
  );
  assert.equal(result.status, "posted");
  assert.equal(result.postedUrl, "https://www.instagram.com/reel/real/");
  assert.ok(calls[0].endsWith("/media_publish"));
});

test("TikTok upload is pending until the provider confirms PUBLISH_COMPLETE", async () => {
  const responses = [
    { data: { status: "PROCESSING_DOWNLOAD" }, error: { code: "ok" } },
    {
      data: {
        status: "PUBLISH_COMPLETE",
        publicaly_available_post_id: ["123"],
      },
      error: { code: "ok" },
    },
  ];
  const api = loadTs(
    "src/lib/social.ts",
    {},
    { fetch: async () => json(responses.shift()) },
  );
  const account = { username: "example", accessToken: "test" };
  assert.equal(
    (await api.tiktokPostStatus(account, "upload")).status,
    "pending",
  );
  const complete = await api.tiktokPostStatus(account, "upload");
  assert.equal(complete.status, "posted");
  assert.equal(complete.postedUrl, "https://www.tiktok.com/@example/video/123");
});

function publisherFixture(post, account, claimed = true) {
  const changes = [];
  let sends = 0;
  account = { id: "account", providerUserId: "profile", ...account };
  post = { accountId: "account", accountUserId: "profile", ...post };
  const api = loadTs("src/lib/publisher.ts", {
    "./db": {
      listPendingPosts: async () => [],
      listDuePosts: async () => [post],
      claimPostWork: async () => claimed ? { ...post, status: "posting", leaseId: "lease" } : undefined,
      getPostOwnerAccount: async () => account,
      getVideo: async () => ({ status: "completed", resultUrl: "https://example.com/video.mp4" }),
      savePostWork: async (current, value) => { changes.push(value); return { ...current, ...value }; },
    },
    "./social": {
      freshSocialAccount: async a => a,
      SocialApiError: class extends Error {},
      validateTikTokOptions() {}, validateTikTokMediaUrl() {},
      tiktokCreatorInfo: async () => ({}),
      tiktokPublish: async () => { sends++; return "provider-id"; },
      instagramCreateContainer: async () => { sends++; return "container"; },
    },
  });
  return { api, changes, sends: () => sends };
}

test("a scheduled demo never becomes a real post after account connection", async () => {
  const fixture = publisherFixture(
    { id: "post", mode: "demo", platform: "tiktok" },
    { status: "connected" },
  );
  await fixture.api.publisherTick();
  assert.equal(fixture.sends(), 0);
  assert.equal(fixture.changes[0].status, "failed");
  assert.equal(fixture.changes[0].postedUrl, undefined);
});

test("real jobs never silently change into simulations", async () => {
  const fixture = publisherFixture(
    { id: "post", mode: "live", platform: "tiktok" },
    { status: "demo" },
  );
  await fixture.api.publisherTick();
  assert.equal(fixture.sends(), 0);
  assert.equal(fixture.changes[0].status, "failed");
});

test("an accepted TikTok upload is saved as processing with provider ID", async () => {
  const fixture = publisherFixture(
    { id: "post", mode: "live", platform: "tiktok" },
    { status: "connected" },
  );
  await fixture.api.publisherTick();
  assert.equal(fixture.sends(), 1);
  assert.ok(fixture.changes[0].submissionStartedAt);
  assert.equal(fixture.changes[1].providerId, "provider-id");
});

test("a job already claimed by another worker is not sent again", async () => {
  const fixture = publisherFixture(
    { id: "post", mode: "live", platform: "tiktok" },
    { status: "connected" },
    false,
  );
  await fixture.api.publisherTick();
  assert.equal(fixture.sends(), 0);
  assert.equal(fixture.changes.length, 0);
});

function actionFixture(overrides = {}) {
  let connections = 0;
  let created;
  const db = {
    upsertSocialAccount: async () => {
      connections++;
    },
    getVideo: async () => ({
      id: "video",
      status: "completed",
      resultUrl: "https://example.com/video.mp4",
    }),
    getSocialAccount: async () => ({ status: "demo" }),
    listPosts: async () => [],
    createPost: async (post) => {
      created = post;
      return { ...post, id: "post" };
    },
    ...overrides,
  };
  const api = loadTs("src/app/actions/posts.ts", {
    "next/cache": { revalidatePath() {} },
    "next/server": { after() {} },
    "next/headers": {},
    "@/lib/social-oauth-state": {},
    "@/lib/auth": { requireUser: async () => ({ id: "user", name: "User" }) },
    "@/lib/db": db,
    "@/lib/publisher": {
      publisherTick: async () =>
        assert.fail("No publishing while preparing draft"),
    },
    "@/lib/social": { instagramOAuthConfigured: () => false },
    "@/lib/publish-caption": caption,
  });
  return { api, connections: () => connections, created: () => created };
}

test("unconfigured Instagram OAuth does not create a demo account", async () => {
  const fixture = actionFixture();
  const result = await fixture.api.connectInstagramAction();
  assert.ok(result.error);
  assert.equal(fixture.connections(), 0);
});

test("past schedules are rejected instead of published immediately", async () => {
  const fixture = actionFixture();
  const result = await fixture.api.schedulePostAction({
    requestKey: "request-123456789012345",
    videoId: "video",
    platform: "instagram",
    caption: "A scene",
    scheduledAt: Date.now() - 60_000,
  });
  assert.ok(result.error);
  assert.equal(fixture.created(), undefined);
});

test("drafts persist without a social connection and do not invoke publishing", async () => {
  const fixture = actionFixture({
    getSocialAccount: async () =>
      assert.fail("Draft must not require an account"),
  });
  const result = await fixture.api.savePostDraftAction({
    requestKey: "request-123456789012345",
    videoId: "video",
    platform: "instagram",
    caption: "Rascunho",
  });
  assert.equal(result.post.status, "draft");
  assert.equal(fixture.created().caption, "Rascunho");
});

test("a draft owned by a different user cannot be edited or scheduled", async () => {
  const fixture = actionFixture({ listPosts: async () => [] });
  const saved = await fixture.api.savePostDraftAction({
    id: "other-user-draft",
    requestKey: "request-123456789012345",
    videoId: "video",
    platform: "instagram",
    caption: "Rascunho",
  });
  const scheduled = await fixture.api.schedulePostAction({
    draftId: "other-user-draft",
    requestKey: "request-123456789012345",
    videoId: "video",
    platform: "instagram",
    caption: "Rascunho",
  });
  assert.ok(saved.error);
  assert.ok(scheduled.error);
  assert.equal(fixture.created(), undefined);
});

test("caption length is validated on the server before creating a post", async () => {
  const fixture = actionFixture();
  const result = await fixture.api.schedulePostAction({
    requestKey: "request-123456789012345",
    videoId: "video",
    platform: "instagram",
    caption: "x".repeat(2201),
  });
  assert.ok(result.error);
  assert.equal(fixture.created(), undefined);
});

test("Instagram rejects an errored container without attempting to publish", async () => {
  const calls = [];
  const api = loadTs(
    "src/lib/social.ts",
    {},
    {
      fetch: async (url) => {
        calls.push(url);
        return json({ status_code: "ERROR" });
      },
    },
  );
  const result = await api.instagramContainerStatus(
    { igUserId: "account", accessToken: "test" },
    "container",
  );
  assert.equal(result.status, "failed");
  assert.equal(calls.length, 1);
});
