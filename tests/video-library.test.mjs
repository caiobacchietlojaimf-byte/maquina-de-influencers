import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

/* Regras de exibição da biblioteca Meus vídeos: estados reais, rótulos, duração e filtros. */
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: () => ({}) });
  return module.exports;
}
const lib = load("src/lib/video-library.ts");
const base = (extra = {}) => ({ id: "v", userId: "u", kind: "viral", prompt: "p", status: "completed", createdAt: 1000, resultUrl: "https://media.test/r.mp4", ...extra });

test("real statuses map to the four library groups; cancelled and review are never 'completed'", () => {
  assert.equal(lib.libraryStatus(base({ status: "queued" })), "generating");
  assert.equal(lib.libraryStatus(base({ status: "processing" })), "generating");
  assert.equal(lib.libraryStatus(base({ status: "completed" })), "completed");
  assert.equal(lib.libraryStatus(base({ status: "failed" })), "failed");
  assert.equal(lib.libraryStatus(base({ status: "review" })), "review");
  assert.equal(lib.statusLabel(base({ status: "processing" })), "Gerando");
  assert.equal(lib.statusLabel(base({ status: "processing", finalizationStartedAt: 5 })), "Finalizando");
  assert.equal(lib.statusLabel(base({ status: "review" }), true), "Finalizando");
  assert.equal(lib.statusLabel(base({ status: "completed" })), "Concluído", "generation done is never 'Publicado'");
  assert.equal(lib.statusLabel(base({ status: "review" })), "Precisa de revisão");
  assert.equal(lib.statusLabel(base({ status: "failed" })), "Falhou");
  assert.equal(lib.statusLabel(base({ status: "failed", edit: { cancelledAt: 1 } })), "Cancelado");
});

test("download only for a confirmed complete result; review results open for review instead", () => {
  assert.equal(lib.canDownload(base()), true);
  assert.equal(lib.canDownload(base({ status: "review" })), false);
  assert.equal(lib.canDownload(base({ status: "processing" })), false);
  assert.equal(lib.canDownload(base({ resultUrl: undefined })), false);
  assert.equal(lib.hasReviewResult(base({ status: "review" })), true);
  assert.equal(lib.hasReviewResult(base({ status: "review", resultUrl: "" })), false);
});

test("duration comes only from the real result and renders as mm:ss", () => {
  assert.equal(lib.resultDuration(base()), undefined, "no invented duration for videos without metadata");
  assert.equal(lib.resultDuration(base({ edit: { result: { duration: 15.4 }, source: { duration: 30 } } })), 15.4);
  assert.equal(lib.durationLabel(15.4), "00:15");
  assert.equal(lib.durationLabel(75), "01:15");
  assert.equal(lib.durationLabel(3605), "1:00:05");
});

test("warnings stay visible for failures, review and polling errors", () => {
  assert.equal(lib.videoWarning(base()), undefined);
  assert.equal(lib.videoWarning(base({ status: "failed", error: "Provider said no" })), "Provider said no");
  assert.match(lib.videoWarning(base({ status: "review" })), /revisão/);
  assert.match(lib.videoWarning(base({ status: "failed", edit: { cancelledAt: 1 } })), /cancelada/);
  assert.equal(lib.videoWarning(base({ status: "processing", polling: { checkedAt: 1, failures: 2, error: "timeout" } })), "timeout");
});

test("combined filters, search by title, influencer, kind and sort work together", () => {
  const videos = [
    base({ id: "a", presetName: "Dança no shopping", kind: "motion", influencerId: "inf-1", createdAt: 10 }),
    base({ id: "b", presetName: "Vanish", kind: "viral", influencerId: "inf-2", status: "processing", createdAt: 30 }),
    base({ id: "c", presetName: "Dança na praia", kind: "motion", influencerId: "inf-1", status: "failed", createdAt: 20 }),
    base({ id: "d", presetName: undefined, kind: "custom", edit: { model: "m", source: { duration: 10 } }, status: "review", createdAt: 40 }),
  ];
  const ids = (filters) => JSON.parse(JSON.stringify(lib.filterVideos(videos, { ...lib.DEFAULT_FILTERS, ...filters }).map((video) => video.id)));
  assert.deepEqual(ids({}), ["d", "b", "c", "a"], "newest first by default");
  assert.deepEqual(ids({ sort: "oldest" }), ["a", "c", "b", "d"]);
  assert.deepEqual(ids({ status: "generating" }), ["b"]);
  assert.deepEqual(ids({ status: "review" }), ["d"]);
  assert.deepEqual(ids({ status: "failed" }), ["c"]);
  assert.deepEqual(ids({ query: "dança" }), ["c", "a"]);
  assert.deepEqual(ids({ query: "DANÇA", status: "completed" }), ["a"]);
  assert.deepEqual(ids({ influencerId: "inf-1", kind: "motion", sort: "oldest" }), ["a", "c"]);
  assert.deepEqual(ids({ query: "troca" }), ["d"], "videos without a preset name are searchable by their derived title");
  assert.deepEqual(ids({ query: "nada" }), []);
  assert.deepEqual(JSON.parse(JSON.stringify(lib.countByStatus(videos))), { generating: 1, completed: 1, failed: 1, review: 1 });
  assert.equal(lib.activeFilterCount(lib.DEFAULT_FILTERS), 0);
  assert.equal(lib.activeFilterCount({ ...lib.DEFAULT_FILTERS, query: " x ", kind: "motion" }), 2);
  assert.equal(lib.activeFilterCount({ ...lib.DEFAULT_FILTERS, sort: "oldest" }), 0, "sorting is not a filter");
});
