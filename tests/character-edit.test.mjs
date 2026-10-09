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
  const rows = new Map(), submissions = [], falSubmissions = [], charges = [], snapshots = [], splitCalls = [];
  const sourceMetadata = overrides.metadata ?? metadata;
  const parts = overrides.parts ?? [
    { start: 0, duration: sourceMetadata.duration / 2, bytes: Buffer.from("mock first segment"), metadata: { ...sourceMetadata, duration: sourceMetadata.duration / 2, frameCount: 205 } },
    { start: sourceMetadata.duration / 2, duration: sourceMetadata.duration / 2, bytes: Buffer.from("mock second segment"), metadata: { ...sourceMetadata, duration: sourceMetadata.duration / 2, frameCount: 204 } },
  ];
  const partMetadata = new Map(parts.map(part => [part.bytes, part.metadata]));
  const metadataByUrl = new Map([[receipt.sourceUrl, sourceMetadata]]);
  const fixtureMedia = { ...media, mp4Metadata: bytes => partMetadata.get(bytes) ?? (overrides.metadata && bytes === (overrides.bytes ?? original) ? sourceMetadata : media.mp4Metadata(bytes)) };
  const db = { getInfluencer: async (owner, id) => owner === "owner" && id === "character" ? { id, status: "completed", imageUrl: receipt.imageUrl } : undefined,
    getViral: async () => ({ id: "viral", title: "Source", playUrl: receipt.sourceUrl }),
    getVideo: async (_user, id) => rows.get(id),
    createVideoOnce: async video => { if (rows.has(video.id)) return false; rows.set(video.id, video); return true; },
    reserveVideoCredits: async (...args) => { charges.push(args); return true; },
    updateVideo: async (id, patch) => { Object.assign(rows.get(id), patch); },
    adjustCredits: async (...args) => charges.push(args), ...overrides.db };
  class PlatformError extends Error { constructor(status) { super("Provider failed"); this.status = status; } }
  class FalError extends Error { constructor(status) { super("Fal provider failed"); this.status = status; } }
  const mocks = {
    "next/cache": { revalidatePath() {} }, "@/lib/auth": { requireUser: async () => ({ id: "owner", credits: 8000 }) },
    "@vercel/blob": { put: async (...args) => {
      snapshots.push(args);
      const index = parts.findIndex(part => part.bytes === args[1]);
      const url = index >= 0 ? `${receipt.sourceUrl}?segment=${index}` : receipt.sourceUrl;
      metadataByUrl.set(url, fixtureMedia.mp4Metadata(args[1]));
      return { url };
    } },
    "@/lib/db": db, "@/data/ai-profiles": { getProfile: () => ({ handle: "profile", posts: [{ code: "clip", video: receipt.sourceUrl, scene: "Scene", prompt: "Invent musicians on a white backdrop" }] }) },
    "@/data/motion-presets": { getMotionPreset: () => ({ drivingVideo: receipt.sourceUrl, name: "Preset", kind: "object_swap" }) },
    "@/lib/ai-discovery": { isAiCharacterVideo: () => true },
    "@/lib/uploaded-reference": { readUploadedReference: (token, user) => { if (token !== "owned-upload" || user !== "owner") throw new Error("Invalid upload"); return { videoUrl: receipt.sourceUrl, name: "Upload" }; } },
    "@/lib/video-media": { publicMediaUrl: v => v, inspectPublicVideo: async url => overrides.inspect ? overrides.inspect(url, metadataByUrl.get(url)) : metadataByUrl.get(url), readPublicVideo: async (...args) => overrides.read ? overrides.read(...args) : overrides.bytes ?? original },
    "@/lib/video-reference": fixtureMedia, "@/lib/character-edit": edit, "@/lib/edit-quote": quotes,
    "@/lib/finalize-edit": { ensureVideoToolsAvailable: async () => {} },
    "@/lib/edit-continuity": { splitContinuousEditSource: async (...args) => { splitCalls.push(args); return parts; } },
    "@/lib/fal": { isFalConfigured: () => overrides.falConfigured !== false, falVideoWebhookUrl: () => undefined, FalError, submitFalGeneration: async (...args) => {
      falSubmissions.push(args);
      if (overrides.falFailure && falSubmissions.length === (overrides.falFailureAt ?? 1)) throw new FalError(overrides.falFailure);
      return { requestId: `fal-request-${falSubmissions.length}` };
    } },
    "@/lib/platform": { isConfigured: () => true, PlatformError, submitGeneration: async (...args) => { submissions.push(args); if (overrides.failure) throw new PlatformError(overrides.failure); return { requestId: "provider-request" }; } },
    "@/lib/costs": { VIDEO_COST: 1000 },
  };
  const preparation = load("src/lib/prepare-character-edit.ts", mocks);
  const actions = load("src/app/actions/character-edit.ts", { ...mocks, "@/lib/prepare-character-edit": preparation });
  return { actions, preparation, rows, submissions, falSubmissions, charges, snapshots, splitCalls, parts, metadataByUrl };
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

