import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id), process: { env: { AUTH_SECRET: "test-character-edit-secret" } }, Buffer, URL, AbortSignal, ...globals });
  return module.exports;
}
const media = load("src/lib/video-reference.ts"), edit = load("src/lib/character-edit.ts"), quotes = load("src/lib/edit-quote.ts");
const original = readFileSync(new URL("../public/reel-videos/Dd_qcXdgsdb.mp4", import.meta.url));
const metadata = media.mp4Metadata(original);
const receipt = { id: "edit-1", userId: "owner", influencerId: "character", imageUrl: "https://images.example/character.jpg", sourceUrl: "https://media.example/original.mp4", name: "Original", target: "homem de casaco roxo no centro", metadata, resolution: "720p", estimatedUsd: edit.estimateEditUsd(metadata.duration, "720p"), expiresAt: Date.now() + 600000 };

test("the actual 17-second source meets Object Swap requirements and cost rounds input seconds up", () => {
  assert.ok(metadata.duration > 17 && metadata.duration < 18);
  assert.equal(metadata.width, 720); assert.equal(metadata.height, 1280); assert.equal(metadata.hasAudio, true);
  assert.equal(edit.validateEditSource(metadata), undefined);
  assert.equal(receipt.estimatedUsd, 12.26);
  assert.equal(edit.estimateEditUsd(metadata.duration, "1080p"), 29.38);
  assert.equal(edit.estimateEditUsd(29.08, "720p"), 20.43);
  assert.equal(edit.estimateEditUsd(29.08, "480p"), 9.54);
  for (const duration of [3.99, 30.01, Infinity]) assert.ok(edit.validateEditSource({ ...metadata, duration }));
  assert.ok(edit.validateEditSource({ ...metadata, width: 320, height: 480 }));
});

test("a four-second output or changed aspect ratio cannot pass technical validation", () => {
  assert.ok(edit.checkEditResult(metadata, { ...metadata, duration: 3.97 }));
  assert.ok(edit.checkEditResult(metadata, { ...metadata, width: 816, height: 1104 }));
  assert.equal(edit.checkEditResult(metadata, { ...metadata, width: 1080, height: 1920 }), undefined);
});

test("quotes bind the user, selected subject, source, resolution and price; tampering/expiry fail", () => {
  const token = quotes.signEditQuote(receipt);
  assert.equal(quotes.readEditQuote(token, "owner").target, receipt.target);
  assert.throws(() => quotes.readEditQuote(token, "other"));
  assert.throws(() => quotes.readEditQuote(token + "x", "owner"));
  assert.throws(() => quotes.readEditQuote(quotes.signEditQuote({ ...receipt, expiresAt: 0 }), "owner"));
});

