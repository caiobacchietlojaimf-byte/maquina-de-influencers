import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const NOW = Date.parse("2026-10-09T12:00:00Z");
const URL_A = "https://store.example/finished-a.mp4", URL_B = "https://store.example/finished-b.mp4";
const SLOT = "instagram:comments", IMPROVE_SLOT = "instagram:comments:improve", HASH_A = "a".repeat(64), HASH_B = "b".repeat(64);
const freshVideo = (extra = {}) => ({ id: "video", userId: "owner", kind: "viral", name: "Scene", status: "completed", resultUrl: URL_A, edit: { model: "test" }, createdAt: NOW, ...extra });
const freshUser = (extra = {}) => ({ id: "owner", credits: 3875, createdAt: NOW, ...extra });
const suggestion = (videoId = "video") => ({ videoId, caption: "Qual cena vem depois?", alternatives: [], hashtags: [], keywords: [], goal: "comments", method: "context", generatedAt: NOW, source: { title: "Scene", kind: "video-context" } });
const plain = value => JSON.parse(JSON.stringify(value));
function moduleFor(env, client) {
  const module = { exports: {} };
  class Clock extends Date { static now() { return NOW; } }
  vm.runInNewContext(compiled, { module, exports: module.exports, Buffer, console, Date: Clock,
    process: { env, cwd: () => env.DATA_DIR ?? process.cwd() },
    require: id => id === "server-only" ? {} : id === "@supabase/supabase-js" ? { createClient: () => {
      assert.ok(client, "local tests must not initialize a remote client"); return client;
    } } : require(id),
  });
  return module.exports;
}
function local(t, extra = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-caption-cache-db-"));
  const fixture = { users: [freshUser(extra.user)], videos: [freshVideo(extra.video)], influencers: [], virals: [], socialAccounts: [], posts: [] };
  writeFileSync(path.join(directory, "db.json"), JSON.stringify(fixture));
  t.after(() => {
    const resolved = path.resolve(directory), parent = path.resolve(tmpdir());
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith("mi-caption-cache-db-"));
    rmSync(resolved, { recursive: true, force: true });
  });
  const reopen = () => moduleFor({ DATA_DIR: directory });
  return { db: reopen(), reopen };
}

/** Models database statement-time matching, not a permanently successful update mock. */
function remote(_t, extra = {}) {
  const tables = new Map([
    ["mi_users", [{ id: "owner", data: freshUser(extra.user) }]],
    ["mi_videos", [{ id: "video", user_id: "owner", data: freshVideo(extra.video) }]],
  ]);
  const state = { tables, queries: [], beforeUpdate: undefined };
  const field = (row, key) => key.startsWith("data->>") ? (row.data[key.slice(7)] == null ? null : String(row.data[key.slice(7)])) : row[key];
  function from(table) {
    assert.ok(tables.has(table));
    const query = { table, operation: "select", columns: "*", conditions: [], patch: undefined };
    const result = async single => {
      if (query.operation === "update" && state.beforeUpdate) await state.beforeUpdate(query, tables);
      state.queries.push(plain(query));
      const rows = tables.get(table);
      const matching = rows.filter(row => query.conditions.every(([kind, key, expected]) => kind === "is" ? field(row, key) == null : field(row, key) === expected));
      if (query.operation === "update") for (const row of matching) Object.assign(row, structuredClone(query.patch));
      if (query.operation === "delete") tables.set(table, rows.filter(row => !matching.includes(row)));
      const projected = matching.map(row => query.columns === "id" ? { id: row.id } : { data: structuredClone(row.data) });
      return { data: single ? projected[0] ?? null : projected, error: null };
    };
    const api = {
      select(columns) { query.columns = columns; return api; },
      update(patch) { query.operation = "update"; query.patch = structuredClone(patch); return api; },
      delete() { query.operation = "delete"; return api; },
      eq(key, expected) { query.conditions.push(["eq", key, expected]); return api; },
      is(key, expected) { query.conditions.push(["is", key, expected]); return api; },
      maybeSingle() { return result(true); },
      then(resolve, reject) { return result(false).then(resolve, reject); },
    };
    return api;
  }
  const db = moduleFor({ SUPABASE_URL: "https://database.example", SUPABASE_KEY: "mock-only", MI_DB_SECRET: "mock-only" }, { from });
  return { db, state, reopen: () => moduleFor({ SUPABASE_URL: "https://database.example", SUPABASE_KEY: "mock-only" }, { from }) };
}

