import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file) {
  const module = { exports: {} };
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Buffer });
  return module.exports;
}
const { mp4Metadata } = load("src/lib/video-reference.ts");
const { checkEditResult } = load("src/lib/character-edit.ts");

function box(type, payload) {
  const bytes = Buffer.alloc(8 + payload.length);
  bytes.writeUInt32BE(bytes.length); bytes.write(type, 4); payload.copy(bytes, 8);
  return bytes;
}
function testMp4(version, ticks = 3000n, scale = 1000) {
  const mdhd = Buffer.alloc(version === 1 ? 36 : 24);
  mdhd[0] = version;
  mdhd.writeUInt32BE(scale, version === 1 ? 20 : 12);
  if (version === 1) mdhd.writeBigUInt64BE(ticks, 24);
  else mdhd.writeUInt32BE(Number(ticks), 16);
  const handler = Buffer.alloc(12); handler.write("vide", 8);
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(720 * 65536, 76); tkhd.writeUInt32BE(1280 * 65536, 80);
  const mvhd = Buffer.alloc(20); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(17000, 16);
  return Buffer.concat([
    box("ftyp", Buffer.from("isom")),
    box("moov", Buffer.concat([
      box("mvhd", mvhd),
      box("trak", Buffer.concat([box("tkhd", tkhd), box("mdia", Buffer.concat([box("mdhd", mdhd), box("hdlr", handler)]))])),
    ])),
    box("mdat", Buffer.alloc(1001)),
  ]);
}

test("MP4 version 0 and 1 video track clocks stay independent from container duration", () => {
  for (const version of [0, 1]) {
    const result = mp4Metadata(testMp4(version));
    assert.equal(result.duration, 17);
    assert.equal(result.videoDuration, 3);
    assert.match(checkEditResult({ ...result, videoDuration: 17 }, result), /Duração divergente nas imagens/);
    assert.throws(() => mp4Metadata(testMp4(version, 3000n, 0)), /Escala de tempo/);
  }
  assert.throws(() => mp4Metadata(testMp4(1, BigInt(Number.MAX_SAFE_INTEGER) + 1n)), /Duração da faixa/);
  assert.equal(mp4Metadata(testMp4(0, 0xffffffffn)).videoDuration, undefined);
  assert.equal(mp4Metadata(testMp4(1, 0xffffffffffffffffn)).videoDuration, undefined);
});

test("duration validation allows normal audio padding and remains compatible with older saved metadata", () => {
  const media = { duration: 17.15, videoDuration: 17.1, width: 720, height: 1280, hasAudio: true };
  assert.equal(checkEditResult(media, { ...media, duration: 17.17, videoDuration: 17.12 }), undefined);
  assert.equal(checkEditResult({ ...media, videoDuration: undefined }, media), undefined);
  assert.ok(checkEditResult(media, { ...media, videoDuration: 3 }));
  assert.ok(checkEditResult(media, { ...media, videoDuration: NaN }));
});

test("a real three-second picture with the original seventeen-second soundtrack is rejected", () => {
  const input = fileURLToPath(new URL("../public/reel-videos/Dd_qcXdgsdb.mp4", import.meta.url));
  const original = mp4Metadata(readFileSync(input));
  assert.ok(original.duration > 17 && original.videoDuration > 17);
  const directory = mkdtempSync(path.join(tmpdir(), "mi-picture-duration-test-"));
  try {
    const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
    const short = path.join(directory, "short.mp4"), mixed = path.join(directory, "short-with-long-audio.mp4");
    const run = args => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], { timeout: 60000, windowsHide: true });
    run(["-i", input, "-map", "0:v:0", "-vf", "trim=duration=3,setpts=PTS-STARTPTS", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-threads", "2", short]);
    run(["-i", short, "-i", input, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", mixed]);
    const result = mp4Metadata(readFileSync(mixed));
    assert.ok(Math.abs(result.duration - original.duration) < 0.25, "container duration passes the existing tolerance because of the soundtrack");
    assert.ok(result.videoDuration < 3.1, "picture duration reveals the actual truncation");
    assert.match(checkEditResult(original, result), /Duração divergente nas imagens/);
  } finally {
    const absolute = path.resolve(directory);
    assert.equal(path.dirname(absolute), path.resolve(tmpdir()));
    assert.ok(path.basename(absolute).startsWith("mi-picture-duration-test-"));
    rmSync(absolute, { recursive: true, force: true });
  }
});
