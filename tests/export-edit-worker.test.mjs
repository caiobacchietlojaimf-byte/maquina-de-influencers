import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { crc32, inflateRawSync } from "node:zlib";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const module = { exports: {} };
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Buffer, URL, AbortSignal, console: { error() {}, warn() {} },
    process: { env: {} },
    require(id) {
      if (id === "server-only") return {};
      assert.ok(!/\/(fal|platform|costs|prepare-character-edit)$/.test(id), `Export must not depend on paid provider preparation: ${id}`);
      if (id in mocks) return mocks[id];
      return require(id);
    },
  }, { filename: file });
  return module.exports;
}

// Parse the central directory independently from the app's ZIP writer and verify
// every payload against the ZIP sizes and CRC using Node's native implementation.
function unzip(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, "ZIP must contain an end-of-central-directory record");
  assert.equal(bytes.readUInt16LE(end + 4), 0);
  assert.equal(bytes.readUInt16LE(end + 6), 0);
  assert.equal(bytes.readUInt16LE(end + 8), bytes.readUInt16LE(end + 10));
  const entries = new Map();
  const count = bytes.readUInt16LE(end + 10), directoryOffset = bytes.readUInt32LE(end + 16);
  let position = directoryOffset;
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(position), 0x02014b50);
    const flags = bytes.readUInt16LE(position + 8), method = bytes.readUInt16LE(position + 10);
    const crc = bytes.readUInt32LE(position + 16), compressed = bytes.readUInt32LE(position + 20), size = bytes.readUInt32LE(position + 24);
    const nameLength = bytes.readUInt16LE(position + 28), extraLength = bytes.readUInt16LE(position + 30), commentLength = bytes.readUInt16LE(position + 32);
    const offset = bytes.readUInt32LE(position + 42), name = bytes.toString("utf8", position + 46, position + 46 + nameLength);
    assert.ok(!name.startsWith("/") && !name.includes("\\") && !name.split("/").includes(".."), `Unsafe ZIP filename: ${name}`);
    assert.equal(flags & 1, 0, "Export must not require an encryption password");
    assert.ok(!entries.has(name), `Duplicate ZIP entry: ${name}`);
    assert.equal(bytes.readUInt32LE(offset), 0x04034b50);
    const localNameLength = bytes.readUInt16LE(offset + 26), localExtraLength = bytes.readUInt16LE(offset + 28);
    assert.equal(bytes.toString("utf8", offset + 30, offset + 30 + localNameLength), name);
    const start = offset + 30 + localNameLength + localExtraLength;
    const payload = bytes.subarray(start, start + compressed);
    assert.ok(method === 0 || method === 8, `Unsupported ZIP method: ${method}`);
    const decoded = method === 8 ? inflateRawSync(payload) : payload;
    assert.equal(decoded.length, size);
    assert.equal(crc32(decoded), crc);
    entries.set(name, decoded);
    position += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(position, directoryOffset + bytes.readUInt32LE(end + 12));
  return entries;
}

const original = readFileSync(new URL("../public/reel-videos/Dd_qcXdgsdb.mp4", import.meta.url));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1kAAAAASUVORK5CYII=", "base64");
const media = load("src/lib/video-reference.ts"), edit = load("src/lib/character-edit.ts");
const originalMetadata = media.mp4Metadata(original);
const inputValidation = load("src/lib/edit-export-input.ts", { "./character-edit": edit });
const input = { influencerId: "character", source: { kind: "preset", id: "preset" }, targetMode: "main", resolution: "auto", engine: "fal-kling-pro" };
const sourceUrl = "https://media.example/original.mp4", imageUrl = "https://images.example/influencer.png";
const blobUrl = "https://assets.public.blob.vercel-storage.com/exports/test/genjutsu-supercar.zip";

