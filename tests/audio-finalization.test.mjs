import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id), Buffer, process, console });
  return module.exports;
}
const media = load("src/lib/video-reference.ts");
const rules = load("src/lib/character-edit.ts");
const assembly = load("src/lib/edit-segments.ts", { "./video-reference": media });
const continuousAssembly = load("src/lib/join-continuous-edit.ts", { "./video-reference": media, "./edit-segments": assembly });
const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
const ff = args => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
const audioPackets = file => ff(["-i", file, "-map", "0:a:0", "-c", "copy", "-f", "data", "pipe:1"]);
const decodedAudio = file => ff(["-i", file, "-map", "0:a:0", "-f", "s16le", "pipe:1"]);

function finalizers(source, pieces, sourceUrl = "https://media.example/original.mp4", overrides = {}) {
  const reads = [], stores = [];
  const urls = pieces.map((_, index) => `https://media.example/part-${index}.mp4`);
  const videoMedia = { readPublicVideo: async url => {
    reads.push(url);
    assert.ok(url === sourceUrl || urls.includes(url), "finalization must not fetch an uploaded intermediate");
    return url === sourceUrl ? source : pieces[urls.indexOf(url)];
  } };
  const finalizer = load("src/lib/finalize-edit.ts", {
    "@vercel/blob": { put: async (name, bytes, options) => { stores.push({ name, bytes, options }); return { url: "https://media.example/final.mp4" }; } },
    "./video-reference": media, "./character-edit": rules, "./video-media": videoMedia, ...overrides,
  });
  const segmented = load("src/lib/finalize-segmented-edit.ts", {
    "./video-media": videoMedia, "./video-reference": media, "./character-edit": rules,
    "./edit-segments": assembly, "./finalize-edit": finalizer,
    "./join-continuous-edit": continuousAssembly,
  });
  return { ...finalizer, ...segmented, urls, reads, stores };
}

