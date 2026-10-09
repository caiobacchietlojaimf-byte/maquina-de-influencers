import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test, { after } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id), Buffer, process, console });
  return module.exports;
}
const media = load("src/lib/video-reference.ts");
const continuity = load("src/lib/edit-continuity.ts", { "./video-reference": media });
const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
const directory = mkdtempSync(path.join(tmpdir(), "mi-test-continuity-"));
after(() => rmSync(directory, { recursive: true, force: true }));
const ff = args => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1", ...args], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
let serial = 0;
function source({ duration = 17, audio = false, vfr = false, bframes = false, gop = 120 } = {}) {
  const file = path.join(directory, `source-${serial++}.mp4`);
  ff(["-f", "lavfi", "-i", `testsrc2=size=96x160:rate=30:duration=${duration}`,
    ...(audio ? ["-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${duration + 0.13}`] : []),
    ...(vfr ? ["-vf", "settb=1/120,setpts=if(lt(N\\,225)\\,N*4\\,900+(N-225)*5)", "-enc_time_base", "1:120", "-vsync", "0"] : []),
    "-c:v", "libx264", "-crf", "17", "-preset", "veryfast", "-threads", "1", "-g", String(gop), "-bf", bframes ? "3" : "0",
    ...(audio ? ["-c:a", "aac"] : ["-an"]), "-movflags", "+faststart", "-y", file]);
  const bytes = readFileSync(file);
  return { file, bytes, metadata: media.mp4Metadata(bytes) };
}
const decode = file => ff(["-i", file, "-map", "0:v:0", "-vf", "scale=32:32,format=gray", "-vsync", "0", "-f", "rawvideo", "pipe:1"]);
function compareFrames(actual, original, first, count) {
  assert.equal(actual.length, count * 1024);
  for (let frame = 0; frame < count; frame++) {
    let difference = 0;
    for (let pixel = 0; pixel < 1024; pixel++) difference += Math.abs(actual[frame * 1024 + pixel] - original[(first + frame) * 1024 + pixel]);
    assert.ok(difference / 1024 < 3, `Frame ${first + frame} must retain the source picture and position`);
  }
}

test("continuous plans cover 3–30 seconds with shared context and never exceed 15 seconds per input", () => {
  for (const duration of [3, 14.999, 15, 15.001, 17, 29, 29.5, 29.50001, 30]) {
    const plan = continuity.planContinuousSegments(duration);
    assert.equal(plan.length, duration <= 15 ? 1 : duration <= 29.5 ? 2 : 3);
    assert.equal(plan[0].start, 0);
    assert.ok(Math.abs(plan.at(-1).start + plan.at(-1).duration - duration) < 1e-9);
    for (const [index, part] of plan.entries()) {
      assert.ok(part.duration >= 3 && part.duration <= 15);
      if (index) assert.ok(Math.abs(plan[index - 1].start + plan[index - 1].duration - part.start - 0.5) < 1e-9);
    }
  }
  for (const duration of [0, 2.999, 30.001, NaN, Infinity]) assert.throws(() => continuity.planContinuousSegments(duration));
});

test("a 15-second video with a longer audio tail produces ONE silent 15-second input and preserves all 450 frames", async () => {
  const original = source({ duration: 15, audio: true });
  assert.ok(original.metadata.duration > 15);
  assert.equal(original.metadata.videoDuration, 15);
  assert.equal(original.metadata.frameCount, 450);
  const progress = [], parts = await continuity.splitContinuousEditSource(original.bytes, original.metadata.duration, { onProgress: (completed, total) => progress.push([completed, total]) });
  assert.equal(parts.length, 1);
  assert.equal(parts[0].start, 0);
  const result = media.mp4Metadata(parts[0].bytes);
  assert.equal(result.duration, 15); assert.equal(result.videoDuration, 15);
  assert.equal(result.hasAudio, false); assert.equal(result.frameCount, 450);
  const file = path.join(directory, "audio-tail-remux.mp4"); writeFileSync(file, parts[0].bytes);
  assert.deepEqual(decode(file), decode(original.file), "Removing the audio tail must not re-encode any picture");
  assert.deepEqual(progress, [[0, 1], [1, 1]]);
});

test("short sources remain byte-identical and a mismatched duration fails before processing", async () => {
  const original = source({ duration: 5 });
  const parts = await continuity.splitContinuousEditSource(original.bytes, original.metadata.duration);
  assert.equal(parts.length, 1); assert.equal(parts[0].bytes, original.bytes);
  await assert.rejects(continuity.splitContinuousEditSource(original.bytes, 20), /duração/);
});

test("two and three inputs overlap the exact same original frames and their union covers the entire video", async () => {
  for (const duration of [17, 29.5, 30]) {
    const original = source({ duration }), originalPictures = decode(original.file);
    const progress = [];
    const parts = await continuity.splitContinuousEditSource(original.bytes, original.metadata.duration, { onProgress: (completed, total) => progress.push([completed, total]) });
    assert.equal(parts.length, duration > 29.5 ? 3 : 2);
    const coverage = new Uint8Array(original.metadata.frameCount), frameRanges = [];
    for (const [index, part] of parts.entries()) {
      const metadata = media.mp4Metadata(part.bytes), first = Math.round(part.start * 30);
      assert.ok(metadata.duration >= 3 && metadata.duration <= 15);
      assert.equal(metadata.hasAudio, false);
      assert.equal(metadata.width, original.metadata.width); assert.equal(metadata.height, original.metadata.height);
      assert.ok(Math.abs(part.start - first / 30) < 1e-9);
      const file = path.join(directory, `overlap-${duration}-${index}.mp4`); writeFileSync(file, part.bytes);
      compareFrames(decode(file), originalPictures, first, metadata.frameCount);
      for (let frame = first; frame < first + metadata.frameCount; frame++) coverage[frame]++;
      frameRanges.push({ first, end: first + metadata.frameCount });
    }
    assert.ok(coverage.every(count => count >= 1), "No original frame may be omitted");
    assert.ok(coverage.some(count => count === 2), "Inputs must share actual temporal context");
    for (let index = 1; index < frameRanges.length; index++) assert.ok(Math.abs((frameRanges[index - 1].end - frameRanges[index].first) / 30 - 0.5) <= 1 / 30 + 1e-9);
    assert.deepEqual(progress.at(-1), [parts.length, parts.length]);
  }
});

test("B-frame presentation order is respected rather than cutting in MP4 decode order", async () => {
  const original = source({ duration: 17, bframes: true }), originalPictures = decode(original.file);
  const parts = await continuity.splitContinuousEditSource(original.bytes, original.metadata.duration);
  for (const [index, part] of parts.entries()) {
    const metadata = media.mp4Metadata(part.bytes), first = Math.round(part.start * 30);
    const file = path.join(directory, `bframes-${index}.mp4`); writeFileSync(file, part.bytes);
    compareFrames(decode(file), originalPictures, first, metadata.frameCount);
  }
});

test("variable-frame-rate sources report real source timestamps instead of duration divided by frame count", async () => {
  const original = source({ duration: 15, vfr: true, gop: 9999 });
  const parts = await continuity.splitContinuousEditSource(original.bytes, original.metadata.duration);
  assert.equal(parts.length, 2);
  const originalPictures = decode(original.file), firstPart = media.mp4Metadata(parts[0].bytes);
  const expectedFirst = Math.round((parts[1].start - 7.5) * 24) + 225;
  assert.ok(parts[1].start > 7.5);
  assert.ok(Math.abs(parts[1].start - (7.5 + (expectedFirst - 225) / 24)) < 0.002);
  assert.ok(Math.abs(parts[1].start - expectedFirst * original.metadata.videoDuration / original.metadata.frameCount) > 0.1, "The fixture must exercise a genuinely nonuniform timeline");
  assert.ok(firstPart.frameCount > expectedFirst);
  const secondFile = path.join(directory, "vfr-second.mp4"); writeFileSync(secondFile, parts[1].bytes);
  compareFrames(decode(secondFile), originalPictures, expectedFirst, media.mp4Metadata(parts[1].bytes).frameCount);
});

test("usable sync samples take the lossless fast path instead of re-encoding the original", async () => {
  const original = source({ duration: 17 }), commands = [];
  const trackedExec = (...args) => execFile(...args);
  trackedExec[promisify.custom] = (file, args, options) => {
    commands.push(args);
    return promisify(execFile)(file, args, options);
  };
  const tracked = load("src/lib/edit-continuity.ts", { "./video-reference": media, "node:child_process": { execFile: trackedExec } });
  const parts = await tracked.splitContinuousEditSource(original.bytes, original.metadata.duration);
  assert.equal(parts.length, 2); assert.equal(commands.length, 2);
  assert.ok(commands.every(args => args[args.indexOf("-c:v") + 1] === "copy"));
  const originalPictures = decode(original.file);
  for (const [index, part] of parts.entries()) {
    const metadata = media.mp4Metadata(part.bytes), first = Math.round(part.start * 30);
    const file = path.join(directory, `lossless-${index}.mp4`); writeFileSync(file, part.bytes);
    assert.deepEqual(decode(file), originalPictures.subarray(first * 1024, (first + metadata.frameCount) * 1024));
  }
});

test("cancellation before encoding starts no FFmpeg and cancellation in an encode reaps its child", async () => {
  const original = source({ duration: 17 });
  const cancelled = new AbortController(); cancelled.abort(new Error("cancelled before start"));
  await assert.rejects(continuity.splitContinuousEditSource(original.bytes, original.metadata.duration, { signal: cancelled.signal }), /cancelled before start/);
  const abort = new AbortController(); let child, used;
  const trackedExec = (...args) => execFile(...args);
  trackedExec[promisify.custom] = (file, args, options) => {
    used = options;
    const operation = new Promise((resolve, reject) => {
      child = execFile(file, args, options, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr }));
      child.once("spawn", () => abort.abort(new Error("cancelled during encode")));
    });
    operation.child = child; return operation;
  };
  const tracked = load("src/lib/edit-continuity.ts", { "./video-reference": media, "node:child_process": { execFile: trackedExec } });
  await assert.rejects(tracked.splitContinuousEditSource(original.bytes, original.metadata.duration, { signal: abort.signal }), /cancelled during encode/);
  assert.equal(used.signal, abort.signal); assert.equal(used.killSignal, "SIGKILL");
  assert.ok(child.exitCode !== null || child.signalCode !== null);
  assert.throws(() => process.kill(child.pid, 0), error => error.code === "ESRCH");
});