test("preparation reports actual completed stages and returns a signed quote without any paid calls", async () => {
  const f = fixture(), events = [];
  const signal = new AbortController().signal;
  const prepared = await f.preparation.prepareCharacterEdit({ influencerId: "character", source: { kind: "upload", token: "owned-upload" }, targetMode: "main", engine: "fal-kling-pro", resolution: "auto" }, {
    signal,
    onProgress: event => events.push({ ...event, snapshotCount: f.snapshots.length, splitCount: f.splitCalls.length }),
  });
  assert.ok(prepared.quote, prepared.error);
  const stages = events.map(event => event.stage);
  assert.equal(stages[0], "auth"); assert.equal(stages.at(-1), "ready");
  assert.ok(stages.indexOf("download") < stages.indexOf("snapshot"));
  assert.ok(stages.indexOf("snapshot") < stages.indexOf("segments"));
  assert.equal(events.find(event => event.stage === "download").snapshotCount, 0);
  assert.equal(events.find(event => event.stage === "segments").snapshotCount, 1);
  assert.equal(events.at(-1).snapshotCount, 3); assert.equal(events.at(-1).splitCount, 1);
  assert.ok(events.every(event => event.type === "progress" && event.message.length > 0));
  assert.equal(quotes.readEditQuote(prepared.quote.token, "owner").engine, "fal-kling-pro");
  assert.equal(f.snapshots[0][2].abortSignal, signal);
  assert.equal(f.charges.length, 0); assert.equal(f.submissions.length, 0); assert.equal(f.falSubmissions.length, 0);
});