function fixture(overrides = {}) {
  const downloads = [], uploads = [], deletes = [], ownerReads = [], splits = [], identityReads = [];
  const selectedImageUrl = overrides.imageUrl ?? imageUrl;
  const identity = { strategy: overrides.singleImage ? "single-image" : "sheet-panels", appearance: png, wan: Buffer.concat([png, Buffer.from("fitted-image")]), ...(overrides.singleImage ? {} : { frontal: Buffer.concat([png, Buffer.from("frontal-image")]) }) };
  const parts = [
    { bytes: Buffer.from("encoded first segment"), start: 0 },
    { bytes: Buffer.from("encoded second segment"), start: 8.5 },
  ];
  const fixtureMedia = { ...media, mp4Metadata: bytes => bytes === original ? (overrides.metadata ?? originalMetadata) : {
    ...originalMetadata, duration: bytes === parts[0].bytes ? 8.5 : originalMetadata.duration - 8.5, frameCount: bytes === parts[0].bytes ? 204 : 205,
  } };
  const packageBuilder = load("src/lib/edit-export-package.ts", {
    "./character-edit": edit, "@/lib/character-edit": edit,
    "./video-reference": fixtureMedia, "@/lib/video-reference": fixtureMedia,
  });
  const worker = load("src/lib/export-character-edit.ts", {
    "@vercel/blob": {
      put: async (path, stream, options) => {
        const upload = { path, options, bytes: undefined }; uploads.push(upload);
        assert.equal(typeof stream.getReader, "function", "ZIP must stream to storage with byte-based backpressure");
        const chunks = [];
        for await (const chunk of stream) {
          assert.ok(chunk.byteLength <= 65_536, "ZIP media must use bounded chunks rather than entire video buffers");
          chunks.push(chunk);
        }
        upload.bytes = Buffer.concat(chunks);
        overrides.afterUpload?.();
        if (overrides.uploadFailure) throw new Error("private-upload-detail?token=private-token");
        return { url: blobUrl, downloadUrl: `${blobUrl}?download=1` };
      },
      del: async url => deletes.push(url),
    },
    "@/lib/auth": { requireUser: async () => {
      if (overrides.unauthenticated) throw new Error("Faça login");
      return { id: "owner", credits: 0 };
    } },
    "@/lib/db": {
      getInfluencer: async (owner, id) => {
        ownerReads.push([owner, id]);
        return owner === "owner" && id === (overrides.influencerId ?? "character") ? { id, name: "Meu Influencer", status: overrides.influencerStatus ?? "completed", imageUrl: selectedImageUrl, ...(overrides.influencerId ? { rootInfluencerId: "character", variantLabel: "Jaqueta vermelha" } : {}) } : undefined;
      },
      getViral: async id => id === "viral" ? { id, title: "Supercar", playUrl: sourceUrl } : undefined,
    },
    "@/data/ai-profiles": { getProfile: handle => handle === "profile" ? { handle, posts: [{ code: "clip", video: sourceUrl, scene: "Supercar" }] } : undefined },
    "@/data/motion-presets": { getMotionPreset: id => id === "preset" ? { name: overrides.name ?? "Supercar", drivingVideo: sourceUrl } : undefined },
    "@/lib/ai-discovery": { isAiCharacterVideo: () => overrides.aiVideo !== false },
    "@/lib/uploaded-reference": { readUploadedReference: (token, owner) => {
      assert.equal(owner, "owner");
      if (token !== "owned-upload-token") throw new Error("Invalid upload token");
      return { videoUrl: sourceUrl, name: "Supercar" };
    } },
    "@/lib/video-media": { publicMediaUrl: value => value, readPublicVideo: async (url, limit, signal) => {
      downloads.push({ url, limit, signal });
      assert.ok([sourceUrl, selectedImageUrl].includes(url), "Only backend-resolved media may be downloaded");
      if (url === sourceUrl) { overrides.afterDownload?.(); return original; }
      return png;
    } },
    "@/lib/prepare-character-identity": { readCharacterIdentity: async (influencer, metadata, signal) => {
      identityReads.push({ influencer, metadata, signal });
      assert.equal(influencer.imageUrl, selectedImageUrl, "Identity preparation must use the selected saved version");
      downloads.push({ url: influencer.imageUrl, limit: 25 * 1024 * 1024, signal });
      if (overrides.identityFailure) throw new Error("private-image-preparation-error");
      return { image: png, identity };
    } },
    "@/lib/video-reference": fixtureMedia, "@/lib/character-edit": edit,
    "@/lib/edit-segments": { splitEditSource: async (...args) => { splits.push(args); return parts; } },
    "@/lib/edit-export-package": packageBuilder, "@/lib/edit-export-input": inputValidation,
  });
  return { ...worker, downloads, uploads, deletes, ownerReads, splits, parts, identityReads, identity };
}

