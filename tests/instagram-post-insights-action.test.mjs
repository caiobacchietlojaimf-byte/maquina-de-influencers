import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../src/app/actions/publication-assistant.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(auth) {
  const calls = [], expected = { postId: "post-1", status: "ready", metrics: { likes: 0 }, metricsAvailable: ["likes"], checkedAt: 123, message: "Informado pelo Instagram." };
  const mocks = {
    "@/lib/auth": { requireUser: auth },
    "@/lib/publication-assistant": {},
    "@/lib/instagram-performance": { getInstagramPostInsights: async (...args) => { calls.push(args); return expected; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected import ${name}`);
  } });
  return { action: module.exports.getInstagramPostInsightsAction, calls, expected };
}

test("post insights action takes ownership from the authenticated session", async () => {
  const f = fixture(async () => ({ id: "session-owner" }));
  assert.equal(await f.action("post-1", "forged-owner"), f.expected);
  assert.deepEqual(f.calls, [["session-owner", "post-1"]]);
});

test("post insights action preserves authentication rejection and never calls analytics", async () => {
  const unauthenticated = new Error("NEXT_REDIRECT:login");
  const f = fixture(async () => { throw unauthenticated; });
  await assert.rejects(f.action("post-1"), error => error === unauthenticated);
  assert.equal(f.calls.length, 0);
});