test("two slightly shorter silent provider clips become one complete video with byte-identical original AAC", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-audio-regression-"));
  try {
    const originalPath = path.join(directory, "original.mp4");
    ff(["-f", "lavfi", "-i", "testsrc2=size=96x160:rate=30:duration=29", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=29.05", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-bf", "0", "-vsync", "0", "-c:a", "aac", "-y", originalPath]);
    const source = readFileSync(originalPath), sourceMetadata = media.mp4Metadata(source);
    const pieces = [353, 337].map((frames, index) => {
      const file = path.join(directory, `part-${index}.mp4`);
      ff(["-f", "lavfi", "-i", `testsrc2=size=96x160:rate=24:duration=16`, "-frames:v", String(frames), "-c:v", "libx264", "-preset", "ultrafast", "-threads", "1", "-bf", "0", "-an", "-y", file]);
      return readFileSync(file);
    });
    const f = finalizers(source, pieces);
    const item = { id: "audio-regression", userId: "owner", error: "previous duration mismatch", edit: {
      source: sourceMetadata, sourceUrl: "https://media.example/original.mp4",
      segments: [445 / 30, 425 / 30].map((duration, index) => ({
        sourceUrl: `https://media.example/input-${index}.mp4`, requestId: `already-paid-${index}`,
        source: { duration, videoDuration: duration, width: 96, height: 160, hasAudio: false },
      })),
    } };
    const result = await f.finalizeSegmentedEdit(item, f.urls);
    assert.equal(result.status, "completed", result.error);
    assert.equal(result.error, undefined, "a recovered video must not retain the previous review error");
    assert.equal(result.edit.audioPreserved, true);
    assert.equal(result.edit.result.hasAudio, true);
    assert.equal(result.edit.result.frameCount, 690, "all generated pictures remain, without duplicating or dropping frames");
    assert.ok(Math.abs(result.edit.result.videoDuration - 29) < 0.002);
    assert.ok(Math.abs(result.edit.result.audioDuration - sourceMetadata.audioDuration) < 0.001);
    assert.equal(f.stores.length, 1, "only the complete video with original audio is published");
    assert.equal(f.reads.filter(url => url === item.edit.sourceUrl).length, 1);
    const finalPath = path.join(directory, "final.mp4"); writeFileSync(finalPath, f.stores[0].bytes);
    assert.deepEqual(audioPackets(finalPath), audioPackets(originalPath), "all original compressed AAC packets must remain byte-identical");
    assert.deepEqual(decodedAudio(finalPath), decodedAudio(originalPath), "the original audible samples and priming must remain identical");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("audio payload or timestamp changes cannot pass finalization even with matching audio duration", async () => {
  const source = readFileSync(new URL("../public/reel-videos/Dd_qcXdgsdb.mp4", import.meta.url));
  for (const field of [2, 5]) {
    let injected = false;
    const mockedExecFile = () => {};
    mockedExecFile[promisify.custom] = (file, args, options) => new Promise((resolve, reject) => {
      execFile(file, args, options, (error, stdout, stderr) => {
        if (error) return reject(error);
        if (args.includes("framehash") && args.some(arg => path.basename(arg) === "final.mp4")) {
          stdout = stdout.replace(/^0,.+$/m, line => {
            const fields = line.split(",");
            fields[field] = field === 2 ? String(Number(fields[field]) + 1) : "0".repeat(64);
            injected = true;
            return fields.join(",");
          });
        }
        resolve({ stdout, stderr });
      });
    });
    const f = finalizers(source, [source], undefined, { "node:child_process": { execFile: mockedExecFile } });
    const result = await f.finalizeCharacterEdit({ id: "tampered-audio", userId: "owner", edit: {
      source: media.mp4Metadata(source), sourceUrl: "https://media.example/original.mp4",
    } }, source);
    assert.equal(injected, true, "the audio verification must inspect the final muxed file");
    assert.equal(result.status, "review");
    assert.equal(f.stores.length, 0);
  }
});

test("finalization never marks a source with audio as completed when muxing loses its audio", async () => {
  const source = readFileSync(new URL("../public/reel-videos/Dd_qcXdgsdb.mp4", import.meta.url));
  const actual = media.mp4Metadata(source);
  let calls = 0;
  const f = finalizers(source, [source], undefined, {
    "./video-reference": { mp4Metadata: bytes => {
      calls++;
      return calls === 5 ? { ...media.mp4Metadata(bytes), hasAudio: false, audioDuration: undefined } : media.mp4Metadata(bytes);
    } },
  });
  const result = await f.finalizeCharacterEdit({ id: "audio-loss", userId: "owner", edit: { source: actual, sourceUrl: "https://media.example/original.mp4" } }, source);
  assert.equal(result.status, "review");
  assert.equal(f.stores.length, 0);
  assert.notEqual(result.edit?.audioPreserved, true);
});

// A local copy of the reported paid job can be verified without fetching the
// provider or spending any credits. The normal suite remains self-contained.
const recoveryDirectory = process.env.MI_AUDIO_RECOVERY_DIR;
test("reported Supercar job is recovered locally with all 690 generated frames and the exact source audio", { skip: !recoveryDirectory }, async () => {
  assert.ok(existsSync(recoveryDirectory));
  const item = JSON.parse(readFileSync(path.join(recoveryDirectory, "a6553238-a7dd-4178-8406-06eec8ad82ef.json"), "utf8"));
  const originalPath = path.join(recoveryDirectory, "original.mp4");
  const source = readFileSync(originalPath), pieces = [0, 1].map(index => readFileSync(path.join(recoveryDirectory, `result-${index}.mp4`)));
  const f = finalizers(source, pieces, item.edit.sourceUrl);
  const result = await f.finalizeSegmentedEdit(item, f.urls);
  assert.equal(result.status, "completed", result.error);
  assert.equal(f.stores.length, 1);
  assert.equal(result.edit.result.frameCount, 690);
  assert.equal(result.edit.result.hasAudio, true);
  assert.ok(Math.abs(result.edit.result.videoDuration - 29) < 0.002);
  const output = path.join(recoveryDirectory, "recovered-with-original-audio.mp4");
  writeFileSync(output, f.stores[0].bytes);
  assert.deepEqual(audioPackets(output), audioPackets(originalPath));
  assert.deepEqual(decodedAudio(output), decodedAudio(originalPath));
  assert.equal(rules.checkEditResult(item.edit.source, result.edit.result), undefined);
  console.log("recovered Supercar metadata", JSON.stringify(result.edit.result));
});

test('overlapping picture contexts become a full-length final video with the exact original audio and no repeated time', async () => {
  const directory=mkdtempSync(path.join(tmpdir(),'mi-overlap-audio-'));
  try {
    const originalPath=path.join(directory,'original.mp4');
    ff(['-f','lavfi','-i','testsrc2=size=96x160:rate=24:duration=20','-f','lavfi','-i','sine=frequency=503:sample_rate=48000:duration=20.05','-c:v','libx264','-preset','ultrafast','-threads','1','-bf','0','-vsync','0','-c:a','aac','-y',originalPath]);
    const source=readFileSync(originalPath), starts=[0,9.75];
    const pieces=starts.map((start,index)=>{
      const file=path.join(directory,`overlap-${index}.mp4`);
      ff(['-i',originalPath,'-vf',`trim=start=${start}:end=${start+10.25},setpts=PTS-STARTPTS`,'-an','-c:v','libx264','-preset','ultrafast','-threads','1','-bf','0','-vsync','0','-y',file]);
      return readFileSync(file);
    });
    const f=finalizers(source,pieces);
    const item={id:'overlap-audio',userId:'owner',edit:{assembly:'overlap-v1',source:media.mp4Metadata(source),sourceUrl:'https://media.example/original.mp4',segments:pieces.map((piece,index)=>({start:starts[index],source:media.mp4Metadata(piece),sourceUrl:`https://media.example/input-${index}`,requestId:`already-paid-${index}`}))}};
    const result=await f.finalizeSegmentedEdit(item,f.urls);
    assert.equal(result.status,'completed',result.error);
    assert.equal(result.edit.assembly,'overlap-v1');
    assert.equal(result.edit.audioPreserved,true);
    assert.equal(f.stores.length,1);
    const output=path.join(directory,'final.mp4');
    writeFileSync(output,f.stores[0].bytes);
    const actual=media.mp4Metadata(f.stores[0].bytes);
    assert.equal(actual.frameCount,480);
    assert.ok(Math.abs(actual.videoDuration-20)<0.002);
    assert.deepEqual(audioPackets(output),audioPackets(originalPath));
    assert.deepEqual(decodedAudio(output),decodedAudio(originalPath));
    assert.equal(f.reads.filter(url=>url==='https://media.example/original.mp4').length,1);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
