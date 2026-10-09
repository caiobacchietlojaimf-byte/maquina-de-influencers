import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const origin = "https://maquina-de-influencers.vercel.app";
const videoId = "11111111-1111-4111-8111-111111111111";
function fixture({ user = { id: "owner" }, result = { status: 200, video: { id: videoId, status: "completed" } } } = {}) {
  const module = { exports: {} }, calls = [], auth = [];
  const code = ts.transpileModule(readFileSync(new URL("../src/app/api/character-edit/finalize/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Response, URL, require(id) {
    if (id === "@/lib/auth") return { currentUser: async () => { auth.push(true); return user; } };
    assert.equal(id, "@/lib/retry-video-finalization");
    return { retryVideoFinalization: async (...args) => { calls.push(args); return result; } };
  } });
  return { ...module.exports, calls, auth };
}
function request(body = { videoId }, headers = {}) {
  return new Request(`${origin}/api/character-edit/finalize`, { method: "POST", headers: { Origin: origin, "X-MI-Finalize": "1", "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

test("authenticated same-origin recovery forwards only the owner and selected video and disables response caching", async () => {
  const f = fixture(), response = await f.POST(request());
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).video.id, videoId);
  assert.deepEqual(f.calls, [["owner", videoId]]);
  assert.equal(f.runtime, "nodejs"); assert.equal(f.dynamic, "force-dynamic"); assert.ok(f.maxDuration >= 210);
});

test("foreign/missing origin or custom marker is rejected before checking a session or assembling", async () => {
  for (const headers of [{ Origin: "" }, { Origin: "https://evil.example" }, { Origin: `${origin}.evil.example` }, { "X-MI-Finalize": "" }, { "X-MI-Finalize": "true" }]) {
    const f = fixture(), response = await f.POST(request({ videoId }, headers));
    assert.equal(response.status, 403); assert.equal(f.calls.length, 0); assert.equal(f.auth.length, 0);
  }
});

test("missing session cannot recover a video", async () => {
  const f = fixture({ user: null }), response = await f.POST(request());
  assert.equal(response.status, 401); assert.equal(f.calls.length, 0);
});

test("unsupported content types and malformed or oversized requests never reach the recovery service", async () => {
  const unsupported = fixture();
  assert.equal((await unsupported.POST(request({ videoId }, { "Content-Type": "text/plain" }))).status, 415);
  assert.equal(unsupported.calls.length, 0);
  for (const body of ["{invalid", "null", "[]", {}, { videoId: "" }, { videoId: 1 }, { videoId: "not-a-uuid" }, { videoId: "z".repeat(36) }, { videoId, padding: "x".repeat(1024) }]) {
    const f = fixture(), response = await f.POST(request(body));
    assert.equal(response.status, 400); assert.equal(f.calls.length, 0);
  }
});

test("review videos remain available in the 422 response and lease conflicts retain 409", async () => {
  const review = { id: videoId, status: "review", resultUrl: "https://media.example/result.mp4" };
  const f = fixture({ result: { status: 422, video: review, error: "Ainda precisa de revisão." } });
  const response = await f.POST(request());
  assert.equal(response.status, 422); assert.deepEqual(await response.json(), { video: review, error: "Ainda precisa de revisão." });
  const busy = fixture({ result: { status: 409, error: "Já está sendo finalizado." } });
  assert.equal((await busy.POST(request())).status, 409);
});