function fixture(overrides = {}) {
  const rows = new Map(), submissions = [], charges = [], snapshots = [];
  const db = { getInfluencer: async (owner, id) => owner === "owner" && id === "character" ? { id, status: "completed", imageUrl: receipt.imageUrl } : undefined,
    getViral: async () => ({ id: "viral", title: "Source", playUrl: receipt.sourceUrl }),
    getVideo: async (_user, id) => rows.get(id),
    createVideoOnce: async video => { if (rows.has(video.id)) return false; rows.set(video.id, video); return true; },
    reserveVideoCredits: async (...args) => { charges.push(args); return true; },
    updateVideo: async (id, patch) => { Object.assign(rows.get(id), patch); },
    adjustCredits: async (...args) => charges.push(args), ...overrides.db };
  class PlatformError extends Error { constructor(status) { super("Provider failed"); this.status = status; } }
  const actions = load("src/app/actions/character-edit.ts", {
    "next/cache": { revalidatePath() {} }, "@/lib/auth": { requireUser: async () => ({ id: "owner", credits: 8000 }) },
    "@vercel/blob": { put: async (...args) => { snapshots.push(args); return { url: receipt.sourceUrl }; } },
    "@/lib/db": db, "@/data/ai-profiles": { getProfile: () => ({ handle: "profile", posts: [{ code: "clip", video: receipt.sourceUrl, scene: "Scene", prompt: "Invent musicians on a white backdrop" }] }) },
    "@/data/motion-presets": { getMotionPreset: () => ({ drivingVideo: receipt.sourceUrl, name: "Preset", kind: "object_swap" }) },
    "@/lib/ai-discovery": { isAiCharacterVideo: () => true },
    "@/lib/uploaded-reference": { readUploadedReference: (token, user) => { if (token !== "owned-upload" || user !== "owner") throw new Error("Invalid upload"); return { videoUrl: receipt.sourceUrl, name: "Upload" }; } },
    "@/lib/video-media": { publicMediaUrl: v => v, inspectPublicVideo: async () => metadata, readPublicVideo: async () => overrides.bytes ?? original },
    "@/lib/video-reference": media, "@/lib/character-edit": edit, "@/lib/edit-quote": quotes,
    "@/lib/finalize-edit": { ensureVideoToolsAvailable: async () => {} },
    "@/lib/platform": { isConfigured: () => true, PlatformError, submitGeneration: async (...args) => { submissions.push(args); if (overrides.failure) throw new PlatformError(overrides.failure); return { requestId: "provider-request" }; } },
    "@/lib/costs": { VIDEO_COST: 1000 },
  });
  return { actions, rows, submissions, charges, snapshots };
}

test("catalog, discovery, presets and owned uploads all prepare a frozen original without paying the provider", async () => {
  const f = fixture();
  for (const source of [{ kind: "profile", handle: "profile", id: "clip" }, { kind: "viral", id: "viral" }, { kind: "preset", id: "preset" }, { kind: "upload", token: "owned-upload" }]) {
    const prepared = await f.actions.prepareCharacterEditAction({ influencerId: "character", source, target: receipt.target, resolution: "720p" });
    assert.equal(prepared.quote.metadata.duration, metadata.duration);
    assert.equal(prepared.quote.estimatedUsd, 12.26);
    assert.deepEqual(f.snapshots.at(-1)[1], original);
  }
  assert.equal(f.submissions.length, 0); assert.equal(f.charges.length, 0);
  const invalid = await f.actions.prepareCharacterEditAction({ influencerId: "character", source: { kind: "upload", token: "foreign" }, target: receipt.target, resolution: "720p" });
  assert.ok(invalid.error);
});

test("confirmed quote submits Object Swap once with original video + character image and no invented scene", async () => {
  const f = fixture(), token = quotes.signEditQuote(receipt);
  assert.ok((await f.actions.generateCharacterEditAction({ quoteToken: token, acceptedEstimate: false })).error);
  assert.equal(f.submissions.length, 0);
  const results = await Promise.all([f.actions.generateCharacterEditAction({ quoteToken: token, acceptedEstimate: true }), f.actions.generateCharacterEditAction({ quoteToken: token, acceptedEstimate: true })]);
  assert.equal(results[0].id, receipt.id); assert.equal(f.submissions.length, 1); assert.equal(f.charges.length, 1);
  const [model, input] = f.submissions[0];
  assert.equal(model, "higgsfield/genjutsu/object-swap/v1.0");
  assert.equal(input.video_url, receipt.sourceUrl); assert.equal(input.image_urls[0], receipt.imageUrl);
  assert.equal(input.resolution, "720p"); assert.equal(input.duration, undefined); assert.equal(input.image_url, undefined);
  assert.ok(input.prompt.includes(receipt.target)); assert.ok(input.prompt.includes("not a still image"));
  assert.ok(!input.prompt.includes("Invent musicians on a white backdrop"));
  assert.equal(f.rows.get(receipt.id).edit.model, model);
});