test("export preserves original bytes and creates a complete usable ZIP with zero balance and no provider credentials", async () => {
  const f = fixture(), progress = [], signal = new AbortController().signal;
  const result = await f.exportCharacterEdit(input, { signal, onProgress: event => progress.push(event.stage) });
  assert.equal(result.error, undefined);
  assert.equal(result.url, `${blobUrl}?download=1`);
  assert.equal(result.filename, "troca-personagem-supercar.zip");
  assert.deepEqual(f.ownerReads, [["owner", "character"]]);
  assert.equal(f.splits.length, 1);
  assert.equal(f.splits[0][0], original);
  assert.equal(f.splits[0][2].signal, signal);
  assert.deepEqual(progress, ["auth", "reference", "download", "image", "segments", "package", "upload"]);
  assert.equal(f.uploads.length, 1);
  assert.equal(f.uploads[0].options.contentType, "application/zip");
  assert.equal(f.uploads[0].options.multipart, true);
  assert.equal(f.uploads[0].options.abortSignal, signal);
  assert.ok(f.uploads[0].path.startsWith("exports/"));
  const files = unzip(f.uploads[0].bytes);
  assert.deepEqual(files.get("original.mp4"), original);
  assert.deepEqual(files.get("referencias/personagem.png"), png);
  assert.deepEqual(files.get("referencias/rosto.png"), f.identity.frontal);
  assert.equal(f.identityReads.length, 1);
  assert.equal(f.identityReads[0].signal, signal);
  assert.equal(f.identityReads[0].influencer.id, "character");
  assert.deepEqual(f.identityReads[0].metadata, originalMetadata);
  for (const file of ["LEIA-ME.txt", "config.json", "prompts/universal.txt", "prompts/trecho-01.txt", "prompts/trecho-02.txt", "trechos/01.mp4", "trechos/02.mp4"]) assert.ok(files.has(file), `Missing export file: ${file}`);
  assert.deepEqual(files.get("trechos/01.mp4"), f.parts[0].bytes);
  assert.deepEqual(files.get("trechos/02.mp4"), f.parts[1].bytes);
  assert.match(files.get("LEIA-ME.txt").toString(), /original\.mp4/);
  assert.match(files.get("prompts/universal.txt").toString(), /Preserve the entire 17\.157-second (?:source )?timeline/);
  const config = JSON.parse(files.get("config.json").toString());
  assert.ok(JSON.stringify(config).includes("fal-kling-pro"));
  for (const [name, bytes] of files) if (/\.(txt|json)$/.test(name)) {
    for (const forbidden of ["owned-upload-token", "private-token", "AUTH_SECRET", "FAL_KEY"]) assert.ok(!bytes.toString().includes(forbidden), `${name} leaked ${forbidden}`);
  }
});

test("all reference kinds resolve on the backend and Wan exports an unsplit original without requiring API setup", async () => {
  for (const source of [{ kind: "profile", handle: "profile", id: "clip" }, { kind: "viral", id: "viral" }, { kind: "preset", id: "preset", url: "https://untrusted.example/override.mp4" }, { kind: "upload", token: "owned-upload-token" }]) {
    const f = fixture();
    const result = await f.exportCharacterEdit({ ...input, source, engine: "fal-wan", resolution: "720p" });
    assert.equal(result.error, undefined);
    assert.equal(f.splits.length, 0);
    assert.deepEqual(f.downloads.map(call => call.url), [sourceUrl, imageUrl]);
    assert.equal(f.downloads[1].limit, 25 * 1024 * 1024);
    const files = unzip(f.uploads[0].bytes);
    assert.deepEqual(files.get("original.mp4"), original);
    assert.deepEqual(files.get("referencias/personagem-wan.png"), f.identity.wan);
    assert.equal(files.has("referencias/personagem.png"), false);
    assert.equal(files.has("referencias/rosto.png"), false);
    assert.equal([...files.keys()].some(name => name.startsWith("trechos/")), false);
    assert.ok(!files.get("config.json").toString().includes("owned-upload-token"));
  }
});

