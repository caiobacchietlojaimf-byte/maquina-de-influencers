import assert from "node:assert/strict";
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
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id), Buffer }, { filename: file });
  return module.exports;
}
const edit = load("src/lib/character-edit.ts");
const source = { duration: 17.157, width: 720, height: 1280, hasAudio: true, frameCount: 409 };
const model = "fal-ai/kling-video/o3/pro/video-to-video/edit";
const outputUrls = ["https://media.example/first-result.mp4", "https://media.example/second-result.mp4"];
function video() {
  return {
    id: "edit-1", userId: "owner", status: "processing", createdAt: Date.now(), requestId: "request-1", kind: "viral",
    edit: {
      provider: "fal", model, sourceUrl: "https://media.example/original.mp4", source,
      imageUrl: "https://media.example/character.jpg", target: "main character", resolution: "auto", estimatedUsd: 3.03,
      segments: [
        { sourceUrl: "https://media.example/first-source.mp4", source: { ...source, duration: 8.5, frameCount: 203 }, start: 0, requestId: "request-1" },
        { sourceUrl: "https://media.example/second-source.mp4", source: { ...source, duration: 8.657, frameCount: 206 }, start: 8.5, requestId: "request-2" },
      ],
    },
  };
}

function pollFixture(item = video(), overrides = {}) {
  const records = new Map([[item.id, structuredClone(item)]]);
  const falReads = [], higgsfieldReads = [], submissions = [], charges = [], updates = [], claims = [], finalizations = [];
  const leased = new Set();
  const actions = load("src/app/actions/videos.ts", {
    "next/cache": { revalidatePath() {} }, "@/data/viral-effects": {}, "@/data/video-presets": { VIDEO_PRESETS: [] },
    "@/lib/auth": { requireUser: async () => ({ id: "owner", credits: 7875 }) },
    "@/lib/db": {
      listVideos: async owner => { assert.equal(owner, "owner"); return [...records.values()].map(row => structuredClone(row)); },
      claimVideoFinalization: async item => {
        claims.push(item.id);
        if (leased.has(item.id)) return false;
        leased.add(item.id); return true;
      },
      updateVideo: async (id, patch) => { updates.push([id, patch]); Object.assign(records.get(id), patch); },
      adjustCredits: async (...args) => charges.push(args),
    },
    "@/lib/prompt": {}, "@/lib/costs": { VIDEO_COST: 1000 },
    "@/lib/platform": {
      getStatus: async (...args) => { higgsfieldReads.push(args); throw new Error("Unexpected Higgsfield request"); },
      submitGeneration: async (...args) => { submissions.push(args); throw new Error("Unexpected paid request"); },
      isConfigured: () => true, TERMINAL_STATUSES: new Set(["completed", "failed"]),
    },
    "@/lib/fal": {
      getFalGenerationStatus: async (...args) => {
        falReads.push(args);
        return overrides.status ? overrides.status(...args) : { status: "completed", videoUrl: outputUrls[args[1] === "request-1" ? 0 : 1] };
      },
    },
    "@/lib/finalize-edit": {
      finalizeCharacterEdit: async (...args) => { finalizations.push({ kind: "single", args }); return { status: "completed", resultUrl: "https://media.example/final.mp4", edit: args[0].edit }; },
    },
    "@/lib/finalize-segmented-edit": {
      finalizeSegmentedEdit: async (...args) => { finalizations.push({ kind: "segmented", args }); return { status: "completed", resultUrl: "https://media.example/final.mp4", edit: args[0].edit }; },
    },
  });
  return { actions, records, falReads, higgsfieldReads, submissions, charges, updates, claims, leased, finalizations };
}

test("queued fal jobs and incomplete segment submissions are never polled or finalized", async () => {
  for (const state of ["queued", "missing-segment-request", "missing-job-request"]) {
    const item = video();
    if (state === "queued") item.status = "queued";
    if (state === "missing-segment-request") delete item.edit.segments[1].requestId;
    if (state === "missing-job-request") delete item.requestId;
    const f = pollFixture(item);
    await f.actions.pollVideosAction();
    assert.equal(f.falReads.length, 0); assert.equal(f.higgsfieldReads.length, 0); assert.equal(f.finalizations.length, 0);
    assert.equal(f.updates.length, 0); assert.equal(f.claims.length, 0); assert.equal(f.submissions.length, 0); assert.equal(f.charges.length, 0);
  }
});

