import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/publish-center.tsx", import.meta.url), "utf8");
const module = { exports: {} };
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
vm.runInNewContext(code, {
  module, exports: module.exports,
  require(id) {
    if (id === "react" || id === "react/jsx-runtime" || id === "lucide-react") return require(id);
    if (id === "./video-preview" || id === "./instagram-post-insights") return {};
    if (id.startsWith("@/") || id.startsWith("next/") || id.endsWith(".css")) return {};
    throw new Error(`Unexpected dependency: ${id}`);
  },
});
const { isCurrentPublicationSuggestion: current, canApplyPublicationSuggestion: apply } = module.exports;
const sent = { session: 1, request: 2, captionRevision: 3 };

test("an automatic caption can fill an untouched new composer", () => {
  assert.equal(current(sent, { ...sent }), true);
  assert.equal(apply(sent, { ...sent }, false), true);
});

test("typing while preparation runs preserves edits but still permits offering local alternatives", () => {
  const changed = { ...sent, captionRevision: sent.captionRevision + 1 };
  assert.equal(current(sent, changed), true);
  assert.equal(apply(sent, changed, true), false);
  assert.equal(apply(sent, changed, false), false, "Revision mismatch must protect text even if edited state later changes");
});

test("saved draft text, including an empty caption, cannot be overwritten automatically", () => {
  assert.equal(current(sent, { ...sent }), true);
  assert.equal(apply(sent, { ...sent }, true), false);
});

test("a delayed previous video, platform or goal response cannot apply to a newer request", () => {
  const changed = { ...sent, request: sent.request + 1 };
  assert.equal(current(sent, changed), false);
  assert.equal(apply(sent, changed, false), false);
});

test("closing and reopening invalidates the previous composition even when video and text are unchanged", () => {
  const reopened = { ...sent, session: sent.session + 1 };
  assert.equal(current(sent, reopened), false);
  assert.equal(apply(sent, reopened, false), false);
});
