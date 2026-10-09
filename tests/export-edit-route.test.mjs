import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const origin = "https://maquina-de-influencers.vercel.app";
const input = { influencerId: "owned-character", source: { kind: "preset", id: "supercar" }, targetMode: "main", resolution: "auto", engine: "fal-kling-pro" };
const encoder = new TextEncoder();
function loadPure(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(id) { assert.ok(id in mocks); return mocks[id]; } });
  return module.exports;
}
const inputValidation = loadPure("edit-export-input", { "./character-edit": loadPure("character-edit") });
function fixture({ cookie = "valid-session" } = {}) {
  const module = { exports: {} }, starts = [], sessionChecks = [];
  const code = ts.transpileModule(readFileSync(new URL("../src/app/api/character-edit/export/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Buffer, Response, URL,
    require(id) {
      if (id === "next/headers") return { cookies: async () => ({ get: name => {
        assert.equal(name, "mi_session"); return cookie ? { value: cookie } : undefined;
      } }) };
      if (id === "@/lib/auth") return { SESSION_COOKIE: "mi_session", readSessionToken: token => {
        sessionChecks.push(token); return token === "valid-session" ? "owner" : null;
      } };
      if (id === "@/lib/edit-export-input") return inputValidation;
      assert.equal(id, "@/lib/export-edit-stream");
      return { exportEditStream: (body, options) => {
        starts.push({ body, options });
        return new ReadableStream({ start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "result", result: { error: "Test export only" } }) + "\n")); controller.close();
        } });
      } };
    },
  });
  return { POST: module.exports.POST, starts, sessionChecks, exports: module.exports };
}
function request(body = input, headers = {}, extra = {}) {
  return new Request(`${origin}/api/character-edit/export`, {
    method: "POST", headers: { Origin: origin, "X-MI-Export": "1", "Content-Type": "application/json", ...headers },
    body: typeof body === "string" || body instanceof ReadableStream ? body : JSON.stringify(body), ...extra,
  });
}

test("authenticated same-origin export returns an uncached NDJSON stream and forwards cancellation", async () => {
  const f = fixture(), req = request(), response = await f.POST(req);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /^application\/x-ndjson/);
  assert.equal(response.headers.get("Cache-Control"), "no-store, no-transform");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(JSON.parse(JSON.stringify(f.starts[0].body)), input);
  assert.equal(f.starts[0].options.signal, req.signal);
  assert.equal(f.starts.length, 1);
  assert.equal(f.exports.runtime, "nodejs");
  assert.ok(f.exports.maxDuration >= 180);
  assert.equal(JSON.parse((await response.text()).trim()).type, "result");
});

test("missing custom marker or a foreign/missing origin is rejected before authentication and processing", async () => {
  for (const headers of [{ "X-MI-Export": "" }, { "X-MI-Export": "true" }, { Origin: "https://untrusted.example" }, { Origin: "" }, { Origin: `${origin}.untrusted.example` }]) {
    const f = fixture(), response = await f.POST(request(input, headers));
    assert.equal(response.status, 403);
    assert.equal(f.starts.length, 0);
    assert.equal(f.sessionChecks.length, 0);
  }
});

test("missing or invalid session gets 401 without touching video export", async () => {
  for (const cookie of [undefined, "", "expired-or-invalid"]) {
    const f = fixture({ cookie: cookie ?? null }), response = await f.POST(request());
    assert.equal(response.status, 401);
    assert.equal(f.starts.length, 0);
  }
});

test("non-JSON, malformed JSON and invalid reference shapes never start expensive work", async () => {
  const unsupported = fixture();
  assert.equal((await unsupported.POST(request(input, { "Content-Type": "text/plain" }))).status, 415);
  assert.equal(unsupported.starts.length, 0);
  for (const body of ["{broken-json}", "null", "[]", { ...input, influencerId: "" }, { ...input, influencerId: "x".repeat(129) }, { ...input, source: null }, { ...input, source: { kind: "url", url: "https://untrusted.example/video.mp4" } }, { ...input, source: { kind: "preset" } }, { ...input, source: { kind: "upload", token: 123 } }, { ...input, source: { kind: "profile", id: "clip" } }, { ...input, source: { kind: "upload", token: "x".repeat(16385) } }, { ...input, engine: "unknown" }, { ...input, engine: "higgsfield" }, { ...input, targetMode: "manual", target: "short" }, { ...input, engine: "fal-wan", resolution: "720p", targetMode: "manual", target: "main character" }]) {
    const f = fixture(), response = await f.POST(request(body));
    assert.equal(response.status, 400);
    assert.equal(f.starts.length, 0);
  }
});

test("oversized bodies are rejected by both advertised length and actual streamed bytes", async () => {
  const advertised = fixture();
  assert.equal((await advertised.POST(request(input, { "Content-Length": "32769" }))).status, 413);
  assert.equal(advertised.starts.length, 0);
  let cancelled = false;
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode(" ".repeat(20_000)));
    controller.enqueue(encoder.encode(" ".repeat(20_000)));
  }, cancel() { cancelled = true; } });
  const streamed = fixture(), response = await streamed.POST(request(body, {}, { duplex: "half" }));
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert.equal(streamed.starts.length, 0);
});

