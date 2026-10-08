import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id), Buffer, process });
  return module.exports;
}
const media = load("src/lib/video-reference.ts");
const segments = load("src/lib/edit-segments.ts", { "./video-reference": media });
const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
const original = readFileSync(new URL("../public/reel-videos/Dd_qcXdgsdb.mp4", import.meta.url));
const originalMetadata = media.mp4Metadata(original);
const ff = args => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });

test("segment plan covers all time with adjacent ranges and no unsupported short tail", () => {
  for (const duration of [3, 14.999, 15, 15.001, 17.157, 29.08, 30]) {
    const plan = segments.planEditSegments(duration);
    assert.equal(plan[0].start, 0);
    assert.equal(plan.reduce((sum, part) => sum + part.duration, 0), duration);
    for (const [index, part] of plan.entries()) {
      assert.ok(part.duration >= 3 && part.duration <= 15);
      if (index) assert.equal(part.start, plan[index - 1].start + plan[index - 1].duration);
    }
  }
  for (const duration of [0, 2.99, 30.001, NaN, Infinity]) assert.throws(() => segments.planEditSegments(duration));
});

test("actual 17-second fixture retains all 409 frames in order across split and assembly", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-segments-"));
  try {
    const prepared = await segments.splitEditSource(original, originalMetadata.duration);
    assert.equal(prepared.length, 2);
    for (const part of prepared) {
      const metadata = media.mp4Metadata(part.bytes);
      assert.ok(metadata.duration >= 3 && metadata.duration <= 15);
      assert.equal(metadata.width, 720); assert.equal(metadata.height, 1280); assert.equal(metadata.hasAudio, false);
    }
    assert.ok(Math.abs(prepared.reduce((sum, part) => sum + part.duration, 0) - originalMetadata.duration) <= 0.15);
    const joined = await segments.joinEditedSegments(prepared.map(part => part.bytes));
    const joinedMetadata = media.mp4Metadata(joined);
    assert.equal(joinedMetadata.width, 720); assert.equal(joinedMetadata.height, 1280);
    assert.equal(joinedMetadata.hasAudio, false);
    assert.ok(Math.abs(joinedMetadata.duration - originalMetadata.duration) <= 0.15);
    const sourcePath = path.join(directory, "source.mp4"), resultPath = path.join(directory, "joined.mp4");
    writeFileSync(sourcePath, original); writeFileSync(resultPath, joined);
    const decode = file => ff(["-i", file, "-map", "0:v:0", "-vf", "scale=32:32,format=gray", "-vsync", "0", "-f", "rawvideo", "pipe:1"]);
    const sourceFrames = decode(sourcePath), resultFrames = decode(resultPath);
    assert.equal(sourceFrames.length / 1024, 409);
    assert.equal(resultFrames.length, sourceFrames.length, "no frame may be removed or duplicated");
    for (let frame = 0; frame < 409; frame++) {
      let difference = 0;
      for (let pixel = frame * 1024; pixel < (frame + 1) * 1024; pixel++) difference += Math.abs(sourceFrames[pixel] - resultFrames[pixel]);
      assert.ok(difference / 1024 < 5, `frame ${frame} must remain in its original position`);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("silent sources split without synthesizing audio; short sources remain byte-identical", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-silent-segments-"));
  try {
    const sourcePath = path.join(directory, "original.mp4"), silentPath = path.join(directory, "silent.mp4"), shortPath = path.join(directory, "short.mp4");
    writeFileSync(sourcePath, original);
    ff(["-i", sourcePath, "-map", "0:v:0", "-c", "copy", "-an", "-y", silentPath]);
    const silent = readFileSync(silentPath), metadata = media.mp4Metadata(silent);
    const parts = await segments.splitEditSource(silent, metadata.duration);
    assert.equal(parts.length, 2); assert.ok(parts.every(part => !media.mp4Metadata(part.bytes).hasAudio));
    ff(["-i", silentPath, "-t", "5", "-c", "copy", "-y", shortPath]);
    const short = readFileSync(shortPath);
    const shortParts = await segments.splitEditSource(short, media.mp4Metadata(short).duration);
    assert.equal(shortParts.length, 1); assert.equal(shortParts[0].bytes, short);
    assert.equal(await segments.joinEditedSegments([short]), short);
    await assert.rejects(segments.splitEditSource(original, 20));
    await assert.rejects(segments.joinEditedSegments([]));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a 30-second source yields two valid 15-second segments, and incompatible outputs cannot be joined", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-boundary-segments-"));
  try {
    const sourcePath = path.join(directory, "thirty.mp4");
    ff(["-f", "lavfi", "-i", "testsrc2=size=96x160:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=29.9", "-t", "30", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-y", sourcePath]);
    const source = readFileSync(sourcePath), metadata = media.mp4Metadata(source);
    assert.equal(metadata.duration, 30);
    const parts = await segments.splitEditSource(source, metadata.duration);
    assert.equal(parts.length, 2);
    assert.equal(parts[0].duration, 15); assert.equal(parts[1].duration, 15);
    assert.equal(media.mp4Metadata(await segments.joinEditedSegments(parts.map(part => part.bytes))).duration, 30);
    await assert.rejects(segments.joinEditedSegments([parts[0].bytes, original]), /dimensões diferentes/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