test("all fal segments use the frozen model and concurrent polls finalize the complete video only once", async () => {
  const f = pollFixture();
  await Promise.all([f.actions.pollVideosAction(), f.actions.pollVideosAction()]);
  assert.ok(f.falReads.length >= 2);
  assert.ok(f.falReads.every(([requestedModel, id]) => requestedModel === model && ["request-1", "request-2"].includes(id)));
  assert.equal(f.higgsfieldReads.length, 0); assert.equal(f.leased.size, 1); assert.equal(f.finalizations.length, 1);
  const finalized = f.finalizations[0];
  assert.equal(finalized.kind, "segmented");
  assert.deepEqual(Array.from(finalized.args[1]), outputUrls);
  assert.equal(finalized.args[0].edit.sourceUrl, video().edit.sourceUrl);
  assert.deepEqual(Array.from(finalized.args[0].edit.segments, part => part.resultUrl), outputUrls);
  assert.equal(f.records.get("edit-1").status, "completed");
  assert.equal(f.submissions.length, 0); assert.equal(f.charges.length, 0);
});

test("interrupted submissions recover known complete requests or require review without a paid retry", async () => {
  for (const complete of [true, false]) {
    const item = video(); item.status = "queued"; item.createdAt = Date.now() - 360000;
    if (!complete) delete item.edit.segments[1].requestId;
    const f = pollFixture(item);
    await f.actions.pollVideosAction();
    assert.equal(f.records.get(item.id).status, complete ? "processing" : "review");
    assert.equal(f.submissions.length, 0); assert.equal(f.charges.length, 0); assert.equal(f.finalizations.length, 0);
  }
});

test("single-part Wan completion uses its model and the original-audio finalizer without assembling segments", async () => {
  const item = video();
  item.edit.model = "fal-ai/wan/v2.2-14b/animate/replace";
  item.edit.segments = [{ sourceUrl: item.edit.sourceUrl, source, start: 0, requestId: item.requestId }];
  const f = pollFixture(item);
  await f.actions.pollVideosAction();
  assert.equal(f.falReads.length, 1); assert.equal(f.falReads[0][0], item.edit.model);
  assert.equal(f.finalizations.length, 1); assert.equal(f.finalizations[0].kind, "single");
  assert.equal(f.finalizations[0].args[0].edit.sourceUrl, item.edit.sourceUrl);
  assert.equal(f.finalizations[0].args[1], outputUrls[0]); assert.equal(f.higgsfieldReads.length, 0);
});

test("partial, in-progress and incomplete fal responses wait without claiming or finalizing", async () => {
  for (const pending of [{ status: "queued" }, { status: "processing" }, { status: "completed" }]) {
    const f = pollFixture(video(), { status: async (_model, id) => id === "request-1" ? { status: "completed", videoUrl: outputUrls[0] } : pending });
    await f.actions.pollVideosAction();
    assert.equal(f.falReads.length, 2); assert.equal(f.claims.length, 0); assert.equal(f.finalizations.length, 0);
    assert.equal(f.updates.length, 0); assert.equal(f.records.get("edit-1").status, "processing");
  }
});

test("a failed fal segment requires review and preserves requests without automatic resubmission or refund", async () => {
  const f = pollFixture(video(), { status: async (_model, id) => id === "request-1" ? { status: "completed", videoUrl: outputUrls[0] } : { status: "failed", error: "Inference failed" } });
  await f.actions.pollVideosAction();
  const stored = f.records.get("edit-1");
  assert.equal(stored.status, "review"); assert.match(stored.error, /Inference failed/);
  assert.equal(stored.edit.segments[0].requestId, "request-1"); assert.equal(stored.edit.segments[1].requestId, "request-2");
  assert.equal(f.finalizations.length, 0); assert.equal(f.claims.length, 0); assert.equal(f.submissions.length, 0); assert.equal(f.charges.length, 0);
  await f.actions.pollVideosAction();
  assert.equal(f.falReads.length, 2); assert.equal(f.updates.length, 1); assert.equal(f.higgsfieldReads.length, 0);
});

