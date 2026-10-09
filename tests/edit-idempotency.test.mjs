import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);

test("hiding a completed edit preserves its single-use UUID; pending edits and foreign users cannot delete it", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-idempotency-test-"));
  try {
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require: id => id === "server-only" ? {} : id === "@supabase/supabase-js" ? {} : require(id), process: { env: { DATA_DIR: directory } } });
    const db = module.exports;
    const video = { id: "signed-quote-id", userId: "owner", status: "processing", createdAt: Date.now(), edit: { provider: "fal" } };
    assert.equal(await db.createVideoOnce(video), true);
    assert.equal(await db.deleteVideo("owner", video.id), false);
    assert.equal(await db.deleteVideo("someone-else", video.id), false);
    assert.equal((await db.listVideos("owner")).length, 1);
    const observed = structuredClone(await db.getVideo("owner", video.id));
    assert.equal(await db.updateVideoFromPoll({ ...observed, userId: "someone-else" }, { error: "foreign" }), false);
    assert.equal(await db.claimVideoFinalization(observed), true);
    assert.equal(await db.updateVideoFromPoll(observed, { status: "review", error: "late status response" }), false);
    assert.ok((await db.getVideo("owner", video.id)).finalizationStartedAt);
    await db.updateVideo(video.id, { status: "completed", resultUrl: "https://example.com/final.mp4" });
    assert.equal(await db.updateVideoFromPoll(observed, { status: "processing", resultUrl: "https://example.com/raw.mp4" }), false);
    assert.equal((await db.getVideo("owner", video.id)).resultUrl, "https://example.com/final.mp4");
    const completed = structuredClone(await db.getVideo("owner", video.id));
    assert.equal(await db.deleteVideo("owner", video.id), true);
    assert.equal((await db.listVideos("owner")).length, 0);
    assert.ok((await db.getVideo("owner", video.id)).deletedAt);
    assert.equal(await db.updateVideoFromPoll(completed, { error: "late response after deletion" }), false);
    assert.equal(await db.createVideoOnce(video), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