for (const [mode, setup] of [["local", local], ["remote CAS", remote]]) {
  test(`${mode}: simultaneous claims reserve one request and survive database reopen`, async t => {
    const f = setup(t);
    const [a, b] = await Promise.all([f.db.claimVideoCaption("owner", "video", SLOT, HASH_A, URL_A), f.db.claimVideoCaption("owner", "video", SLOT, HASH_A, URL_A)]);
    assert.equal([a, b].filter(value => value.claimed).length, 1);
    assert.equal(a.entry.claimId, b.entry.claimId); assert.equal(a.entry.resultUrl, URL_A);
    const reopened = f.reopen();
    assert.equal((await reopened.getVideo("owner", "video")).captionCache[SLOT].claimId, a.entry.claimId);
    assert.equal(await reopened.finishVideoCaption("owner", "video", SLOT, a.entry.claimId, suggestion()), true);
    const again = await f.reopen().claimVideoCaption("owner", "video", SLOT, HASH_A, URL_A);
    assert.equal(again.claimed, false); assert.equal(again.entry.state, "ready");
    assert.equal(again.entry.suggestion.caption, suggestion().caption);
    assert.equal((await f.reopen().findUserById("owner")).credits, 3875);
  });

  test(`${mode}: owner, completed status, deletion and expected media guard all block a claim`, async t => {
    const f = setup(t);
    assert.equal(await f.db.claimVideoCaption("stranger", "video", SLOT, HASH_A, URL_A), undefined);
    assert.equal(await f.db.claimVideoCaption("owner", "video", SLOT, HASH_A, URL_B), undefined);
    assert.equal(Object.keys((await f.db.getVideo("owner", "video")).captionCache ?? {}).length, 0);
    await f.db.updateVideo("video", { status: "processing" });
    assert.equal(await f.db.claimVideoCaption("owner", "video", SLOT, HASH_A, URL_A), undefined);
    await f.db.updateVideo("video", { status: "completed", deletedAt: NOW });
    assert.equal(await f.db.claimVideoCaption("owner", "video", SLOT, HASH_A, URL_A), undefined);
  });

  test(`${mode}: a pending job is not replaced by changed context, and stale finish cannot overwrite it`, async t => {
    const f = setup(t);
    const first = await f.db.claimVideoCaption("owner", "video", SLOT, HASH_A, URL_A);
    const changed = await f.db.claimVideoCaption("owner", "video", SLOT, HASH_B, URL_A);
    assert.equal(changed.claimed, false); assert.equal(changed.entry.claimId, first.entry.claimId);
    assert.equal(await f.db.finishVideoCaption("stranger", "video", SLOT, first.entry.claimId, suggestion()), false);
    assert.equal(await f.db.finishVideoCaption("owner", "video", SLOT, "stale-claim", suggestion()), false);
    assert.equal(await f.db.finishVideoCaption("owner", "video", SLOT, first.entry.claimId, suggestion("other-video")), false);
    assert.equal(await f.db.finishVideoCaption("owner", "video", SLOT, first.entry.claimId, suggestion()), true);
    const next = await f.db.claimVideoCaption("owner", "video", SLOT, HASH_B, URL_A);
    assert.equal(next.claimed, true); assert.notEqual(next.entry.claimId, first.entry.claimId);
    assert.equal(await f.db.finishVideoCaption("owner", "video", SLOT, first.entry.claimId, suggestion()), false);
    assert.equal((await f.db.getVideo("owner", "video")).captionCache[SLOT].claimId, next.entry.claimId);
  });

  test(`${mode}: late caption cannot attach to changed media or resurrect a deleted video`, async t => {
    const f = setup(t);
    const first = await f.db.claimVideoCaption("owner", "video", SLOT, HASH_A, URL_A);
    await f.db.updateVideo("video", { resultUrl: URL_B });
    assert.equal(await f.db.finishVideoCaption("owner", "video", SLOT, first.entry.claimId, suggestion()), false);
    assert.equal((await f.db.getVideo("owner", "video")).resultUrl, URL_B);
    assert.equal(await f.db.deleteVideo("owner", "video"), true);
    assert.equal(await f.db.finishVideoCaption("owner", "video", SLOT, first.entry.claimId, suggestion()), false);
    assert.ok((await f.db.getVideo("owner", "video")).deletedAt);
  });

  test(`${mode}: hourly quota is atomic, resets by time, and never debits credits`, async t => {
    const f = setup(t, { user: { captionRequests: Array(39).fill(NOW - 1000) } });
    const results = await Promise.all([f.db.reserveCaptionRequest("owner", NOW), f.db.reserveCaptionRequest("owner", NOW)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await f.db.findUserById("owner")).captionRequests.length, 40);
    assert.equal(await f.db.reserveCaptionRequest("owner", NOW + 3_600_001), true);
    assert.equal((await f.db.findUserById("owner")).credits, 3875);
  });

  test(`${mode}: daily quota and suspended accounts cannot reserve more caption work`, async t => {
    const f = setup(t, { user: { captionRequests: Array(200).fill(NOW - 3_600_001) } });
    assert.equal(await f.db.reserveCaptionRequest("owner", NOW), false);
    assert.equal(await f.db.reserveCaptionRequest("owner", NOW + 86_400_001), true);
    await f.db.setUserSuspended("owner", true);
    assert.equal(await f.db.reserveCaptionRequest("owner", NOW + 86_400_002), false);
    assert.equal((await f.db.findUserById("owner")).credits, 3875);
  });

  test(`${mode}: improve has a separate fixed slot and changed captions cannot replace a pending request`, async t => {
    const f = setup(t);
    const prepared = await f.db.claimVideoCaption("owner", "video", SLOT, HASH_A, URL_A);
    const first = await f.db.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_A, URL_A);
    assert.equal(prepared.claimed, true); assert.equal(first.claimed, true);
    assert.notEqual(prepared.entry.claimId, first.entry.claimId);
    const changedWhilePending = await f.db.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_B, URL_A);
    assert.equal(changedWhilePending.claimed, false); assert.equal(changedWhilePending.entry.claimId, first.entry.claimId);
    assert.equal(await f.db.finishVideoCaption("owner", "video", IMPROVE_SLOT, first.entry.claimId, suggestion()), true);
    assert.equal((await f.db.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_A, URL_A)).claimed, false);
    const changedAfterReady = await f.db.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_B, URL_A);
    assert.equal(changedAfterReady.claimed, true); assert.notEqual(changedAfterReady.entry.claimId, first.entry.claimId);
    const final = await f.db.getVideo("owner", "video");
    assert.equal(final.captionCache[SLOT].claimId, prepared.entry.claimId);
    assert.equal(Object.keys(final.captionCache).length, 2);
  });

  test(`${mode}: a terminal improve error persists and reopening never reserves the same paid request again`, async t => {
    const f = setup(t);
    const first = await f.db.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_A, URL_A);
    const message = "A melhoria não foi confirmada. Sua legenda atual foi preservada.";
    assert.equal(await f.db.finishVideoCaptionError("owner", "video", IMPROVE_SLOT, first.entry.claimId, message), true);
    const reopened = f.reopen();
    const cached = await reopened.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_A, URL_A);
    assert.equal(cached.claimed, false); assert.equal(cached.entry.state, "ready");
    assert.equal(cached.entry.error, message); assert.equal(cached.entry.suggestion, undefined);
    assert.equal(await reopened.finishVideoCaption("owner", "video", IMPROVE_SLOT, first.entry.claimId, suggestion()), false);
    assert.equal((await reopened.findUserById("owner")).credits, 3875);
  });

  test(`${mode}: only a safe pre-submission retry deadline can reopen a failed improvement`, async t => {
    const entry = { fingerprint: HASH_A, claimId: "quota-claim", state: "ready", startedAt: NOW - 4000, resultUrl: URL_A, error: "Limite de análises", retryAt: NOW + 1000 };
    const f = setup(t, { video: { captionCache: { [IMPROVE_SLOT]: entry } } });
    const beforeDeadline = await f.db.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_A, URL_A);
    assert.equal(beforeDeadline.claimed, false); assert.equal(beforeDeadline.entry.claimId, entry.claimId);
    await f.db.updateVideo("video", { captionCache: { [IMPROVE_SLOT]: { ...entry, retryAt: NOW - 1 } } });
    const afterDeadline = await f.reopen().claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_A, URL_A);
    assert.equal(afterDeadline.claimed, true); assert.notEqual(afterDeadline.entry.claimId, entry.claimId);
    assert.equal(afterDeadline.entry.error, undefined); assert.equal(afterDeadline.entry.retryAt, undefined);
    assert.equal(await f.db.finishVideoCaptionError("owner", "video", IMPROVE_SLOT, entry.claimId, "Late quota failure"), false);
    assert.equal((await f.db.findUserById("owner")).credits, 3875);
  });

  test(`${mode}: replacement media starts a fresh claim and old completion cannot attach to it`, async t => {
    const f = setup(t);
    const old = await f.db.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_A, URL_A);
    await f.db.updateVideo("video", { resultUrl: URL_B });
    const current = await f.db.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_B, URL_B);
    assert.equal(current.claimed, true); assert.notEqual(current.entry.claimId, old.entry.claimId);
    assert.equal(current.entry.resultUrl, URL_B);
    assert.equal(await f.db.finishVideoCaptionError("owner", "video", IMPROVE_SLOT, old.entry.claimId, "Late failure"), false);
    assert.equal(await f.db.finishVideoCaption("owner", "video", IMPROVE_SLOT, old.entry.claimId, suggestion()), false);
    assert.equal(await f.db.finishVideoCaption("owner", "video", IMPROVE_SLOT, current.entry.claimId, suggestion()), true);
  });

  test(`${mode}: terminal errors enforce owner, claim, selected media and deletion guards`, async t => {
    const f = setup(t);
    const first = await f.db.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_A, URL_A);
    assert.equal(await f.db.finishVideoCaptionError("stranger", "video", IMPROVE_SLOT, first.entry.claimId, "Falha"), false);
    assert.equal(await f.db.finishVideoCaptionError("owner", "video", IMPROVE_SLOT, "stale", "Falha"), false);
    await f.db.updateVideo("video", { resultUrl: URL_B });
    assert.equal(await f.db.finishVideoCaptionError("owner", "video", IMPROVE_SLOT, first.entry.claimId, "Falha"), false);
    await f.db.deleteVideo("owner", "video");
    assert.equal(await f.db.finishVideoCaptionError("owner", "video", IMPROVE_SLOT, first.entry.claimId, "Falha"), false);
    const final = await f.db.getVideo("owner", "video");
    assert.ok(final.deletedAt); assert.equal(final.captionCache[IMPROVE_SLOT].error, undefined);
  });

  test(`${mode}: success clears a stale pending error and a late error cannot replace the suggestion`, async t => {
    const entry = { fingerprint: HASH_A, claimId: "existing-claim", state: "pending", startedAt: NOW, resultUrl: URL_A, error: "Old provisional error" };
    const f = setup(t, { video: { captionCache: { [IMPROVE_SLOT]: entry } } });
    assert.equal(await f.db.finishVideoCaption("owner", "video", IMPROVE_SLOT, entry.claimId, suggestion()), true);
    assert.equal(await f.db.finishVideoCaptionError("owner", "video", IMPROVE_SLOT, entry.claimId, "Late error"), false);
    const final = (await f.db.getVideo("owner", "video")).captionCache[IMPROVE_SLOT];
    assert.equal(final.state, "ready"); assert.equal(final.error, undefined); assert.equal(final.suggestion.caption, suggestion().caption);
  });

  test(`${mode}: competing success and failure produce exactly one terminal outcome`, async t => {
    const f = setup(t);
    const first = await f.db.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_A, URL_A);
    const results = await Promise.all([
      f.db.finishVideoCaption("owner", "video", IMPROVE_SLOT, first.entry.claimId, suggestion()),
      f.db.finishVideoCaptionError("owner", "video", IMPROVE_SLOT, first.entry.claimId, "A solicitação falhou."),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    const final = (await f.db.getVideo("owner", "video")).captionCache[IMPROVE_SLOT];
    assert.equal(final.state, "ready"); assert.equal(Boolean(final.error) !== Boolean(final.suggestion), true);
    assert.equal((await f.db.claimVideoCaption("owner", "video", IMPROVE_SLOT, HASH_A, URL_A)).claimed, false);
  });

  test(`${mode}: arbitrary suffixes cannot create unbounded improvement cache slots`, async t => {
    const f = setup(t);
    for (const slot of ["instagram:comments:improve:extra", "instagram:comments:random-request", "instagram:__proto__:improve", "__proto__"]) {
      await assert.rejects(f.db.claimVideoCaption("owner", "video", slot, HASH_A, URL_A));
    }
    assert.equal(Object.keys((await f.db.getVideo("owner", "video")).captionCache ?? {}).length, 0);
  });
}

