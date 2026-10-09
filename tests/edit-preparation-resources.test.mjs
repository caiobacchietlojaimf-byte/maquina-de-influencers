import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id), Buffer, process, URL, AbortSignal, ...globals });
  return module.exports;
}
const metadata = load("src/lib/video-reference.ts");
const publicIp = [{ address: "8.8.8.8", family: 4 }];
function media(lookup, fetch, globals = {}) {
  return load("src/lib/video-media.ts", { "node:dns/promises": { lookup }, "./video-reference": metadata }, { fetch, ...globals });
}

test("cancelled preparation starts neither DNS nor a video download", async () => {
  let lookups = 0, requests = 0;
  const api = media(async () => { lookups++; return publicIp; }, async () => { requests++; });
  const controller = new AbortController(); controller.abort(new Error("cancelled"));
  await assert.rejects(api.readPublicVideo("https://video.example/original.mp4", undefined, controller.signal), /cancelled/);
  assert.equal(lookups, 0); assert.equal(requests, 0);
});

test("cancellation stops waiting for DNS and a late DNS answer cannot start a fetch", async () => {
  let resolveDns, requests = 0;
  const api = media(() => new Promise(resolve => { resolveDns = resolve; }), async () => { requests++; });
  const controller = new AbortController();
  const preparation = api.readPublicVideo("https://video.example/original.mp4", undefined, controller.signal);
  controller.abort(new Error("cancelled during DNS"));
  await assert.rejects(preparation, /cancelled during DNS/);
  resolveDns(publicIp);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 0);
});

test("all redirects share one deadline rather than receiving another minute each", async () => {
  const signals = [], deadlines = [];
  const api = media(async () => publicIp, async (_url, options) => {
    signals.push(options.signal);
    return signals.length === 1 ? new Response(null, { status: 302, headers: { location: "https://cdn.example/original.mp4" } }) : new Response(Buffer.from("video"));
  }, { AbortSignal: { timeout: ms => { deadlines.push(ms); return AbortSignal.timeout(ms); }, any: AbortSignal.any.bind(AbortSignal) } });
  assert.equal((await api.readPublicVideo("https://video.example/original.mp4")).toString(), "video");
  assert.deepEqual(deadlines, [60000]); assert.equal(signals[0], signals[1]);
});

test("cancellation reaches an in-flight video response body", async () => {
  let downloaded;
  const ready = new Promise(resolve => { downloaded = resolve; });
  const api = media(async () => publicIp, async (_url, options) => {
    const body = new ReadableStream({ start(controller) {
      options.signal.addEventListener("abort", () => controller.error(options.signal.reason), { once: true });
      downloaded();
    } });
    return new Response(body);
  });
  const controller = new AbortController();
  const preparation = api.readPublicVideo("https://video.example/original.mp4", undefined, controller.signal);
  await ready; controller.abort(new Error("cancelled during download"));
  await assert.rejects(preparation, /cancelled during download/);
});

test("cancelled preparation kills and reaps the real FFmpeg process", async () => {
  const controller = new AbortController(); let child, optionsUsed;
  const trackedExec = (...args) => execFile(...args);
  trackedExec[promisify.custom] = (file, args, options) => {
    optionsUsed = options;
    const operation = new Promise((resolve, reject) => {
      child = execFile(file, args, options, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr }));
      child.once("spawn", () => controller.abort(new Error("cancelled during encoding")));
    });
    operation.child = child; return operation;
  };
  const segments = load("src/lib/edit-segments.ts", { "./video-reference": metadata, "node:child_process": { execFile: trackedExec } });
  const original = readFileSync(new URL("../public/reel-videos/Dd_qcXdgsdb.mp4", import.meta.url));
  await assert.rejects(segments.splitEditSource(original, metadata.mp4Metadata(original).duration, { signal: controller.signal }), /cancelled during encoding/);
  assert.equal(optionsUsed.signal, controller.signal); assert.equal(optionsUsed.killSignal, "SIGKILL");
  assert.ok(child.exitCode !== null || child.signalCode !== null, "the child must have exited before preparation rejects");
  assert.throws(() => process.kill(child.pid, 0), error => error.code === "ESRCH");
});
