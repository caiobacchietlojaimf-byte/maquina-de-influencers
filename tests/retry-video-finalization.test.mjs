import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const videoId = "11111111-1111-4111-8111-111111111111";
const original = { id: videoId, userId: "owner", status: "review", error: "Previous duration mismatch", finalizationStartedAt: 123, edit: {
  sourceUrl: "https://media.example/original.mp4", source: { duration: 29.08, width: 2160, height: 3840, hasAudio: true },
  segments: [{ resultUrl: "https://media.example/part1.mp4" }, { resultUrl: "https://media.example/part2.mp4" }],
} };
function fixture(options = {}) {
  let row = options.video === null ? undefined : structuredClone(options.video ?? original);
  let locked = false;
  const reads = [], claims = [], updates = [], assemblies = [], imports = [];
  const db = {
    getVideo: async (owner, id) => { reads.push([owner, id]); return row?.userId === owner && row?.id === id ? structuredClone(row) : undefined; },
    claimVideoFinalization: async video => { claims.push(video); if (locked || options.locked) return false; locked = true; row.finalizationStartedAt = Date.now(); return true; },
    updateVideo: async (id, patch) => { updates.push([id, patch]); assert.equal(id, videoId); row = { ...row, ...patch }; if (patch.finalizationStartedAt === undefined) locked = false; return structuredClone(row); },
  };
  const finalize = kind => async (...args) => {
    assemblies.push({ kind, args });
    if (options.assembly) return options.assembly(...args);
    if (options.throwAssembly) throw new Error("Temporary media download failure");
    return options.patch ?? { status: "completed", resultUrl: "https://media.example/final.mp4", edit: { ...args[0].edit, audioPreserved: true } };
  };
  const mocks = { "server-only": {}, "./db": db, "./finalize-edit": { finalizeCharacterEdit: finalize("single") }, "./finalize-segmented-edit": { finalizeSegmentedEdit: finalize("segmented") } };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("../src/lib/retry-video-finalization.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(id) {
    imports.push(id);
    assert.ok(Object.hasOwn(mocks, id), `Finalization recovery must not import provider submission or credit debit modules: ${id}`);
    return mocks[id];
  } });
  return { retry: module.exports.retryVideoFinalization, reads, claims, updates, assemblies, imports, row: () => row };
}

test("recovery enforces owner-scoped lookup and hides missing or deleted videos without assembly", async () => {
  for (const [options, user, id] of [[{}, "other-user", videoId], [{ video: null }, "owner", videoId], [{ video: { ...original, deletedAt: 1 } }, "owner", videoId], [{}, "owner", "missing"]]) {
    const f = fixture(options), result = await f.retry(user, id);
    assert.equal(result.status, 404);
    assert.deepEqual(f.reads, [[user, id]]);
    assert.equal(f.claims.length, 0); assert.equal(f.assemblies.length, 0); assert.equal(f.updates.length, 0);
  }
});

test("completed retries are idempotent and do not claim, assemble or modify the existing final video", async () => {
  const f = fixture({ video: { ...original, status: "completed", resultUrl: "https://media.example/final.mp4" } });
  const [a, b] = await Promise.all([f.retry("owner", videoId), f.retry("owner", videoId)]);
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(a.video.resultUrl, b.video.resultUrl);
  assert.equal(f.claims.length, 0); assert.equal(f.assemblies.length, 0); assert.equal(f.updates.length, 0);
});

test("unfinished generation, missing edits and incomplete segment results cannot enter finalization", async () => {
  for (const [video, status] of [
    [{ ...original, status: "processing" }, 409], [{ ...original, status: "queued" }, 409], [{ ...original, edit: undefined }, 409],
    [{ ...original, edit: { ...original.edit, segments: [{ resultUrl: "first" }, {}] } }, 422],
    [{ ...original, edit: { ...original.edit, segments: [] } }, 422],
  ]) {
    const f = fixture({ video }), result = await f.retry("owner", videoId);
    assert.equal(result.status, status); assert.ok(result.error);
    assert.equal(f.claims.length, 0); assert.equal(f.assemblies.length, 0); assert.equal(f.updates.length, 0);
  }
});

test("existing paid segments assemble once; completion clears stale review error and releases the lease", async () => {
  const f = fixture(), result = await f.retry("owner", videoId);
  assert.equal(result.status, 200); assert.equal(result.video.status, "completed");
  assert.equal(result.video.error, undefined); assert.equal(result.video.finalizationStartedAt, undefined);
  assert.equal(result.video.edit.audioPreserved, true);
  assert.equal(f.assemblies.length, 1); assert.equal(f.assemblies[0].kind, "segmented");
  assert.deepEqual(Array.from(f.assemblies[0].args[1]), original.edit.segments.map(part => part.resultUrl));
  assert.equal(f.updates.length, 1);
  assert.ok(f.imports.every(id => ["server-only", "./db", "./finalize-edit", "./finalize-segmented-edit"].includes(id)));
});

test("single results restore audio through single-video finalization without regenerating", async () => {
  const source = "https://media.example/raw-single.mp4";
  const f = fixture({ video: { ...original, resultUrl: source, edit: { ...original.edit, segments: undefined } } });
  assert.equal((await f.retry("owner", videoId)).status, 200);
  assert.equal(f.assemblies[0].kind, "single"); assert.equal(f.assemblies[0].args[1], source);
});

test("a concurrent lease prevents duplicate assembly while the first request is running", async () => {
  let finish;
  const barrier = new Promise(resolve => { finish = resolve; });
  const f = fixture({ assembly: () => barrier });
  const first = f.retry("owner", videoId);
  await new Promise(resolve => setImmediate(resolve));
  const second = await f.retry("owner", videoId);
  assert.equal(second.status, 409); assert.equal(f.assemblies.length, 1);
  finish({ status: "completed", resultUrl: "https://media.example/final.mp4" });
  assert.equal((await first).status, 200);
  assert.equal(f.assemblies.length, 1); assert.equal(f.updates.length, 1);
});

test("a result still needing review returns the persisted video with 422 and preserves all raw results", async () => {
  const f = fixture({ patch: { status: "review", error: "Aspect ratio mismatch", edit: original.edit } });
  const result = await f.retry("owner", videoId);
  assert.equal(result.status, 422); assert.equal(result.video.status, "review");
  assert.equal(result.error, "Aspect ratio mismatch"); assert.equal(result.video.finalizationStartedAt, undefined);
  assert.deepEqual(result.video.edit.segments, original.edit.segments);
});

test("an assembly exception releases its lease and preserves provider results for a later retry", async () => {
  const f = fixture({ throwAssembly: true });
  const result = await f.retry("owner", videoId);
  assert.equal(result.status, 503); assert.match(result.error, /sem gerar outro vídeo/);
  assert.equal(f.row().status, "review"); assert.equal(f.row().finalizationStartedAt, undefined);
  assert.deepEqual(f.row().edit.segments, original.edit.segments);
  await f.retry("owner", videoId);
  assert.equal(f.assemblies.length, 2); assert.equal(f.updates.length, 2);
});
