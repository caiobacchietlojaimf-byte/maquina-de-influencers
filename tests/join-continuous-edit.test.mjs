import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
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
const timing = load("src/lib/edit-segments.ts", { "./video-reference": media });
const join = load("src/lib/join-continuous-edit.ts", { "./video-reference": media, "./edit-segments": timing }).joinContinuousEditSegments;
const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
const ff = args => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
const encode = ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-crf", "17", "-threads", "2", "-pix_fmt", "yuv420p"];
const WIDTH = 160, HEIGHT = 96, SAMPLE_PIXELS = 32 * 24;

function source(directory, seconds = 9, fps = 24, width = WIDTH) {
  const file = path.join(directory, `source-${fps}-${width}-${seconds}.mp4`);
  // Frame number changes the background luminance; the bright marker also
  // moves in X. Duplication, missing overlap or any timestamp shift is visible.
  const pattern = `color=c=black:s=${width}x${HEIGHT}:r=${fps}:d=${seconds},geq=lum='32+mod(N*7,128)+64*between(X,mod(N*3,${width - 20}),mod(N*3,${width - 20})+12)':cb=128:cr=128`;
  ff(["-f", "lavfi", "-i", pattern, "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${seconds}`, "-t", String(seconds), ...encode, "-c:a", "aac", "-y", file]);
  return file;
}

function parts(directory, original, ranges, fps = 24, extra = []) {
  return ranges.map(([start, frames], index) => {
    const file = path.join(directory, `part-${index}-${Math.random().toString(36).slice(2)}.mp4`);
    const filter = `trim=start_frame=${start}:end_frame=${start + frames},setpts=PTS-STARTPTS${extra[index] ? `,${extra[index]}` : ""}`;
    ff(["-threads", "1", "-i", original, "-map", "0:v:0", "-an", "-vf", filter, ...encode, "-y", file]);
    const bytes = readFileSync(file);
    return { bytes, file, start: start / fps, source: media.mp4Metadata(bytes) };
  });
}

function decode(file) {
  return ff(["-threads", "1", "-i", file, "-map", "0:v:0", "-an", "-vf", "scale=32:24:flags=area,format=gray", "-vsync", "0", "-f", "rawvideo", "pipe:1"]);
}

function difference(a, aFrame, b, bFrame) {
  let delta = 0;
  for (let pixel = 0; pixel < SAMPLE_PIXELS; pixel++) delta += Math.abs(a[aFrame * SAMPLE_PIXELS + pixel] - b[bFrame * SAMPLE_PIXELS + pixel]);
  return delta / SAMPLE_PIXELS;
}

async function assemble(directory, prepared, name = "joined.mp4") {
  const output = await join(prepared.map(part => part.bytes), prepared.map(({ start, source }) => ({ start, source })));
  const file = path.join(directory, name);
  writeFileSync(file, output);
  return { file, bytes: output, metadata: media.mp4Metadata(output) };
}

test("two overlapping edits keep every original timestamp once, full native dimensions and no audio", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-continuous-two-"));
  try {
    const original = source(directory), prepared = parts(directory, original, [[0, 114], [102, 114]]);
    const result = await assemble(directory, prepared);
    assert.equal(result.metadata.frameCount, 216); assert.equal(result.metadata.videoDuration, 9);
    assert.equal(result.metadata.width, WIDTH); assert.equal(result.metadata.height, HEIGHT); assert.equal(result.metadata.hasAudio, false);
    const inputFrames = decode(original), outputFrames = decode(result.file);
    assert.equal(inputFrames.length, outputFrames.length);
    for (let frame = 0; frame < 216; frame++) assert.ok(difference(inputFrames, frame, outputFrames, frame) < 2, `global frame ${frame} must not shift, repeat or disappear`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("three overlapping edits at 30fps cover the original timeline without accumulating overlap or frame rounding", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-continuous-three-"));
  try {
    const original = source(directory, 12, 30), prepared = parts(directory, original, [[0, 130], [115, 130], [230, 130]], 30);
    const result = await assemble(directory, prepared);
    assert.equal(result.metadata.frameCount, 360); assert.equal(result.metadata.videoDuration, 12); assert.equal(result.metadata.hasAudio, false);
    const inputFrames = decode(original), outputFrames = decode(result.file);
    assert.equal(inputFrames.length, outputFrames.length);
    for (let frame = 0; frame < 360; frame++) assert.ok(difference(inputFrames, frame, outputFrames, frame) < 2, `global frame ${frame} must remain at its timestamp through both seams`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a real 200 ms overlap survives 30-to-24 fps rounding when only four output frames overlap", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-continuous-min-overlap-"));
  try {
    const original = source(directory, 20, 30);
    const prepared = parts(directory, original, [[0, 303], [297, 303]], 30, ["fps=24:start_time=0:round=near,trim=end_frame=242", "fps=24:start_time=0:round=near,trim=end_frame=242"]);
    for (const part of prepared) assert.ok(Math.abs(part.source.videoDuration - 10.1) < 0.05, JSON.stringify(part.source));
    for (const part of prepared) part.source = { ...part.source, duration: 10.1, videoDuration: 10.1, frameCount: 303 };
    assert.equal(prepared[1].start, 9.9);
    assert.equal(Math.round(10.1 * 24) - Math.round(9.9 * 24), 4);
    const result = await assemble(directory, prepared);
    assert.equal(result.metadata.frameCount, 480);
    assert.equal(result.metadata.videoDuration, 20);
    assert.equal(result.metadata.width, WIDTH); assert.equal(result.metadata.height, HEIGHT); assert.equal(result.metadata.hasAudio, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("the seam uses matching time samples instead of a fixed midpoint and blends only three overlapping frames", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-continuous-best-seam-"));
  try {
    const original = source(directory), prepared = parts(directory, original, [[0, 114], [102, 114]], 24, ["", "eq=brightness=0.1:enable='not(between(n,2,4))'"]);
    const result = await assemble(directory, prepared);
    const left = decode(prepared[0].file), right = decode(prepared[1].file), output = decode(result.file);
    // The first interior sample at global 105 matches; all later candidate
    // samples differ in brightness. Its transition occupies frames104..106.
    for (let frame = 0; frame < 104; frame++) assert.ok(difference(output, frame, left, frame) < 2, `left frame ${frame} must remain unchanged before the chosen seam`);
    for (let frame = 107; frame < 216; frame++) assert.ok(difference(output, frame, right, frame - 102) < 2, `right frame ${frame} must remain unchanged after the three-frame seam`);
    assert.equal(result.metadata.frameCount, 216);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("large visual divergence retains the complete video with a hard cut instead of a ghost dissolve", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-continuous-hard-cut-"));
  try {
    const original = source(directory), prepared = parts(directory, original, [[0, 114], [102, 114]], 24, ["", "eq=brightness=0.65"]);
    const result = await assemble(directory, prepared);
    const left = decode(prepared[0].file), right = decode(prepared[1].file), output = decode(result.file);
    for (let frame = 102; frame < 114; frame++) {
      assert.ok(Math.min(difference(output, frame, left, frame), difference(output, frame, right, frame - 102)) < 2, `frame ${frame} must come from exactly one provider output; no ghost blend`);
    }
    assert.equal(result.metadata.frameCount, 216); assert.equal(result.metadata.videoDuration, 9);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a compatible seam mixes exactly three frames and leaves the rest of the overlap from one provider", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-continuous-short-blend-"));
  try {
    const original = source(directory), prepared = parts(directory, original, [[0, 114], [102, 114]], 24, ["", "eq=brightness=0.025"]);
    const result = await assemble(directory, prepared);
    const left = decode(prepared[0].file), right = decode(prepared[1].file), output = decode(result.file);
    const mixed = [];
    for (let frame = 102; frame < 114; frame++) {
      if (difference(output, frame, left, frame) > 0.7 && difference(output, frame, right, frame - 102) > 0.7) mixed.push(frame);
    }
    assert.equal(mixed.length, 3, "only three overlapping frames may contain any crossfade");
    assert.equal(mixed[2] - mixed[0], 2, "the transition must be contiguous");
    assert.ok(mixed[0] >= 102 && mixed[2] < 114);
    assert.equal(result.metadata.frameCount, 216);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("a single result strips audio and uses video track duration rather than container audio padding", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-continuous-single-"));
  try {
    const original = source(directory, 4), bytes = readFileSync(original), metadata = media.mp4Metadata(bytes);
    assert.equal(metadata.hasAudio, true);
    const result = await assemble(directory, [{ start: 0, bytes, source: { ...metadata, duration: 4.2 } }]);
    assert.equal(result.metadata.frameCount, 96); assert.equal(result.metadata.videoDuration, 4); assert.equal(result.metadata.hasAudio, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("bounded provider rounding is aligned, but timing gaps above 250 ms and missing source footage are rejected", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-continuous-timing-"));
  try {
    const original = source(directory), prepared = parts(directory, original, [[0, 112], [102, 114]]);
    prepared[0].source = { ...prepared[0].source, duration: 4.75, videoDuration: 4.75 };
    const result = await assemble(directory, prepared);
    assert.equal(result.metadata.videoDuration, 9); assert.equal(result.metadata.frameCount, 216);
    const deficient = parts(directory, original, [[0, 107], [102, 114]]);
    deficient[0].source = { ...deficient[0].source, duration: 4.75, videoDuration: 4.75 };
    await assert.rejects(assemble(directory, deficient), /imagens suficientes/);
    await assert.rejects(join([prepared[0].bytes], [{ start: 0, source: { ...prepared[0].source, duration: 7, videoDuration: 7 } }]), /imagens suficientes/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("legacy adjacent ranges, gaps, incomplete plans and inconsistent dimensions cannot use continuous assembly", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-continuous-invalid-"));
  try {
    const original = source(directory), prepared = parts(directory, original, [[0, 108], [108, 108]]);
    await assert.rejects(assemble(directory, prepared), /sobreposição real/);
    await assert.rejects(assemble(directory, [{ ...prepared[0], start: 0.1 }, prepared[1]]), /início/);
    await assert.rejects(assemble(directory, [prepared[0], { ...prepared[1], start: 5 }]), /sobreposição real/);
    await assert.rejects(join([], []));
    await assert.rejects(join([prepared[0].bytes], []));
    await assert.rejects(join([prepared[0].bytes, prepared[0].bytes, prepared[0].bytes, prepared[0].bytes], []));
    const differentlySized = readFileSync(source(directory, 4.5, 24, 192));
    await assert.rejects(join([prepared[0].bytes, differentlySized], [{ start: 0, source: prepared[0].source }, { start: 4, source: prepared[1].source }]), /dimensões incompatíveis/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("subprocess failure releases all job-owned files without deleting caller-owned inputs", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-test-continuous-cleanup-"));
  let jobDirectory;
  try {
    const original = source(directory, 4), bytes = readFileSync(original);
    const brokenJoin = load("src/lib/join-continuous-edit.ts", {
      "./video-reference": media, "./edit-segments": timing,
      "@ffmpeg-installer/ffmpeg": { path: path.join(directory, "missing-ffmpeg-executable") },
      "node:fs/promises": { ...fsPromises, mkdtemp: async () => { jobDirectory = await fsPromises.mkdtemp(path.join(directory, "job-")); return jobDirectory; } },
    }).joinContinuousEditSegments;
    await assert.rejects(brokenJoin([bytes], [{ start: 0, source: media.mp4Metadata(bytes) }]), /preservados para revisão/);
    assert.ok(jobDirectory); assert.equal(existsSync(jobDirectory), false);
    assert.equal(existsSync(original), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
