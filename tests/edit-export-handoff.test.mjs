import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Buffer,
    require(id) {
      if (id === "server-only") return {};
      if (id in mocks) return mocks[id];
      assert.equal(id, "node:crypto", "Packaging must not acquire generation, billing or network dependencies");
      return require(id);
    },
  });
  return module.exports;
}
const edit = load("src/lib/character-edit.ts");
const metadataByBytes = new Map();
const { buildEditExportEntries } = load("src/lib/edit-export-package.ts", {
  "./character-edit": edit,
  "./video-reference": { mp4Metadata: bytes => {
    assert.ok(metadataByBytes.has(bytes), "Only the prepared temporal video parts may be inspected");
    return metadataByBytes.get(bytes);
  } },
});
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const normalize = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1kAAAAASUVORK5CYII=", "base64");

function fixture({ engine = "higgsfield", short = false, audio = true, multiple = false } = {}) {
  const duration = short ? 8.076 : 29.076;
  const metadata = { duration, videoDuration: short ? 8 : 29, width: 2160, height: 3840, hasAudio: audio, frameCount: short ? 240 : 870, ...(audio ? { audioDuration: short ? 8.056 : 29.056 } : {}) };
  const original = Buffer.from(`Unmodified source video ${engine} ${duration} ${audio}`);
  const segments = multiple ? [
    { start: 0, bytes: Buffer.from(`Prepared first video segment ${engine}`) },
    { start: 14.833333333333334, bytes: Buffer.from(`Prepared second video segment ${engine}`) },
  ] : [{ start: 0, bytes: original }];
  metadataByBytes.set(original, metadata);
  if (multiple) {
    metadataByBytes.set(segments[0].bytes, { ...metadata, duration: 14.834, videoDuration: 14.833333333333334, hasAudio: false, frameCount: 445, audioDuration: undefined });
    metadataByBytes.set(segments[1].bytes, { ...metadata, duration: 14.167, videoDuration: 14.166666666666666, hasAudio: false, frameCount: 425, audioDuration: undefined });
  }
  const input = {
    name: "Supercar Interior Swap", influencerName: "Influencer 1", engine,
    resolution: engine.startsWith("fal-kling") ? "auto" : "720p",
    target: "the seated driver wearing a dark shirt", metadata, image, original, segments,
  };
  const entries = buildEditExportEntries(input);
  const files = new Map(entries.map(entry => [entry.name, entry.bytes]));
  assert.equal(entries.length, files.size, "Export filenames must be unique");
  return { input, files, config: JSON.parse(files.get("config.json").toString()), text: name => files.get(name)?.toString("utf8") };
}

test("all four engines export an explicit local-video handoff without authorizing fallback or API billing", () => {
  for (const engine of Object.keys(edit.EDIT_ENGINES)) {
    const f = fixture({ engine, multiple: engine.startsWith("fal-kling") });
    assert.equal(f.config.version, 2);
    assert.equal(f.config.engine, engine);
    assert.equal(f.config.model, edit.EDIT_ENGINES[engine].model);
    assert.equal(f.config.handoffFile, "COMECE-AQUI.txt");
    assert.deepEqual(f.config.executionPolicy, {
      requiresFullVideoInput: true, requiresLocalizedVideoEditing: true,
      allowModelFallback: false, allowTextToVideo: false, allowImageToVideo: false, allowApiBilling: false,
    });
    for (const name of ["COMECE-AQUI.txt", "LEIA-ME.txt", "CONFERIR-RESULTADO.txt", "prompts/universal.txt"]) assert.ok(f.files.has(name), `Missing handoff asset ${name}`);
    const handoff = normalize(f.text("COMECE-AQUI.txt"));
    assert.ok(handoff.includes(edit.EDIT_ENGINES[engine].model.toLowerCase()), "Agent must see the actual selected model identifier");
    assert.match(handoff, /original\.mp4/);
    assert.match(handoff, /indispon|nao.*(suport|dispon|existe|oferec)/);
    assert.match(handoff, /(identidade|aparencia).*(roupa|vestuario)|(roupa|vestuario).*(identidade|aparencia)/);
    assert.match(handoff, /text.to.video|texto.*video|texto\/imagens\/primeiro frame, nao gere/);
    assert.match(handoff, /image.to.video|imagem.*video|animar.*(foto|imagem)|texto\/imagens\/primeiro frame, nao gere/);
  }
});

test("Genjutsu and Wan keep short and long originals whole instead of inventing segment exports", () => {
  for (const engine of ["higgsfield", "fal-wan"]) for (const short of [true, false]) {
    const f = fixture({ engine, short });
    assert.equal(f.config.segments.length, 1);
    assert.equal(f.config.segments[0].file, "original.mp4");
    assert.equal(f.config.segments[0].input.video_url, "original.mp4");
    assert.equal(f.files.get("original.mp4"), f.input.original);
    assert.equal([...f.files.keys()].some(name => name.startsWith("trechos/")), false);
    if (engine === "higgsfield") {
      assert.equal(f.config.model, "higgsfield/genjutsu/object-swap/v1.0");
      assert.deepEqual(f.config.segments[0].input.image_urls, [f.config.influencer.file]);
      assert.match(normalize(f.text("COMECE-AQUI.txt")), /object swap/);
    }
  }
});