test("cancelled preparation stops before snapshots, debit or paid submissions even after downloading the original", async () => {
  const input = { influencerId: "character", source: { kind: "preset", id: "preset" }, targetMode: "main", engine: "fal-kling-pro", resolution: "auto" };
  for (const timing of ["before", "download"]) {
    const abort = new AbortController(), events = [];
    let downloads = 0;
    if (timing === "before") abort.abort();
    const f = fixture({ read: async () => { downloads++; abort.abort(); return original; } });
    const result = await f.preparation.prepareCharacterEdit(input, { signal: abort.signal, onProgress: event => events.push(event) });
    assert.ok(result.error); assert.equal(result.quote, undefined);
    assert.equal(downloads, timing === "before" ? 0 : 1);
    assert.equal(events.some(event => event.stage === "ready"), false);
    assert.equal(f.snapshots.length, 0); assert.equal(f.splitCalls.length, 0); assert.equal(f.rows.size, 0);
    assert.equal(f.charges.length, 0); assert.equal(f.submissions.length, 0); assert.equal(f.falSubmissions.length, 0);
  }
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

test("Wan pricing uses 409 real input frames rather than a guessed FPS or rounded seconds", () => {
  assert.equal(metadata.frameCount, 409);
  assert.equal(edit.estimateProviderEdit("fal-wan", metadata, "720p").estimatedUsd, 2.05);
  assert.equal(edit.estimateProviderEdit("fal-wan", metadata, "480p").estimatedUsd, 1.03);
  for (const frameCount of [undefined, 0, 409.5, Infinity]) {
    assert.throws(() => edit.estimateProviderEdit("fal-wan", { ...metadata, frameCount }, "720p"), /quadros/);
  }
});

test("a signed Wan quote routes once to fal Replace with the original video and character image", async () => {
  const f = fixture();
  const prepared = await f.actions.prepareCharacterEditAction({ influencerId: "character", source: { kind: "preset", id: "preset" }, targetMode: "main", resolution: "720p", engine: "fal-wan" });
  assert.ok(prepared.quote, prepared.error);
  assert.equal(prepared.quote.engine, "fal-wan");
  assert.equal(prepared.quote.segmentCount, 1); assert.equal(prepared.quote.estimatedUsd, 2.05);
  assert.equal(f.falSubmissions.length, 0); assert.equal(f.charges.length, 0); assert.equal(f.splitCalls.length, 0);
  const frozen = quotes.readEditQuote(prepared.quote.token, "owner");
  assert.equal(frozen.engine, "fal-wan"); assert.equal(frozen.metadata.frameCount, 409);
  const results = await Promise.all([
    f.actions.generateCharacterEditAction({ quoteToken: prepared.quote.token, acceptedEstimate: true }),
    f.actions.generateCharacterEditAction({ quoteToken: prepared.quote.token, acceptedEstimate: true }),
  ]);
  assert.equal(results[0].id, frozen.id); assert.equal(results[1].id, frozen.id);
  assert.equal(f.falSubmissions.length, 1); assert.equal(f.submissions.length, 0); assert.equal(f.charges.length, 1);
  const [model, input] = f.falSubmissions[0];
  assert.equal(model, "fal-ai/wan/v2.2-14b/animate/replace");
  assert.equal(input.video_url, prepared.quote.sourceUrl); assert.equal(input.image_url, receipt.imageUrl);
  assert.equal(input.resolution, "720p"); assert.equal(input.seed, frozen.seed);
  assert.equal(input.use_turbo, false); assert.equal(input.video_quality, "maximum");
  assert.equal(input.enable_safety_checker, true); assert.equal(input.enable_output_safety_checker, true);
  assert.equal(input.prompt, undefined); assert.equal(input.image_urls, undefined);
  assert.equal(f.rows.get(frozen.id).edit.provider, "fal"); assert.equal(f.rows.get(frozen.id).status, "processing");
});

test("the signed engine cannot be changed from Wan to a different provider by the browser", async () => {
  const f = fixture();
  const signed = quotes.signEditQuote({ ...receipt, engine: "fal-wan", target: edit.MAIN_CHARACTER_TARGET });
  const [payload, signature] = signed.split(".");
  const changed = JSON.parse(Buffer.from(payload, "base64url").toString());
  changed.engine = "higgsfield";
  const token = `${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${signature}`;
  assert.ok((await f.actions.generateCharacterEditAction({ quoteToken: token, acceptedEstimate: true })).error);
  assert.equal(f.rows.size, 0); assert.equal(f.charges.length, 0); assert.equal(f.falSubmissions.length, 0); assert.equal(f.submissions.length, 0);
});

test("manual Wan targets, unsupported engine resolutions and unknown frame counts never reach paid APIs", async () => {
  const f = fixture();
  for (const choice of [
    { engine: "fal-wan", resolution: "720p", targetMode: "manual", target: receipt.target },
    { engine: "fal-wan", resolution: "1080p" },
    { engine: "fal-kling-standard", resolution: "1080p" },
    { engine: "fal-kling-pro", resolution: "720p" },
    { engine: "unrecognized-model", resolution: "720p" },
  ]) {
    const result = await f.actions.prepareCharacterEditAction({ influencerId: "character", source: { kind: "preset", id: "preset" }, targetMode: "main", ...choice });
    assert.ok(result.error, JSON.stringify(choice));
  }
  assert.equal(f.snapshots.length, 0); assert.equal(f.charges.length, 0); assert.equal(f.submissions.length, 0); assert.equal(f.falSubmissions.length, 0);
  const unknown = fixture({ metadata: { ...metadata, frameCount: undefined } });
  const result = await unknown.actions.prepareCharacterEditAction({ influencerId: "character", source: { kind: "preset", id: "preset" }, targetMode: "main", engine: "fal-wan", resolution: "720p" });
  assert.ok(result.error); assert.equal(unknown.charges.length, 0); assert.equal(unknown.falSubmissions.length, 0);
});

test("Kling prepares and prices the complete 17-second original as two reference-preserving edits", async () => {
  for (const [engine, resolution, model, price] of [
    ["fal-kling-standard", "auto", "fal-ai/kling-video/o3/standard/video-to-video/edit", 2.27],
    ["fal-kling-pro", "auto", "fal-ai/kling-video/o3/pro/video-to-video/edit", 3.03],
  ]) {
    const f = fixture();
    const prepared = await f.actions.prepareCharacterEditAction({ influencerId: "character", source: { kind: "upload", token: "owned-upload" }, targetMode: "manual", target: receipt.target, engine, resolution });
    assert.ok(prepared.quote, prepared.error);
    assert.equal(prepared.quote.engine, engine); assert.equal(prepared.quote.segmentCount, 2); assert.equal(prepared.quote.estimatedUsd, price);
    assert.equal(prepared.quote.metadata.duration, 17.157);
    assert.equal(f.snapshots.length, 3); assert.equal(f.splitCalls.length, 1); assert.equal(f.splitCalls[0][0], original);
    assert.equal(f.charges.length, 0); assert.equal(f.falSubmissions.length, 0);
    const frozen = quotes.readEditQuote(prepared.quote.token, "owner");
    assert.equal(frozen.segments.length, 2); assert.equal(frozen.segments[0].start, 0);
    assert.equal(frozen.segments[1].start, frozen.segments[0].source.duration);
    assert.equal(frozen.segments.reduce((sum, part) => sum + part.source.duration, 0), metadata.duration);
    const result = await f.actions.generateCharacterEditAction({ quoteToken: prepared.quote.token, acceptedEstimate: true });
    assert.equal(result.id, frozen.id); assert.equal(f.charges.length, 1); assert.equal(f.falSubmissions.length, 2); assert.equal(f.submissions.length, 0);
    for (const [index, [submittedModel, input]] of f.falSubmissions.entries()) {
      assert.equal(submittedModel, model); assert.equal(input.video_url, frozen.segments[index].sourceUrl);
      assert.equal(input.image_urls[0], receipt.imageUrl); assert.equal(input.keep_audio, true);
      assert.ok(input.prompt.includes("@Video1")); assert.ok(input.prompt.includes("@Image1"));
      assert.ok(input.prompt.includes(receipt.target)); assert.ok(input.prompt.includes("Do not replace any other person"));
      assert.ok(input.prompt.includes("not a still image")); assert.ok(!input.prompt.includes("Invent musicians on a white backdrop"));
      assert.equal(input.duration, undefined); assert.equal(input.resolution, undefined);
    }
    const stored = f.rows.get(frozen.id);
    assert.equal(stored.edit.model, model); assert.equal(stored.edit.provider, "fal");
    assert.equal(stored.status, "processing"); assert.equal(stored.edit.segments[0].requestId, "fal-request-1"); assert.equal(stored.edit.segments[1].requestId, "fal-request-2");
  }
});

test("Kling estimates round each prepared segment instead of charging only the first segment or the unsplit duration", async () => {
  const f = fixture({ metadata: { ...metadata, duration: 16.1 } });
  const prepared = await f.actions.prepareCharacterEditAction({ influencerId: "character", source: { kind: "preset", id: "preset" }, targetMode: "main", engine: "fal-kling-standard", resolution: "auto" });
  assert.ok(prepared.quote, prepared.error);
  assert.equal(prepared.quote.segmentCount, 2);
  assert.equal(prepared.quote.estimatedUsd, 2.27); // ceil(8.05) + ceil(8.05) = 18 billable seconds.
  assert.notEqual(prepared.quote.estimatedUsd, Math.ceil(Math.ceil(16.1) * 126 / 10) / 100);
  assert.equal(f.charges.length, 0); assert.equal(f.falSubmissions.length, 0);
});

test("a changed segment is rejected before credits or any paid provider submission", async () => {
  const f = fixture({ inspect: (url, value) => url.endsWith("segment=1") ? { ...value, duration: 3.97 } : value });
  const prepared = await f.actions.prepareCharacterEditAction({ influencerId: "character", source: { kind: "preset", id: "preset" }, targetMode: "main", engine: "fal-kling-standard", resolution: "auto" });
  assert.ok(prepared.quote, prepared.error);
  assert.ok((await f.actions.generateCharacterEditAction({ quoteToken: prepared.quote.token, acceptedEstimate: true })).error);
  assert.equal(f.rows.size, 0); assert.equal(f.charges.length, 0); assert.equal(f.falSubmissions.length, 0); assert.equal(f.submissions.length, 0);
});

test("uncertain second fal submissions retain the first request for review and cannot be charged or sent twice", async () => {
  for (const falFailure of [403, 502]) {
    const f = fixture({ falFailure, falFailureAt: 2 });
    const prepared = await f.actions.prepareCharacterEditAction({ influencerId: "character", source: { kind: "preset", id: "preset" }, targetMode: "main", engine: "fal-kling-pro", resolution: "auto" });
    assert.ok(prepared.quote, prepared.error);
    const result = await f.actions.generateCharacterEditAction({ quoteToken: prepared.quote.token, acceptedEstimate: true });
    assert.ok(result.error);
    const frozen = quotes.readEditQuote(prepared.quote.token, "owner"), stored = f.rows.get(frozen.id);
    assert.equal(stored.status, "review"); assert.equal(stored.requestId, "fal-request-1");
    assert.equal(stored.edit.segments[0].requestId, "fal-request-1"); assert.equal(stored.edit.segments[1].requestId, undefined);
    assert.equal(f.charges.length, 1); assert.equal(f.falSubmissions.length, 2); assert.equal(f.submissions.length, 0);
    const repeated = await f.actions.generateCharacterEditAction({ quoteToken: prepared.quote.token, acceptedEstimate: true });
    assert.equal(repeated.id, stored.id); assert.equal(f.charges.length, 1); assert.equal(f.falSubmissions.length, 2);
  }
});

test("fal failures never fall back to Higgsfield and only a definite first-request refusal refunds internal credits", async () => {
  for (const falFailure of [422, 408, 503]) {
    const f = fixture({ falFailure });
    const prepared = await f.actions.prepareCharacterEditAction({ influencerId: "character", source: { kind: "preset", id: "preset" }, targetMode: "main", engine: "fal-wan", resolution: "720p" });
    assert.ok(prepared.quote, prepared.error);
    await f.actions.generateCharacterEditAction({ quoteToken: prepared.quote.token, acceptedEstimate: true });
    const frozen = quotes.readEditQuote(prepared.quote.token, "owner");
    assert.equal(f.rows.get(frozen.id).status, falFailure === 422 ? "failed" : "review");
    assert.equal(f.charges.length, falFailure === 422 ? 2 : 1);
    assert.equal(f.falSubmissions.length, 1); assert.equal(f.submissions.length, 0);
    await f.actions.generateCharacterEditAction({ quoteToken: prepared.quote.token, acceptedEstimate: true });
    assert.equal(f.falSubmissions.length, 1); assert.equal(f.submissions.length, 0);
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

test("a fifteen-second picture track with an audio tail uses one verified Kling input and one charge", async () => {
  const source = { ...metadata, duration: 15.137, videoDuration: 15, audioDuration: 15.137, frameCount: 450 };
  const silent = { ...source, duration: 15, hasAudio: false, audioDuration: undefined };
  const parts = [{ start: 0, duration: 15, bytes: Buffer.from('all 450 original pictures without the audio tail'), metadata: silent }];
  const f = fixture({ metadata: source, parts });
  const prepared = await f.actions.prepareCharacterEditAction({ influencerId: 'character', source: {kind:'preset',id:'preset'}, targetMode:'main', engine:'fal-kling-pro', resolution:'auto' });
  assert.ok(prepared.quote, prepared.error);
  assert.equal(prepared.quote.segmentCount, 1);
  assert.equal(prepared.quote.estimatedUsd, 2.52);
  const frozen = quotes.readEditQuote(prepared.quote.token, 'owner');
  assert.equal(frozen.assembly, 'overlap-v1');
  assert.equal(frozen.segments[0].source.frameCount, 450);
  assert.equal(frozen.segments[0].source.duration, 15);
  assert.notEqual(frozen.segments[0].sourceUrl, frozen.sourceUrl);
  const result = await f.actions.generateCharacterEditAction({quoteToken:prepared.quote.token,acceptedEstimate:true});
  assert.equal(result.id, frozen.id);
  assert.equal(f.falSubmissions.length, 1);
  assert.equal(f.falSubmissions[0][1].video_url, frozen.segments[0].sourceUrl);
  assert.equal(f.charges.length, 1);
  assert.equal(f.rows.get(result.id).edit.assembly, 'overlap-v1');
  const tampered = fixture({metadata:source,parts,inspect:(url,value)=>url.includes('?segment=')?{...value,duration:15.8}:value});
  const quote = await tampered.actions.prepareCharacterEditAction({ influencerId:'character',source:{kind:'preset',id:'preset'},targetMode:'main',engine:'fal-kling-pro',resolution:'auto' });
  assert.ok((await tampered.actions.generateCharacterEditAction({quoteToken:quote.quote.token,acceptedEstimate:true})).error);
  assert.equal(tampered.charges.length,0);
  assert.equal(tampered.falSubmissions.length,0);
});

test("overlap and a third segment are bound into the accepted quote without hidden submissions or charges", async () => {
  const source = {...metadata,duration:30,videoDuration:30,frameCount:720};
  const starts=[0,9.833333333333334,19.666666666666668];
  const parts=starts.map((start,i)=>({start,duration:10.333333333333334,bytes:Buffer.from(`context video ${i}`),metadata:{...source,duration:10.333333333333334,videoDuration:10.333333333333334,frameCount:248,hasAudio:false}}));
  const f=fixture({metadata:source,parts});
  const prepared=await f.actions.prepareCharacterEditAction({influencerId:'character',source:{kind:'preset',id:'preset'},targetMode:'main',engine:'fal-kling-pro',resolution:'auto'});
  assert.ok(prepared.quote,prepared.error);
  assert.equal(prepared.quote.segmentCount,3);
  assert.equal(prepared.quote.estimatedUsd,5.55); // Three 11-second billing ceilings; includes all repeated context.
  assert.match(prepared.quote.costDetail,/intervalo compartilhado/);
  const frozen=quotes.readEditQuote(prepared.quote.token,'owner');
  assert.equal(frozen.assembly,'overlap-v1');
  assert.deepEqual(Array.from(frozen.segments,s=>s.start),starts);
  assert.equal(f.charges.length,0);
  assert.equal(f.falSubmissions.length,0);
  const first=await f.actions.generateCharacterEditAction({quoteToken:prepared.quote.token,acceptedEstimate:true});
  const repeat=await f.actions.generateCharacterEditAction({quoteToken:prepared.quote.token,acceptedEstimate:true});
  assert.equal(first.id,repeat.id);
  assert.equal(f.falSubmissions.length,3);
  assert.equal(f.charges.length,1);
});

test('Wan preparation blocks the reported 4:3 crop before any snapshot, debit or paid API request',async()=>{
  const f=fixture({metadata:{...metadata,width:1664,height:1248}});
  const result=await f.actions.prepareCharacterEditAction({influencerId:'character',source:{kind:'preset',id:'preset'},targetMode:'main',engine:'fal-wan',resolution:'720p'});
  assert.match(result.error,/Wan pode recortar/);assert.equal(f.snapshots.length,0);assert.equal(f.charges.length,0);assert.equal(f.falSubmissions.length,0);
});
