import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const module = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL("../src/lib/prepare-edit-client.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { module, exports: module.exports, AbortController, TextDecoder, setTimeout, clearTimeout });
const { prepareEditClient } = module.exports;
const encoder = new TextEncoder();
const input = { influencerId: "owned-character", source: { kind: "preset", id: "reference" }, targetMode: "main", resolution: "auto", engine: "fal-kling-pro" };
const quote = { token: "signed-quote", metadata: { duration: 17.157, width: 720, height: 1280, hasAudio: true }, estimatedUsd: 3.03 };
const progress = { type: "progress", stage: "download", message: "Conferindo vídeo e referência…" };
const terminal = { type: "result", result: { quote } };
const ndjson = events => events.map(event => JSON.stringify(event)).join("\n");
function responseFromChunks(chunks) {
  return new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } }), { headers: { "Content-Type": "application/x-ndjson" } });
}

test("preparation sends only a same-origin preparation request and decodes progress split across UTF-8 bytes", async () => {
  const calls = [], updates = [];
  const bytes = encoder.encode(ndjson([progress, terminal]));
  const result = await prepareEditClient(input, {
    fetchImpl: async (...args) => { calls.push(args); return responseFromChunks(Array.from(bytes, byte => new Uint8Array([byte]))); },
    onProgress: event => updates.push(event),
  });
  assert.equal(result.quote.token, quote.token);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].message, progress.message);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/character-edit/prepare");
  assert.equal(calls[0][1].credentials, "same-origin");
  assert.equal(calls[0][1].cache, "no-store");
  assert.equal(calls[0][1].headers["X-MI-Prepare"], "1");
  assert.equal(calls[0][1].signal instanceof AbortSignal, true);
  assert.deepEqual(JSON.parse(calls[0][1].body), input);
});

test("multiple events per chunk and a server terminal error resolve without waiting for an open stream", async () => {
  const updates = [];
  let cancelled = false;
  const result = await prepareEditClient(input, {
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode(ndjson([progress, { type: "result", result: { error: "Vídeo fora do limite de duração." } }]) + "\n")); },
      cancel() { cancelled = true; },
    })),
    onProgress: event => updates.push(event),
  });
  assert.equal(result.error, "Vídeo fora do limite de duração.");
  assert.equal(updates.length, 1);
  assert.equal(cancelled, true);
});

test("EOF without a terminal result and a broken stream are reported as lost connections", async () => {
  await assert.rejects(prepareEditClient(input, { fetchImpl: async () => responseFromChunks([encoder.encode(JSON.stringify(progress) + "\n")]) }), error => error.code === "connection");
  await assert.rejects(prepareEditClient(input, { fetchImpl: async () => new Response(new ReadableStream({ start(controller) { controller.error(new TypeError("Connection reset")); } })) }), error => error.code === "connection");
});

test("malformed JSON, oversized events and missing quote fields are rejected", async () => {
  for (const content of ["{broken}\n", "x".repeat(262_145), JSON.stringify({ type: "result", result: { quote: { token: "invalid" } } })]) {
    await assert.rejects(prepareEditClient(input, { fetchImpl: async () => responseFromChunks([encoder.encode(content)]) }), error => error.code === "response");
  }
});

test("401 expires the session and server timeout statuses end preparation with a specific error", async () => {
  for (const [status, expected] of [[401, "session"], [408, "timeout"], [504, "timeout"], [500, "response"]]) {
    await assert.rejects(prepareEditClient(input, { fetchImpl: async () => new Response(null, { status }) }), error => error.code === expected);
  }
});

test("client deadline aborts a stalled response and a stalled connection", async () => {
  let signal, cancelled = false;
  await assert.rejects(prepareEditClient(input, {
    timeoutMs: 15,
    fetchImpl: async (_url, request) => { signal = request.signal; return new Response(new ReadableStream({ cancel() { cancelled = true; } })); },
  }), error => error.code === "timeout");
  assert.equal(signal.aborted, true);
  assert.equal(cancelled, true);
  await assert.rejects(prepareEditClient(input, { timeoutMs: 15, fetchImpl: () => new Promise(() => {}) }), error => error.code === "timeout");
});

test("cancel immediately aborts preparation, drops delayed progress and allows a fresh request", async () => {
  const abort = new AbortController();
  let stream, signal;
  const updates = [];
  const pending = prepareEditClient(input, {
    signal: abort.signal,
    fetchImpl: async (_url, request) => { signal = request.signal; return new Response(new ReadableStream({ start(controller) { stream = controller; } })); },
    onProgress: event => updates.push(event),
  });
  const cancelled = assert.rejects(pending, error => error.code === "cancelled");
  await new Promise(resolve => setTimeout(resolve, 0));
  abort.abort();
  await cancelled;
  assert.equal(signal.aborted, true);
  assert.equal(updates.length, 0);
  assert.throws(() => stream.enqueue(encoder.encode(ndjson([progress, terminal]))));
  const result = await prepareEditClient(input, { fetchImpl: async () => responseFromChunks([encoder.encode(JSON.stringify(terminal))]) });
  assert.equal(result.quote.token, quote.token);
});

test("an already cancelled preparation never opens a request", async () => {
  const abort = new AbortController(); abort.abort();
  let fetched = false;
  await assert.rejects(prepareEditClient(input, { signal: abort.signal, fetchImpl: async () => { fetched = true; return new Response(); } }), error => error.code === "cancelled");
  assert.equal(fetched, false);
});

test("cancelling on progress prevents a buffered terminal result from completing the old request", async () => {
  const abort = new AbortController();
  await assert.rejects(prepareEditClient(input, {
    signal: abort.signal,
    fetchImpl: async () => responseFromChunks([encoder.encode(ndjson([progress, terminal]) + "\n")]),
    onProgress: () => abort.abort(),
  }), error => error.code === "cancelled");
});