test("Kling exports only the prepared segment order and links each actual video to its own compatible prompt", () => {
  for (const engine of ["fal-kling-pro", "fal-kling-standard"]) {
    const f = fixture({ engine, multiple: true });
    assert.equal(f.config.segments.length, 2);
    assert.deepEqual(f.config.segments.map(segment => segment.start), f.input.segments.map(segment => segment.start));
    for (const [index, segment] of f.config.segments.entries()) {
      assert.equal(f.files.get(segment.file), f.input.segments[index].bytes);
      assert.equal(segment.input.video_url, segment.file);
      assert.deepEqual(segment.input.image_urls, [f.config.influencer.file]);
      assert.equal(segment.input.prompt.trimEnd(), f.text(segment.promptFile).trimEnd());
      assert.match(segment.input.prompt, /@Video1/);
      assert.match(segment.input.prompt, /@Image1/);
    }
    const short = fixture({ engine, short: true });
    assert.equal(short.config.segments.length, 1);
    assert.equal(short.config.segments[0].file, "original.mp4");
    assert.equal(short.config.segments[0].promptFile, "prompts/modelo.txt");
  }
});

test("hashes bind the exact original video and character image while every configuration asset points inside the ZIP", () => {
  const f = fixture({ engine: "fal-kling-pro", multiple: true });
  assert.equal(f.config.original.sha256, sha256(f.input.original));
  assert.equal(f.config.influencer.sha256, sha256(image));
  assert.equal(f.files.get(f.config.influencer.file), image);
  const paths = [f.config.handoffFile, f.config.original.file, f.config.influencer.file, f.config.universalPromptFile];
  for (const segment of f.config.segments) paths.push(segment.file, segment.input.video_url, ...(segment.input.image_urls ?? []), ...(segment.promptFile ? [segment.promptFile] : []));
  for (const path of paths) {
    assert.ok(typeof path === "string" && f.files.has(path), `Dangling package reference: ${path}`);
    assert.ok(!path.includes("..") && !path.includes("\\") && !path.startsWith("/"));
  }
  const output = JSON.stringify(f.config);
  assert.ok(!/https?:\/\//.test(output));
  assert.ok(!/AUTH_SECRET|FAL_KEY|quoteToken|access_token/.test(output));
});

test("Wan keeps its no-prompt API contract and does not pretend a universal prompt adds person-selection capabilities", () => {
  const f = fixture({ engine: "fal-wan" });
  assert.equal(f.config.acceptsEditingPrompt, false);
  const settings = f.config.segments[0].input;
  assert.equal(settings.image_url, f.config.influencer.file);
  assert.equal(settings.prompt, undefined);
  assert.equal(f.config.segments[0].promptFile, undefined);
  assert.equal(f.files.has("prompts/modelo.txt"), false);
  assert.equal(f.files.has("prompts/trecho-01.txt"), false);
  assert.match(normalize(f.text("COMECE-AQUI.txt")), /nao aceita prompt|sem prompt|nao.*prompt/);
});

test("validation checkpoints span the visible timeline, including its final frames instead of the longer audio tail", () => {
  for (const short of [true, false]) {
    const f = fixture({ short });
    const points = f.config.validation.checkpointsSeconds;
    assert.ok(Array.isArray(points) && points.length >= 3);
    assert.equal(points[0], 0);
    assert.ok(points.every((point, index) => Number.isFinite(point) && point >= 0 && point < f.input.metadata.videoDuration && (index === 0 || point > points[index - 1])));
    assert.ok(points.some(point => point >= f.input.metadata.videoDuration * 0.4 && point <= f.input.metadata.videoDuration * 0.6));
    assert.ok(f.input.metadata.videoDuration - points.at(-1) <= 0.5, "Inspect the actual final video frames");
    const checklist = normalize(f.text("CONFERIR-RESULTADO.txt"));
    assert.match(checklist, /camera/);
    assert.match(checklist, /cenario|fundo/);
    assert.match(checklist, /ultimo|final/);
  }
});

test("audio instructions preserve original audio when present and do not request invented sound for a silent source", () => {
  const audible = fixture({ audio: true }), silent = fixture({ audio: false });
  const audibleGuide = normalize(audible.text("COMECE-AQUI.txt") + "\n" + audible.text("CONFERIR-RESULTADO.txt"));
  const silentGuide = normalize(silent.text("COMECE-AQUI.txt") + "\n" + silent.text("CONFERIR-RESULTADO.txt"));
  assert.match(audibleGuide, /audio.*original|original.*audio/);
  assert.match(silentGuide, /sem audio|nao.*(audio|trilha)|silencio/);
  assert.equal(silent.config.original.metadata.hasAudio, false);
});