test("transient fal polling errors retain processing and the next poll can complete without generating again", async () => {
  let unavailable = true;
  const f = pollFixture(video(), { status: async (_model, id) => {
    if (unavailable && id === "request-2") throw new Error("Temporary network error");
    return { status: "completed", videoUrl: outputUrls[id === "request-1" ? 0 : 1] };
  } });
  await f.actions.pollVideosAction();
  assert.equal(f.records.get("edit-1").status, "processing"); assert.equal(f.updates.length, 0); assert.equal(f.claims.length, 0);
  unavailable = false;
  await f.actions.pollVideosAction();
  assert.equal(f.records.get("edit-1").status, "completed"); assert.equal(f.finalizations.length, 1);
  assert.equal(f.submissions.length, 0); assert.equal(f.charges.length, 0); assert.equal(f.higgsfieldReads.length, 0);
});

function assemblyFixture(overrides = {}) {
  const item = video(), buffers = [Buffer.from("first edited video"), Buffer.from("second edited video")], joined = Buffer.from("complete edited video");
  const reads = [], joins = [], stores = [], finalizations = [];
  const metadata = new Map([
    [buffers[0], overrides.first ?? item.edit.segments[0].source],
    [buffers[1], overrides.second ?? item.edit.segments[1].source],
    [joined, overrides.joined ?? source],
  ]);
  const actions = load("src/lib/finalize-segmented-edit.ts", {
    "@vercel/blob": { put: async (...args) => { stores.push(args); return { url: "https://media.example/joined.mp4" }; } },
    "./video-media": { readPublicVideo: async url => { reads.push(url); return buffers[outputUrls.indexOf(url)]; } },
    "./video-reference": { mp4Metadata: bytes => { assert.ok(metadata.has(bytes)); return metadata.get(bytes); } },
    "./character-edit": edit,
    "./edit-segments": { joinEditedSegments: async parts => { joins.push(parts); return joined; } },
    "./finalize-edit": { finalizeCharacterEdit: async (...args) => {
      finalizations.push(args);
      return { status: "completed", resultUrl: "https://media.example/final-with-original-audio.mp4", edit: { ...args[0].edit, audioPreserved: true } };
    } },
  });
  return { actions, item, buffers, joined, reads, joins, stores, finalizations };
}

test("the assembler rejects a short or cropped piece before joining or storing any output", async () => {
  for (const second of [{ ...source, duration: 3.97 }, { ...source, duration: 8.657, width: 816, height: 1104 }]) {
    const f = assemblyFixture({ second });
    const result = await f.actions.finalizeSegmentedEdit(f.item, outputUrls);
    assert.equal(result.status, "review"); assert.match(result.error, /Trecho 2/);
    assert.equal(result.resultUrl, undefined); assert.equal(result.edit.segments[1].requestId, "request-2");
    assert.equal(f.joins.length, 0); assert.equal(f.stores.length, 0); assert.equal(f.finalizations.length, 0);
  }
});

test("the assembler refuses missing pieces or a shortened assembled timeline", async () => {
  const missing = assemblyFixture();
  const missingResult = await missing.actions.finalizeSegmentedEdit(missing.item, outputUrls.slice(0, 1));
  assert.equal(missingResult.status, "review"); assert.equal(missing.reads.length, 0); assert.equal(missing.joins.length, 0);
  const short = assemblyFixture({ joined: { ...source, duration: 15 } });
  const shortResult = await short.actions.finalizeSegmentedEdit(short.item, outputUrls);
  assert.equal(shortResult.status, "review"); assert.match(shortResult.error, /Duração divergente/);
  assert.equal(short.joins.length, 1); assert.equal(short.stores.length, 0); assert.equal(short.finalizations.length, 0);
});

test("successful assembly retains order and delegates the complete video to original-audio finalization", async () => {
  const f = assemblyFixture();
  const result = await f.actions.finalizeSegmentedEdit(f.item, outputUrls);
  assert.deepEqual(f.reads, outputUrls); assert.equal(f.joins.length, 1);
  assert.equal(f.joins[0][0], f.buffers[0]); assert.equal(f.joins[0][1], f.buffers[1]);
  assert.equal(f.stores.length, 0, "silent intermediate is passed in memory and never published as the final video");
  assert.equal(f.finalizations.length, 1); assert.equal(f.finalizations[0][0], f.item);
  assert.equal(f.finalizations[0][0].edit.sourceUrl, "https://media.example/original.mp4");
  assert.equal(f.finalizations[0][1], f.joined);
  assert.equal(result.status, "completed"); assert.equal(result.edit.audioPreserved, true);
  assert.equal(result.resultUrl, "https://media.example/final-with-original-audio.mp4");
});
