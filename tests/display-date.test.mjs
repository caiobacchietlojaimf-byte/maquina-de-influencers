import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL("../src/lib/display-date.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require, ...globals });
  return module.exports;
}
const dates = load();

test("display dates use São Paulo at UTC date boundaries, including historical daylight saving", () => {
  const midnightBoundary = Date.parse("2026-10-09T01:30:00.000Z");
  assert.equal(dates.displayDate(midnightBoundary), "08/10/2026");
  assert.equal(dates.displayDate(midnightBoundary, "short"), "08 de out.");
  assert.equal(dates.displayDateTime(midnightBoundary, "long"), "8 de outubro de 2026, 22:30");
  assert.equal(dates.displayDateTime(Date.parse("2026-01-01T02:05:00.000Z")), "31/12/2025, 23:05");
  assert.equal(dates.displayDateTime(Date.parse("2026-10-09T03:00:00.000Z")), "09/10/2026, 00:00");
  assert.equal(dates.displayDateTime(Date.parse("2018-11-05T02:30:00.000Z")), "05/11/2018, 00:30");
});

test("ICU punctuation and literal spacing do not change rendered date text", () => {
  class DifferentIcuPunctuation extends Intl.DateTimeFormat {
    formatToParts(timestamp) {
      return super.formatToParts(timestamp).map(part => part.type === "literal" ? { ...part, value: "\u202f / às " } : part);
    }
    get format() { throw new Error("Display text must not depend on Intl localized punctuation"); }
  }
  const differentIcu = load({ Intl: { DateTimeFormat: DifferentIcuPunctuation } });
  const timestamp = Date.parse("2026-10-09T01:30:00.000Z");
  for (const style of ["numeric", "short", "long"]) {
    assert.equal(differentIcu.displayDate(timestamp, style), dates.displayDate(timestamp, style));
    assert.equal(differentIcu.displayDateTime(timestamp, style), dates.displayDateTime(timestamp, style));
  }
});

test("invalid stored timestamps have a deterministic non-throwing fallback", () => {
  for (const timestamp of [NaN, Infinity, -Infinity, 9e15]) {
    assert.equal(dates.displayDate(timestamp), "Data indisponível");
    assert.equal(dates.displayDateTime(timestamp), "Data indisponível");
  }
});

// Render the actual client components with identical props in separate processes:
// UTC reproduces the production server; São Paulo and Tokyo reproduce browsers.
const worker = String.raw`
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id in mocks ? mocks[id] : require(id) });
  return module.exports;
}
const dates = load("src/lib/display-date.ts");
const plans = load("src/lib/plans.ts");
const creditPacks = load("src/lib/credit-packs.ts", { "./credit-pricing": load("src/lib/credit-pricing.ts") });
const timestamp = Date.parse("2026-10-09T01:30:00.000Z");
const link = ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children);
const { VideosGallery } = load("src/components/videos-gallery.tsx", {
  "next/link": link,
  "@/lib/display-date": dates,
  "@/app/actions/videos": {},
  "@/lib/character-edit": { editModelLabel: () => "Test model" },
  "@/lib/finalize-edit-client": { canFinalizeExistingEdit: () => false },
  "@/components/video-preview": load("src/components/video-preview.tsx", { "./video-preview.module.css": {} }),
  "./videos-gallery.module.css": {},
});
const { BillingCenter } = load("src/components/billing-center.tsx", {
  "next/link": link,
  "next/navigation": { useRouter: () => ({ refresh() {} }) },
  "@/lib/plans": plans,
  "@/lib/credit-packs": creditPacks,
  "@/lib/display-date": dates,
  "@/app/actions/billing": {},
  "./commerce.module.css": {},
});
const videos = renderToStaticMarkup(React.createElement(VideosGallery, { initialVideos: [{ id: "video", kind: "viral", status: "completed", createdAt: timestamp, presetName: "Video", resultUrl: "https://example.test/video.mp4" }] }));
const billing = renderToStaticMarkup(React.createElement(BillingCenter, { name: "Test User", enabled: false, currentPlan: null, orders: [{ id: "order", userId: "user", planId: "pro", amountCents: 19700, credits: 3500, status: "pending", createdAt: timestamp, updatedAt: timestamp }] }));
process.stdout.write(JSON.stringify({ localDay: new Date(timestamp).getDate(), videos, billing, dates: [dates.displayDate(timestamp), dates.displayDateTime(timestamp, "short"), dates.displayDateTime(timestamp, "long")] }));
`;

test("videos and billing render identical initial HTML in server and browser time zones", () => {
  const outputs = ["UTC", "America/Sao_Paulo", "Asia/Tokyo"].map(TZ => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", worker], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, TZ }, encoding: "utf8", timeout: 20_000,
  })));
  assert.equal(outputs[0].localDay, 9);
  assert.equal(outputs[1].localDay, 8, "The regression fixture must exercise different server/browser dates");
  for (const browser of outputs.slice(1)) {
    assert.equal(browser.videos, outputs[0].videos);
    assert.equal(browser.billing, outputs[0].billing);
    assert.deepEqual(browser.dates, outputs[0].dates);
  }
  assert.match(outputs[0].videos, /08 de out\./);
  assert.match(outputs[0].billing, /08\/10\/2026/);
});