test("automatic targeting is frozen on the server and submitted without a manual description", async () => {
  const f = fixture();
  const prepared = await f.actions.prepareCharacterEditAction({ influencerId: "character", source: { kind: "preset", id: "preset" }, targetMode: "main", target: "ignore the main character", resolution: "480p" });
  assert.ok(prepared.quote);
  assert.equal(quotes.readEditQuote(prepared.quote.token, "owner").target, edit.MAIN_CHARACTER_TARGET);
  assert.equal(f.submissions.length, 0); assert.equal(f.charges.length, 0);
  await f.actions.generateCharacterEditAction({ quoteToken: prepared.quote.token, acceptedEstimate: true });
  assert.equal(f.submissions.length, 1);
  assert.equal(f.submissions[0][1].resolution, "480p");
  assert.ok(f.submissions[0][1].prompt.includes(edit.MAIN_CHARACTER_TARGET));
  assert.ok(!f.submissions[0][1].prompt.includes("ignore the main character"));
});

test("invalid manual selection, target modes and resolutions fail before snapshot or generation", async () => {
  const f = fixture();
  for (const override of [{ targetMode: "manual", target: "" }, { targetMode: "manual", target: "short" }, { targetMode: "all" }, { resolution: "360p" }]) {
    const result = await f.actions.prepareCharacterEditAction({ influencerId: "character", source: { kind: "preset", id: "preset" }, targetMode: "main", resolution: "720p", ...override });
    assert.ok(result.error);
  }
  assert.equal(f.snapshots.length, 0); assert.equal(f.submissions.length, 0); assert.equal(f.charges.length, 0);
});

test("provider refusals never fall back to Kling; unknown acceptance is marked for review without a resubmission", async () => {
  for (const failure of [403, 502]) {
    const f = fixture({ failure });
    await f.actions.generateCharacterEditAction({ quoteToken: quotes.signEditQuote(receipt), acceptedEstimate: true });
    assert.equal(f.submissions.length, 1);
    assert.equal(f.rows.get(receipt.id).status, failure === 403 ? "failed" : "review");
    assert.equal(f.charges.length, failure === 403 ? 2 : 1);
  }
});

test("finalization flags a shortened video instead of publishing it as completed", async () => {
  const shortened = { ...metadata, duration: 3.97 };
  let stored = false;
  const f = load("src/lib/finalize-edit.ts", {
    "@vercel/blob": { put: async () => { stored = true; } },
    "./video-reference": { mp4Metadata: () => shortened }, "./character-edit": edit,
    "./video-media": { readPublicVideo: async () => original },
  });
  const result = await f.finalizeCharacterEdit({ id: "job", userId: "owner", edit: { source: metadata } }, "https://example.com/output.mp4");
  assert.equal(result.status, "review"); assert.match(result.error, /Duração divergente/); assert.equal(stored, false);
});

test("real MP4 finalization copies the original audio packets and keeps picture duration and dimensions", async () => {
  const ffmpeg = require("@ffmpeg-installer/ffmpeg");
  const f = load("src/lib/finalize-edit.ts", { "@vercel/blob": {}, "./video-reference": media, "./character-edit": edit, "./video-media": {} });
  const directory = mkdtempSync(path.join(tmpdir(), "mi-audio-test-"));
  try {
    const a = path.join(directory, "a.mp4"), b = path.join(directory, "b.mp4"), silentPath = path.join(directory, "silent.mp4");
    writeFileSync(a, original);
    execFileSync(ffmpeg.path, ["-v", "error", "-i", a, "-an", "-c:v", "copy", silentPath], { windowsHide: true });
    const silent = readFileSync(silentPath);
    assert.equal(media.mp4Metadata(silent).hasAudio, false);
    const final = await f.preserveSourceAudio(silent, original);
    assert.equal(edit.checkEditResult(metadata, media.mp4Metadata(final)), undefined);
    writeFileSync(b, final);
    const audio = file => execFileSync(ffmpeg.path, ["-v", "error", "-i", file, "-map", "0:a:0", "-c", "copy", "-f", "data", "pipe:1"], { windowsHide: true, maxBuffer: 5 * 1024 * 1024 });
    assert.deepEqual(audio(a), audio(b));
    const withoutInventedAudio = await f.preserveSourceAudio(original, silent);
    assert.equal(media.mp4Metadata(withoutInventedAudio).hasAudio, false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
