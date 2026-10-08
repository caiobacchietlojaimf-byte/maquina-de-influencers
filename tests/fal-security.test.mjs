import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const fakeId = "fal-test-key-identifier";
const fakeSecret = "test-secret-not-a-real-credential";
const fakeKey = `${fakeId}:${fakeSecret}`;
const wan = "fal-ai/wan/v2.2-14b/animate/replace";
const kling = "fal-ai/kling-video/o3/standard/video-to-video/edit";
const klingPro = "fal-ai/kling-video/o3/pro/video-to-video/edit";
function load(fetch, env = {}) {
  const module = { exports: {} };
  const source = readFileSync(new URL("../src/lib/fal.ts", import.meta.url), "utf8");
  assert.match(source, /^import "server-only";/);
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, AbortSignal,
    require(id) { assert.equal(id, "server-only"); return {}; },
    process: { env: { FAL_KEY: fakeKey, ...env } }, fetch,
  });
  return module.exports;
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

test("fal submits only allowlisted edits with server authorization and redirect protection", async () => {
  for (const model of [wan, kling, klingPro]) {
    const api = load(async (url, options) => {
      assert.equal(url, `https://queue.fal.run/${model}`);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, `Key ${fakeKey}`);
      assert.equal(options.redirect, "error");
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal);
      assert.ok(!options.body.includes(fakeKey));
      return Response.json({ request_id: "job-123", response_url: "https://evil.example/result" });
    }, { FAL_API_BASE_URL: "https://evil.example" });
    assert.deepEqual(plain(await api.submitFalGeneration(model, { video_url: "https://example.com/original.mp4" })), { requestId: "job-123" });
  }
});

test("fal rejects unknown models, injected request paths and missing credentials before sending", async () => {
  const noFetch = () => assert.fail("No request should be made");
  const api = load(noFetch);
  for (const model of ["https://evil.example", `${wan}/../../other`, `${wan}?x=1`, "fal-ai/wan", "toString"]) {
    await assert.rejects(api.submitFalGeneration(model, {}), error => error.status === 400);
    await assert.rejects(api.getFalGenerationStatus(model, "job-1"), error => error.status === 400);
  }
  for (const id of ["../job-1", "x/status?secret=1", "https://evil.example", "x%2Fstatus", "", null, undefined]) {
    await assert.rejects(api.getFalGenerationStatus(wan, id), error => error.status === 400);
  }
  const empty = load(noFetch, { FAL_KEY: " " });
  assert.equal(empty.isFalConfigured(), false);
  await assert.rejects(empty.submitFalGeneration(wan, {}), error => error.status === 500);
});

test("fal polling strips model subpaths and never follows response URLs", async () => {
  for (const [model, app] of [[wan, "wan"], [kling, "kling-video"], [klingPro, "kling-video"]]) {
    const calls = [];
    const api = load(async (url, options) => {
      calls.push(url);
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, `Key ${fakeKey}`);
      if (url.endsWith("/status")) return Response.json({ status: "COMPLETED", response_url: "https://evil.example/leak" });
      return Response.json({ video: { url: "https://v3.fal.media/files/result.mp4" } });
    });
    assert.deepEqual(plain(await api.getFalGenerationStatus(model, "job-123")), {
      status: "completed", videoUrl: "https://v3.fal.media/files/result.mp4",
    });
    assert.deepEqual(calls, [
      `https://queue.fal.run/fal-ai/${app}/requests/job-123/status`,
      `https://queue.fal.run/fal-ai/${app}/requests/job-123`,
    ]);
  }
});

test("fal queued and processing states do not request a result; completed errors are failed", async () => {
  for (const [remote, local] of [["IN_QUEUE", "queued"], ["IN_PROGRESS", "processing"]]) {
    let calls = 0;
    const api = load(async url => {
      calls++;
      assert.ok(url.endsWith("/status"));
      return Response.json({ status: remote });
    });
    assert.deepEqual(plain(await api.getFalGenerationStatus(wan, "job-1")), { status: local });
    assert.equal(calls, 1);
  }
  const api = load(async () => Response.json({ status: "COMPLETED", error: "Input video could not be processed", error_type: "INPUT_ERROR" }));
  assert.deepEqual(plain(await api.getFalGenerationStatus(wan, "job-1")), {
    status: "failed", error: "Input video could not be processed",
  });
});

test("fal errors scrub full credentials, components and encoded echoes without exposing raw bodies", async () => {
  const detail = `Key ${fakeKey}; id=${fakeId}; secret=${fakeSecret}; encoded=${encodeURIComponent(fakeKey)}`;
  const assertScrubbed = value => {
    for (const secret of [fakeKey, fakeId, fakeSecret, encodeURIComponent(fakeKey)]) assert.ok(!value.includes(secret));
  };
  const api = load(async () => Response.json({ detail }, { status: 401 }));
  await assert.rejects(api.submitFalGeneration(wan, {}), error => {
    assert.equal(error.status, 401);
    assert.equal(error.body, undefined);
    assertScrubbed(`${error.message} ${JSON.stringify(error)}`);
    return true;
  });
  const statusApi = load(async () => Response.json({ status: "COMPLETED", error: detail }));
  assertScrubbed(JSON.stringify(await statusApi.getFalGenerationStatus(wan, "job-1")));
  const malformed = load(async () => Response.json({ detail: [{ msg: detail }] }, { status: 422 }));
  await assert.rejects(malformed.submitFalGeneration(wan, {}), error => { assertScrubbed(error.message); return true; });
});

test("fal transport failure is uncertain and never retries a paid submission", async () => {
  let calls = 0;
  const api = load(async () => { calls++; throw new Error(`Request failed: ${fakeKey}`); });
  await assert.rejects(api.submitFalGeneration(wan, {}), error => error.status === 502 && !error.message.includes(fakeKey));
  assert.equal(calls, 1);
  const bodyFailure = load(async () => ({ text() { throw new Error(fakeKey); } }));
  await assert.rejects(bodyFailure.submitFalGeneration(wan, {}), error => error.status === 502 && !error.message.includes(fakeKey));
});

test("fal result errors distinguish rejected jobs from polling outages", async () => {
  for (const status of [400, 422, 401, 403, 404, 429, 500, 503]) {
    const api = load(async url => url.endsWith("/status")
      ? Response.json({ status: "COMPLETED" })
      : Response.json({ detail: "Provider error" }, { status }));
    if ([400, 422].includes(status)) {
      assert.deepEqual(plain(await api.getFalGenerationStatus(kling, "job-1")), { status: "failed", error: "Provider error" });
    } else {
      await assert.rejects(api.getFalGenerationStatus(kling, "job-1"), error => error.status === status);
    }
  }
});

test("fal rejects unknown states, absent output and unsafe or credential-bearing video URLs", async () => {
  const unknown = load(async () => Response.json({ status: "SURPRISE" }));
  await assert.rejects(unknown.getFalGenerationStatus(wan, "job-1"), error => error.status === 502);
  for (const result of [{}, { video: {} }, { video: { url: "http://example.com/video.mp4" } }, { video: { url: "https://user:pass@example.com/video.mp4" } }, { video: { url: `https://example.com/${fakeSecret}.mp4` } }]) {
    const api = load(async url => Response.json(url.endsWith("/status") ? { status: "COMPLETED" } : result));
    await assert.rejects(api.getFalGenerationStatus(wan, "job-1"), error => error.status === 502 && !error.message.includes(fakeSecret));
  }
  const noId = load(async () => Response.json({ request_id: "../other" }));
  await assert.rejects(noId.submitFalGeneration(wan, {}), error => error.status === 502);
});