test("remote CAS rechecks deletion that happens between read and caption mutation", async t => {
  const f = remote(t);
  let changed = false;
  f.state.beforeUpdate = query => {
    if (!changed && query.table === "mi_videos") {
      changed = true;
      Object.assign(f.state.tables.get("mi_videos")[0].data, { deletedAt: NOW, captionRevision: "concurrent-delete" });
    }
  };
  assert.equal(await f.db.claimVideoCaption("owner", "video", SLOT, HASH_A, URL_A), undefined);
  assert.ok(f.state.tables.get("mi_videos")[0].data.deletedAt);
  assert.equal(f.state.tables.get("mi_videos")[0].data.captionCache, undefined);
  const mutation = f.state.queries.find(query => query.operation === "update");
  assert.ok(mutation.conditions.some(([kind, key, value]) => kind === "eq" && key === "user_id" && value === "owner"));
  assert.ok(mutation.conditions.some(([kind, key]) => kind === "is" && key === "data->>deletedAt"));
  assert.ok(mutation.conditions.some(([kind, key, value]) => kind === "eq" && key === "data->>resultUrl" && value === URL_A));
});

test("remote CAS retries preserve an unrelated update and a concurrent caption reservation", async t => {
  const f = remote(t);
  const [claim, updated] = await Promise.all([
    f.db.claimVideoCaption("owner", "video", SLOT, HASH_A, URL_A),
    f.db.updateVideo("video", { name: "Renamed after generation" }),
  ]);
  assert.equal(claim.claimed, true); assert.ok(updated);
  const final = await f.db.getVideo("owner", "video");
  assert.equal(final.name, "Renamed after generation");
  assert.equal(final.captionCache[SLOT].claimId, claim.entry.claimId);
  assert.ok(f.state.queries.filter(query => query.operation === "update").length >= 3, "one contender must retry its stale statement");
});
