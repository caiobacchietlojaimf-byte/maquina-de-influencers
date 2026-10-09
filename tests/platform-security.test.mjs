import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const fakeId = "test-key-identifier";
const fakeSecret = "test-secret-not-a-real-credential";
const fakeKey = `${fakeId}:${fakeSecret}`;
function load(fetch, baseUrl = "https://api.higgsfield.ai") {
  const module = { exports: {} };
  const source = readFileSync(new URL("../src/lib/platform.ts", import.meta.url), "utf8");
  assert.match(source, /^import "server-only";/);
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(id) { assert.equal(id, "server-only"); return {}; }, process: { env: { HF_API_KEY: fakeKey, HF_API_BASE_URL: baseUrl } }, fetch, AbortSignal });
  return module.exports;
}

test("generation sends the credential only in a server-side authorization header and refuses redirects", async () => {
  const api = load(async (url, options) => {
    assert.equal(url, "https://api.higgsfield.ai/kling-video/v3/motion-control/std");
    assert.equal(options.headers.Authorization, `Key ${fakeKey}`);
    assert.equal(options.redirect, "error");
    assert.ok(!options.body.includes(fakeKey));
    return Response.json({ request_id: "job-123", status: "queued" });
  });
  const result = await api.submitGeneration("kling-video/v3/motion-control/std", { prompt: "Test" });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { requestId: "job-123", status: "queued" });
});

test("credentials cannot be sent to an untrusted origin or URL containing credentials", async () => {
  for (const origin of ["https://example.com", "http://api.higgsfield.ai", "https://api.higgsfield.ai@evil.example", "https://api.higgsfield.ai.evil.example"]) {
    const api = load(() => { assert.fail("No request should be made"); }, origin);
    assert.equal(api.isConfigured(), false);
    await assert.rejects(api.submitGeneration("model", {}), /Endereço da API/);
  }
});

test("provider errors and status responses cannot echo any credential component", async () => {
  const detail = `Key ${fakeKey}; id=${fakeId}; secret=${fakeSecret}`;
  const api = load(async () => Response.json({ detail }, { status: 401 }));
  await assert.rejects(api.submitGeneration("model", {}), error => {
    const exposed = `${error.message} ${JSON.stringify(error.body)}`;
    for (const secret of [fakeKey, fakeId, fakeSecret]) assert.ok(!exposed.includes(secret));
    return true;
  });
  const statusApi = load(async () => Response.json({ status: "failed", error: detail }));
  const status = await statusApi.getStatus("job-123");
  for (const secret of [fakeKey, fakeId, fakeSecret]) assert.ok(!JSON.stringify(status).includes(secret));
});

test("network errors never expose raw request details", async () => {
  const api = load(async () => { throw new Error(`Request failed: ${fakeKey}`); });
  await assert.rejects(api.submitGeneration("model", {}), error => error.status === 502 && !error.message.includes(fakeKey));
});
