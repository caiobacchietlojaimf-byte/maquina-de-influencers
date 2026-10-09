import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const module = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL("../src/lib/finalize-edit-client.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { module, exports: module.exports, AbortController, setTimeout, clearTimeout });
const { canFinalizeExistingEdit, finalizeEditClient } = module.exports;
const video = { id: "owned-video", status: "review", edit: { segments: [{ resultUrl: "https://media.example/part1.mp4" }, { resultUrl: "https://media.example/part2.mp4" }] } };

test("only review edits with every existing result can offer finalization", () => {
  assert.equal(canFinalizeExistingEdit(video), true);
  assert.equal(canFinalizeExistingEdit({ ...video, edit: {}, resultUrl: "https://media.example/result.mp4" }), true);
  for (const invalid of [
    { ...video, status: "completed" }, { ...video, status: "processing" }, { ...video, status: "queued" },
    { ...video, deletedAt: 1 }, { ...video, edit: undefined }, { ...video, edit: {} },
    { ...video, resultUrl: "https://media.example/part1.mp4", edit: { segments: [{ resultUrl: "first" }, {}] } },
  ]) assert.equal(canFinalizeExistingEdit(invalid), false);
});

test("retry sends one same-origin finalize request with the ID only and accepts the completed video", async () => {
  const calls = [];
  const completed = { ...video, status: "completed", resultUrl: "https://media.example/final.mp4", edit: { ...video.edit, audioPreserved: true } };
  const result = await finalizeEditClient(video.id, { fetchImpl: async (...args) => { calls.push(args); return Response.json({ video: completed }); } });
  assert.equal(result.video.status, "completed"); assert.equal(result.video.edit.audioPreserved, true);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], "/api/character-edit/finalize");
  const request = calls[0][1];
  assert.deepEqual(JSON.parse(request.body), { videoId: video.id });
  assert.equal(request.method, "POST"); assert.equal(request.credentials, "same-origin");
  assert.equal(request.cache, "no-store"); assert.equal(request.headers["X-MI-Finalize"], "1");
  assert.equal(request.signal instanceof AbortSignal, true);
});

test("422 retains the updated review video and error, while a different video's response is rejected", async () => {
  const result = await finalizeEditClient(video.id, { fetchImpl: async () => Response.json({ video, error: "Os trechos têm proporções diferentes." }, { status: 422 }) });
  assert.equal(result.video.id, video.id); assert.equal(result.video.status, "review"); assert.match(result.error, /proporções/);
  const wrong = await finalizeEditClient(video.id, { fetchImpl: async () => Response.json({ video: { ...video, id: "other" } }) });
  assert.equal(wrong.video, undefined); assert.ok(wrong.error);
});

test("expired session and already finalizing responses are visible without retrying the endpoint", async () => {
  let calls = 0;
  const session = await finalizeEditClient(video.id, { fetchImpl: async () => { calls++; return new Response(null, { status: 401 }); } });
  assert.match(session.error, /sessão expirou/);
  const conflict = await finalizeEditClient(video.id, { fetchImpl: async () => { calls++; return Response.json({ error: "Esse vídeo já está sendo finalizado." }, { status: 409 }); } });
  assert.match(conflict.error, /já está/); assert.equal(calls, 2);
});

test("deadline and unmount abort release stalled finalizations without submitting again", async () => {
  let signal;
  await assert.rejects(finalizeEditClient(video.id, { timeoutMs: 15, fetchImpl: (_url, request) => { signal = request.signal; return new Promise(() => {}); } }), /limite/);
  assert.equal(signal.aborted, true);
  const abort = new AbortController();
  const pending = finalizeEditClient(video.id, { signal: abort.signal, fetchImpl: async () => new Response(new ReadableStream()) });
  const cancelled = assert.rejects(pending, /conexão/);
  abort.abort(); await cancelled;
  let called = false;
  await assert.rejects(finalizeEditClient(video.id, { signal: abort.signal, fetchImpl: async () => { called = true; return new Response(); } }), /conexão/);
  assert.equal(called, false);
});

test("connection loss reports uncertainty and never automatically retries finalization", async () => {
  let calls = 0;
  await assert.rejects(finalizeEditClient(video.id, { fetchImpl: async () => { calls++; throw new TypeError("Failed to fetch"); } }), /nenhuma nova geração/);
  assert.equal(calls, 1);
});
