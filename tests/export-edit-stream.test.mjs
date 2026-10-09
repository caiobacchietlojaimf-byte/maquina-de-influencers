import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const module = { exports: {} };
const source = readFileSync(new URL("../src/lib/export-edit-stream.ts", import.meta.url), "utf8");
assert.match(source, /^import "server-only";/);
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, {
  module, exports: module.exports, ReadableStream, AbortController, TextEncoder,
  setTimeout, clearTimeout, setInterval, clearInterval, console: { warn() {} },
  require(id) {
    if (id === "server-only") return {};
    assert.equal(id, "./export-character-edit");
    return { exportCharacterEdit() { assert.fail("A test must supply its free export worker"); } };
  },
});
const { exportEditStream } = module.exports;
const input = { influencerId: "owned-character", source: { kind: "preset", id: "supercar" }, targetMode: "main", resolution: "auto", engine: "fal-kling-pro" };
const artifact = { url: "https://assets.public.blob.vercel-storage.com/exports/owner/export.zip", filename: "projeto-supercar.zip" };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function events(stream) {
  const text = await new Response(stream).text();
  return text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
}
function client() {
  const clientModule = { exports: {} };
  const clientCode = ts.transpileModule(readFileSync(new URL("../src/lib/export-edit-client.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(clientCode, { module: clientModule, exports: clientModule.exports, AbortController, TextDecoder, URL, setTimeout, clearTimeout });
  return clientModule.exports;
}

test("export stream sends real phases followed by exactly one terminal download", async () => {
  let workerSignal;
  const output = await events(exportEditStream(input, { prepare: async (received, options) => {
    assert.equal(received, input);
    workerSignal = options.signal;
    options.onProgress({ type: "progress", stage: "download", message: "Baixando vídeo…" });
    options.onProgress({ type: "progress", stage: "segments", message: "Preparando dois trechos…" });
    return artifact;
  } }));
  assert.deepEqual(output.filter(event => event.type === "progress").map(event => event.stage), ["auth", "download", "segments"]);
  assert.deepEqual(output.filter(event => event.type === "result"), [{ type: "result", result: artifact }]);
  assert.equal(workerSignal.aborted, true, "Completing the response releases any remaining worker resources");
});

test("a validation error reaches the client and an unexpected worker exception does not leak internals", async () => {
  const invalid = await events(exportEditStream(input, { prepare: async () => ({ error: "Vídeo fora do limite." }) }));
  assert.deepEqual(invalid.at(-1), { type: "result", result: { error: "Vídeo fora do limite." } });
  const failed = await events(exportEditStream(input, { prepare: async () => { throw new Error("private-storage-url?secret=credential"); } }));
  assert.equal(failed.filter(event => event.type === "result").length, 1);
  assert.match(failed.at(-1).result.error, /Nenhuma geração|nenhuma geração/);
  assert.ok(!JSON.stringify(failed).includes("credential"));
});

test("deadline closes a worker that ignores cancellation and ignores its late result", async () => {
  let workerSignal, finishWorker, progress;
  const output = await events(exportEditStream(input, {
    timeoutMs: 20, heartbeatMs: 1000,
    prepare: (_input, options) => {
      workerSignal = options.signal; progress = options.onProgress;
      return new Promise(resolve => { finishWorker = resolve; });
    },
  }));
  assert.equal(workerSignal.aborted, true);
  assert.equal(output.filter(event => event.type === "result").length, 1);
  assert.match(output.at(-1).result.error, /limite de espera/);
  assert.doesNotThrow(() => progress({ type: "progress", stage: "ready", message: "Late progress" }));
  finishWorker(artifact);
  await tick();
});

test("heartbeats repeat the current real phase while the worker is busy", async () => {
  let finishWorker;
  const stream = exportEditStream(input, {
    timeoutMs: 1000, heartbeatMs: 5,
    prepare: (_input, options) => {
      options.onProgress({ type: "progress", stage: "segments", message: "Preparando dois trechos…" });
      return new Promise(resolve => { finishWorker = resolve; });
    },
  });
  const reader = stream.getReader(), decoder = new TextDecoder(), output = [];
  for (let index = 0; index < 3; index++) {
    const chunk = await reader.read();
    output.push(JSON.parse(decoder.decode(chunk.value)));
  }
  assert.deepEqual(output.map(event => event.stage), ["auth", "segments", "segments"]);
  assert.deepEqual(output[1], output[2]);
  finishWorker(artifact);
  const terminal = await reader.read();
  assert.equal(JSON.parse(decoder.decode(terminal.value)).type, "result");
  assert.equal((await reader.read()).done, true);
});

test("client stream cancellation aborts the worker and discards late callbacks", async () => {
  let workerSignal, finishWorker, progress;
  const stream = exportEditStream(input, { prepare: (_input, options) => {
    workerSignal = options.signal; progress = options.onProgress;
    return new Promise(resolve => { finishWorker = resolve; });
  } });
  const reader = stream.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(workerSignal.aborted, true);
  assert.doesNotThrow(() => progress({ type: "progress", stage: "upload", message: "Late upload" }));
  finishWorker(artifact);
  await tick();
  assert.equal((await reader.read()).done, true);
});

test("request disconnect aborts active processing and does not start an already aborted request", async () => {
  const request = new AbortController();
  let workerSignal, finishWorker;
  const pending = events(exportEditStream(input, { signal: request.signal, prepare: (_input, options) => {
    workerSignal = options.signal;
    return new Promise(resolve => { finishWorker = resolve; });
  } }));
  request.abort();
  const output = await pending;
  assert.equal(workerSignal.aborted, true);
  assert.equal(output.filter(event => event.type === "result").length, 0);
  finishWorker(artifact);
  await tick();
  const alreadyAborted = await events(exportEditStream(input, { signal: request.signal, prepare: async () => assert.fail("Cancelled request must not start processing") }));
  assert.deepEqual(alreadyAborted, []);
});

test("the real browser export client consumes the server stream and cancels processing", async () => {
  const { exportEditClient } = client();
  const updates = [];
  const result = await exportEditClient(input, {
    onProgress: event => updates.push(event.stage),
    fetchImpl: async (_url, options) => new Response(exportEditStream(JSON.parse(options.body), {
      signal: options.signal,
      prepare: async (_body, worker) => {
        worker.onProgress({ type: "progress", stage: "segments", message: "Preparando dois trechos…" });
        return artifact;
      },
    })),
  });
  assert.equal(result.package.url, artifact.url);
  assert.deepEqual(updates, ["auth", "segments"]);

  const request = new AbortController();
  let workerSignal;
  const cancelled = exportEditClient(input, {
    signal: request.signal,
    onProgress: () => request.abort(),
    fetchImpl: async (_url, options) => new Response(exportEditStream(JSON.parse(options.body), {
      signal: options.signal,
      prepare: async (_body, worker) => { workerSignal = worker.signal; return new Promise(() => {}); },
    })),
  });
  await assert.rejects(cancelled, error => error.code === "cancelled");
  assert.equal(workerSignal.aborted, true);
});

test("the browser only accepts safe ZIP download filenames on the expected storage path", async () => {
  const { exportEditClient } = client();
  for (const result of [
    { ...artifact, url: "javascript:alert(1)" },
    { ...artifact, url: "https://untrusted.example/exports/file.zip" },
    { ...artifact, url: "https://assets.public.blob.vercel-storage.com.untrusted.example/exports/file.zip" },
    { ...artifact, url: "https://user:password@assets.public.blob.vercel-storage.com/exports/file.zip" },
    { ...artifact, url: "https://assets.public.blob.vercel-storage.com/reference.mp4" },
    { ...artifact, filename: "../file.zip" },
    { ...artifact, filename: "folder\\file.zip" },
    { ...artifact, filename: "file.zip\r\nother" },
    { ...artifact, filename: "file.exe" },
  ]) {
    await assert.rejects(exportEditClient(input, { fetchImpl: async () => new Response(exportEditStream(input, { prepare: async () => result })) }), error => error.code === "response");
  }
  const valid = await exportEditClient(input, { fetchImpl: async () => new Response(exportEditStream(input, { prepare: async () => ({ ...artifact, url: `${artifact.url}?download=1` }) })) });
  assert.equal(valid.package.url, `${artifact.url}?download=1`);
});

