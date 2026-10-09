import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}, env = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: (id) => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id), process: { env, cwd: () => process.cwd() }, console });
  return module.exports;
}

test("rename persists only the owned influencer's name, preserving images and traits", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mi-details-"));
  try {
    const db = load("src/lib/db.ts", {}, { DATA_DIR: dir });
    const original = await db.createInfluencer({ userId: "owner", name: "Original", tier: "freak", selection: { gender: ["male"] }, imageUrl: "https://example.com/image.jpg", gallery: ["https://example.com/second.jpg"], brief: "Brief", seed: 7, status: "completed" });
    assert.equal(await db.updateInfluencer(original.id, { name: "Wrong owner" }, "other"), undefined);
    await db.updateInfluencer(original.id, { name: "Novo nome" }, "owner");
    const reopened = load("src/lib/db.ts", {}, { DATA_DIR: dir });
    const saved = await reopened.getInfluencer("owner", original.id);
    assert.equal(saved.name, "Novo nome");
    assert.deepEqual(JSON.parse(JSON.stringify({ ...saved, name: "Original" })), JSON.parse(JSON.stringify({ ...original, name: "Original" })));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("rename validates input and sends only a name patch scoped to the authenticated user", async () => {
  const writes = [];
  const actions = load("src/app/actions/influencers.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/influencer-generation": {}, "@/lib/prompt": {}, "@/lib/costs": {},
    "@/lib/auth": { requireUser: async () => ({ id: "owner" }) },
    "@/lib/db": { updateInfluencer: async (...args) => { writes.push(args); return args[0] === "missing" ? undefined : { name: args[1].name }; } },
  });
  assert.ok("error" in await actions.renameInfluencerAction("one", "   "));
  assert.ok("error" in await actions.renameInfluencerAction("one", "x".repeat(81)));
  assert.ok("error" in await actions.renameInfluencerAction("one", null));
  assert.equal(writes.length, 0);
  assert.equal((await actions.renameInfluencerAction("one", "  João  ")).name, "João");
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [["one", { name: "João" }, "owner"]]);
  assert.ok("error" in await actions.renameInfluencerAction("missing", "Nome"));
});

test("a polling update retries after a concurrent rename without losing the new name", async () => {
  let entity = { id: "one", userId: "owner", name: "Original", status: "processing" };
  let writes = 0;
  const sb = { from() {
    let patch;
    const filters = new Map();
    return {
      select() { return this; }, eq(key, value) { filters.set(key, value); return this; }, is(key, value) { filters.set(key, value); return this; },
      update(value) { patch = value.data; return this; },
      async maybeSingle() {
        if (!patch) return { data: { data: structuredClone(entity) }, error: null };
        if (++writes === 1) entity = { ...entity, name: "Nome editado", revision: "concurrent-edit" };
        if (filters.get("data->>revision") !== (entity.revision ?? null)) return { data: null, error: null };
        entity = patch;
        return { data: { data: entity }, error: null };
      },
    };
  } };
  const db = load("src/lib/db.ts", { "@supabase/supabase-js": { createClient: () => sb } }, { SUPABASE_URL: "https://example.com", SUPABASE_KEY: "test" });
  const saved = await db.updateInfluencer("one", { status: "completed", imageUrl: "image.jpg" });
  assert.equal(saved.name, "Nome editado");
  assert.equal(saved.status, "completed");
  assert.equal(writes, 2);
});
