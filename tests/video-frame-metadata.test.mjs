import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const module = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL("../src/lib/video-reference.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { module, exports: module.exports });
const { mp4Metadata, mp4Duration } = module.exports;

function box(type, ...parts) {
  const content = Buffer.concat(parts), header = Buffer.alloc(8);
  header.writeUInt32BE(content.length + 8); header.write(type, 4, "ascii");
  return Buffer.concat([header, content]);
}
function sampleSizes(count, fixedSize = 0) {
  const header = Buffer.alloc(12); header.writeUInt32BE(fixedSize, 4); header.writeUInt32BE(count, 8);
  return box("stsz", header, Buffer.alloc(fixedSize ? 0 : count * 4, 1));
}
function compactSizes(count, fieldSize) {
  const header = Buffer.alloc(12); header[7] = fieldSize; header.writeUInt32BE(count, 8);
  return box("stz2", header, Buffer.alloc(Math.ceil(count * fieldSize / 8), 1));
}
function track(kind, sizes, width = 720, height = 1280) {
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(width * 65536, 76); tkhd.writeUInt32BE(height * 65536, 80);
  const handler = Buffer.alloc(12); handler.write(kind, 8, "ascii");
  return box("trak", box("tkhd", tkhd), box("mdia", box("hdlr", handler), box("minf", box("stbl", ...(sizes ? [sizes] : [])))));
}
function mp4(...tracks) {
  const mvhd = Buffer.alloc(20); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(17000, 16);
  return Buffer.concat([
    box("ftyp", Buffer.from("isom0000")), box("moov", box("mvhd", mvhd), ...tracks), box("mdat", Buffer.alloc(1024)),
  ]);
}

test("frameCount uses the primary video sample table, independently of duration and audio samples", () => {
  const bytes = mp4(track("soun", sampleSizes(900)), track("vide", sampleSizes(511)), track("vide", sampleSizes(90), 320, 480));
  const metadata = mp4Metadata(bytes);
  assert.equal(metadata.frameCount, 511);
  assert.equal(metadata.duration, 17);
  assert.equal(metadata.width, 720); assert.equal(metadata.height, 1280); assert.equal(metadata.hasAudio, true);
  assert.equal(mp4Duration(bytes), 17);
  assert.equal(mp4Metadata(mp4(track("vide", sampleSizes(79, 16)))).frameCount, 79);
});

test("compact sample-size tables support four, eight and sixteen bit entries, including an odd nibble count", () => {
  for (const fieldSize of [4, 8, 16]) {
    assert.equal(mp4Metadata(mp4(track("vide", compactSizes(33, fieldSize)))).frameCount, 33);
  }
});

test("missing or empty sample tables leave frameCount unknown without estimating from duration", () => {
  for (const sizes of [undefined, sampleSizes(0), compactSizes(0, 4)]) {
    const metadata = mp4Metadata(mp4(track("vide", sizes)));
    assert.equal(metadata.frameCount, undefined);
    assert.equal("frameCount" in metadata, false);
    assert.equal(metadata.duration, 17);
  }
  // A secondary video's count must not silently replace a missing primary count.
  assert.equal(mp4Metadata(mp4(track("vide"), track("vide", sampleSizes(30)))).frameCount, undefined);
});

test("malformed tables reject truncated headers, entries and unsupported fields before crossing box bounds", () => {
  const oversized = Buffer.alloc(12); oversized.writeUInt32BE(0xffffffff, 8);
  const badCompact = Buffer.alloc(12); badCompact[7] = 3; badCompact.writeUInt32BE(1, 8);
  const missingNibble = Buffer.alloc(12); missingNibble[7] = 4; missingNibble.writeUInt32BE(3, 8);
  const unsupportedVersion = Buffer.alloc(12); unsupportedVersion[0] = 1;
  for (const sizes of [
    box("stsz", Buffer.alloc(11)), box("stz2", Buffer.alloc(8)), box("stsz", oversized),
    box("stz2", badCompact), box("stz2", missingNibble, Buffer.alloc(1)), box("stsz", unsupportedVersion),
  ]) assert.throws(() => mp4Metadata(mp4(track("vide", sizes))), /Tabela de quadros/);
});

test("the real 17-second reference sample count matches a complete FFmpeg decode", () => {
  const source = fileURLToPath(new URL("../public/reel-videos/Dd_qcXdgsdb.mp4", import.meta.url));
  const metadata = mp4Metadata(readFileSync(source));
  const progress = execFileSync(require("@ffmpeg-installer/ffmpeg").path, [
    "-hide_banner", "-v", "error", "-i", source, "-map", "0:v:0", "-an", "-sn", "-dn", "-vsync", "0",
    "-f", "null", "-", "-progress", "pipe:1", "-nostats",
  ], { encoding: "utf8", timeout: 60000, windowsHide: true });
  const decodedFrames = Number([...progress.matchAll(/^frame=(\d+)\s*$/gm)].at(-1)?.[1]);
  assert.ok(Number.isSafeInteger(decodedFrames) && decodedFrames > 0);
  assert.equal(metadata.frameCount, decodedFrames);
  assert.ok(metadata.duration > 17 && metadata.duration < 18);
});
