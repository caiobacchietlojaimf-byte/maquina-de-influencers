import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id), Buffer, console, URL });
  return module.exports;
}
const versions = load("src/lib/influencer-versions.ts");
const original = { id: "original", userId: "owner", name: "Dante", createdAt: 10, status: "completed", imageUrl: "https://images.example/original.png" };
const outfit = { ...original, id: "outfit", rootInfluencerId: "original", sourceInfluencerId: "original", variantLabel: "Jaqueta vermelha", createdAt: 20, imageUrl: "https://images.example/red-jacket.png" };

test("wardrobe groups under the original without replacing its photo or mutating the input", () => {
  const items = [outfit, { ...outfit, id: "second", createdAt: 30 }, original];
  const before = JSON.stringify(items);
  const groups = versions.groupInfluencerVersions(items);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].root, original);
  assert.equal(groups[0].root.imageUrl, original.imageUrl);
  assert.deepEqual(Array.from(groups[0].versions, v => v.id), ["original", "second", "outfit"]);
  assert.equal(JSON.stringify(items), before);
  assert.equal(versions.influencerVersionLabel(outfit), "Jaqueta vermelha");
  assert.equal(versions.influencerVersionLabel(original), "Original");
});

test("legacy and orphan records stay accessible, deleted records and different owners stay separate", () => {
  const groups = versions.groupInfluencerVersions([original, { ...outfit, deletedAt: 1 }, { ...outfit, id: "orphan", rootInfluencerId: "missing" }, { ...outfit, id: "foreign", userId: "other" }]);
  assert.equal(groups.length, 3);
  assert.equal(groups.flatMap(g => Array.from(g.versions)).length, 3);
  assert.equal(groups.find(g => g.id === "missing").root.id, "orphan");
  assert.equal(groups.find(g => g.root.userId === "owner" && g.id === "original").versions.length, 1);
});

test("video preparation freezes the selected outfit ID and image in its signed quote", async () => {
  const ownedReads = [], receipts = [], preparedIdentities = [];
  const identity = { strategy: "sheet-panels", appearanceUrl: "https://store.public.blob.vercel-storage.com/outfit-body.png", frontalUrl: "https://store.public.blob.vercel-storage.com/outfit-face.png" };
  const prepare = load("src/lib/prepare-character-edit.ts", {
    "@vercel/blob": { put: async () => ({ url: "https://store.public.blob.vercel-storage.com/original.mp4" }) },
    "@/lib/auth": { requireUser: async () => ({ id: "owner" }) },
    "@/lib/db": { getInfluencer: async (owner, id) => { ownedReads.push([owner, id]); return owner === "owner" && id === outfit.id ? outfit : undefined; } },
    "@/data/ai-profiles": {}, "@/lib/ai-discovery": {}, "@/lib/uploaded-reference": {},
    "@/data/motion-presets": { getMotionPreset: () => ({ name: "Original video", drivingVideo: "https://video.example/original.mp4" }) },
    "@/lib/video-media": { publicMediaUrl: url => url, readPublicVideo: async () => Buffer.from("source video") },
    "@/lib/video-reference": { mp4Metadata: () => ({ duration: 10, width: 720, height: 1280, hasAudio: true }) },
    "@/lib/character-edit": { EDIT_ENGINES: { "fal-kling-pro": { provider: "fal" } }, MAIN_CHARACTER_TARGET: "main character", isEditEngine: () => true, normalizeCharacterEditTarget: target => target, buildProviderEditInput: () => ({}), validateProviderEdit: () => null, estimateProviderEdit: () => ({ estimatedUsd: 1 }) },
    "@/lib/edit-quote": { signEditQuote: receipt => { receipts.push(receipt); return "signed"; } },
    "@/lib/platform": {}, "@/lib/fal": { isFalConfigured: () => true },
    "@/lib/finalize-edit": { ensureVideoToolsAvailable: async () => {} }, "@/lib/edit-continuity": {},
    "@/lib/prepare-character-identity": { EDIT_IDENTITY_VERSION: "identity-v1", prepareCharacterIdentity: async (selected, metadata, engine, preparationId, signal) => {
      preparedIdentities.push({ selected, metadata, engine, preparationId, signal });
      assert.equal(selected, outfit);
      assert.equal(selected.imageUrl, outfit.imageUrl);
      return identity;
    } },
    "@/lib/credit-pricing": { usdToCredits: usd => usd * 10, CREDIT_PRICING_VERSION: "test" },
    "@/lib/publication-context": { capturePublicationReference: async () => ({ referenceKind: "preset", keywords: [] }) },
  }).prepareCharacterEdit;
  const input = { influencerId: "outfit", engine: "fal-kling-pro", resolution: "auto", targetMode: "main", source: { kind: "preset", id: "preset" } };
  assert.ok("quote" in await prepare(input));
  assert.deepEqual(ownedReads, [["owner", "outfit"]]);
  assert.equal(receipts[0].influencerId, outfit.id);
  assert.equal(receipts[0].imageUrl, outfit.imageUrl);
  assert.notEqual(receipts[0].imageUrl, original.imageUrl);
  assert.equal(preparedIdentities.length, 1);
  assert.equal(preparedIdentities[0].selected.id, outfit.id);
  assert.equal(preparedIdentities[0].engine, "fal-kling-pro");
  assert.equal(receipts[0].identity, identity);
  assert.ok("error" in await prepare({ ...input, influencerId: "someone-elses-outfit" }));
  assert.equal(receipts.length, 1);
});