test("export packages the selected saved outfit instead of falling back to the original influencer", async () => {
  const outfitUrl = "https://images.example/saved-red-jacket.png";
  const f = fixture({ influencerId: "saved-outfit", imageUrl: outfitUrl });
  const result = await f.exportCharacterEdit({ ...input, influencerId: "saved-outfit" });
  assert.equal(result.error, undefined);
  assert.deepEqual(f.ownerReads, [["owner", "saved-outfit"]]);
  assert.deepEqual(f.downloads.map(call => call.url), [sourceUrl, outfitUrl]);
  const files = unzip(f.uploads[0].bytes);
  assert.deepEqual(files.get("referencias/personagem.png"), png);
  assert.deepEqual(files.get("referencias/rosto.png"), f.identity.frontal);
  assert.equal(f.identityReads[0].influencer.id, "saved-outfit");
  assert.equal(f.identityReads[0].influencer.imageUrl, outfitUrl);
  const settings = JSON.parse(files.get("config.json").toString()).segments[0].input;
  assert.equal(settings.elements[0].frontal_image_url, "referencias/rosto.png");
  assert.deepEqual(settings.elements[0].reference_image_urls, ["referencias/personagem.png"]);
});

test("foreign influencers, expired uploads, non-AI discoveries and raw URLs cannot start a download or create a ZIP", async () => {
  for (const [body, overrides] of [
    [{ ...input, influencerId: "foreign-character" }, {}],
    [input, { unauthenticated: true }],
    [input, { influencerStatus: "processing" }],
    [{ ...input, source: { kind: "upload", token: "foreign-token" } }, {}],
    [{ ...input, source: { kind: "viral", id: "viral" } }, { aiVideo: false }],
    [{ ...input, source: { kind: "url", url: "https://127.0.0.1/internal" } }, {}],
    [{ ...input, source: { kind: "preset", id: "missing" } }, {}],
  ]) {
    const f = fixture(overrides), result = await f.exportCharacterEdit(body);
    assert.ok(result.error);
    assert.equal(f.downloads.length, 0);
    assert.equal(f.uploads.length, 0);
    assert.equal(f.splits.length, 0);
  }
});

test("invalid source duration is reported before image download, segmentation or storage", async () => {
  const f = fixture({ metadata: { ...originalMetadata, duration: 31 } });
  const result = await f.exportCharacterEdit(input);
  assert.match(result.error, /4 a 30/);
  assert.equal(f.downloads.length, 1);
  assert.equal(f.splits.length, 0);
  assert.equal(f.uploads.length, 0);
});

test("cancellation before or during download prevents a ZIP upload; late upload completion is deleted", async () => {
  for (const phase of ["before", "download", "upload"]) {
    const abort = new AbortController();
    if (phase === "before") abort.abort();
    const f = fixture({ afterDownload: phase === "download" ? () => abort.abort() : undefined, afterUpload: phase === "upload" ? () => abort.abort() : undefined });
    const result = await f.exportCharacterEdit(input, { signal: abort.signal });
    assert.match(result.error, /cancelada/);
    assert.equal(result.url, undefined);
    assert.equal(f.uploads.length, phase === "upload" ? 1 : 0);
    assert.deepEqual(f.deletes, phase === "upload" ? [blobUrl] : []);
  }
});

test("archive filename is safe and upload failures never expose storage error details", async () => {
  const f = fixture({ name: "../../Meu Vídeo \\ teste: exemplo", uploadFailure: true });
  const result = await f.exportCharacterEdit(input);
  assert.ok(result.error);
  assert.ok(!result.error.includes("private-token"));
  assert.equal(result.url, undefined);
  assert.ok(f.uploads[0].path.endsWith("/troca-personagem-meu-video-teste-exemplo.zip"));
  unzip(f.uploads[0].bytes);
});


test("identity preparation failure cannot package stale or original-version images", async () => {
  const f = fixture({ identityFailure: true });
  const result = await f.exportCharacterEdit(input);
  assert.ok(result.error);
  assert.doesNotMatch(result.error, /private-image/);
  assert.equal(f.identityReads.length, 1);
  assert.equal(f.splits.length, 0);
  assert.equal(f.uploads.length, 0);
});

test("single-image export does not fabricate an element from an absent face reference", async () => {
  const f = fixture({ singleImage: true });
  const result = await f.exportCharacterEdit(input);
  assert.equal(result.error, undefined);
  const files = unzip(f.uploads[0].bytes);
  assert.equal(files.has("referencias/rosto.png"), false);
  const settings = JSON.parse(files.get("config.json").toString()).segments[0].input;
  assert.equal(settings.elements, undefined);
  assert.deepEqual(settings.image_urls, ["referencias/personagem.png"]);
  assert.match(settings.prompt, /@Image1/);
});
