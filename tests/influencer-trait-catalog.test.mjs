import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { extractCatalog, validateLocalCatalog, webpMetadata } from "../scripts/sync-influencer-traits.mjs";

const require = createRequire(import.meta.url), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "scripts/influencer-traits.manifest.json"), "utf8"));
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => mocks[id] ?? require(id) });
  return module.exports;
}
const types = load("src/data/character-types.ts");
const media = load("src/data/influencer-trait-media.ts");
const traits = load("src/data/traits.ts", { "./influencer-trait-media": media });
const plain = value => JSON.parse(JSON.stringify(value));

test("every visible option in all nine tiers matches the official API category, slots, exclusivity and maximum", () => {
  assert.equal(types.CHARACTER_TYPES.length, 9);
  assert.equal(traits.TRAIT_GROUPS.length, 18);
  assert.equal(traits.TRAIT_GROUPS.flatMap(group => group.options).length, 182);
  for (const type of types.CHARACTER_TYPES) {
    const expectedCategories = manifest.apiCategories.filter(category => category.tiers.includes(type.id));
    const actualGroups = traits.groupsFor(type.id);
    assert.deepEqual(plain(actualGroups.map(group => group.id).sort()), expectedCategories.map(category => category.key).sort());
    for (const category of expectedCategories) {
      const group = actualGroups.find(group => group.id === category.key);
      assert.equal(group.max, category.max, `${type.id}/${category.key}: max`);
      const expected = category.options.filter(option => !option.tiers || option.tiers.includes(type.id));
      const actual = traits.optionsFor(group, type.id);
      assert.deepEqual(plain(actual.map(option => option.id).sort()), expected.map(option => option.key).sort(), `${type.id}/${category.key}`);
      for (const option of actual) {
        const official = expected.find(expected => expected.key === option.id);
        assert.equal(option.slot ?? null, official.slot, `${type.id}/${option.id}: slot`);
        assert.equal(option.exclusive === true, official.exclusive, `${type.id}/${option.id}: exclusive`);
        assert.ok(option.label && option.en);
      }
    }
  }
  assert.equal(traits.optionsFor(traits.TRAIT_GROUPS.find(group => group.id === "body_type"), "cats").some(option => option.id === "pr_centaur"), false);
  assert.equal(traits.optionsFor(traits.TRAIT_GROUPS.find(group => group.id === "height"), "normal").some(option => option.id === "h_short"), false);
});

test("every available official thumbnail is local, byte-identical, nonempty and has valid dimensions", () => {
  assert.equal(manifest.assets.length, 148);
  const assets = new Map(manifest.assets.map(asset => [asset.id, asset]));
  for (const asset of manifest.assets) {
    assert.ok(["static.higgsfield.ai", "cdn.higgsfield.ai"].includes(new URL(asset.source).hostname));
    assert.equal(asset.local, `/influencer-traits/${asset.id}.webp`);
    const bytes = readFileSync(path.join(root, "public", asset.local));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, asset.id);
    assert.deepEqual(webpMetadata(bytes), { width: asset.width, height: asset.height });
    assert.ok(asset.width >= 32 && asset.height >= 32);
  }
  for (const group of traits.TRAIT_GROUPS) for (const option of group.options) {
    const official = manifest.groups.find(item => item.id === group.id).options.find(item => item.id === option.id);
    assert.equal(option.image ?? null, official.imageUrl ? assets.get(option.id).local : null);
    assert.equal(option.swatch ?? null, official.swatch ?? null);
    if (option.swatch) assert.match(option.swatch, /^#[0-9a-f]{6}$/i);
  }
  for (const type of types.CHARACTER_TYPES) assert.equal(type.icon, assets.get(type.id).local);
});

test("all 148 downloaded thumbnails decode successfully as real images", { timeout: 120_000 }, async () => {
  const ffmpeg = require("@ffmpeg-installer/ffmpeg").path, run = promisify(execFile), queue = [...manifest.assets];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const asset = queue.shift();
      const result = await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1", "-i", path.join(root, "public", asset.local), "-frames:v", "1", "-f", "null", "-"], { timeout: 10_000, windowsHide: true, maxBuffer: 1024 * 1024 });
      assert.equal(result.stderr, "", asset.id);
    }
  }));
});

test("the build gate validates local mappings without network and rejects changed thumbnail hashes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Build validation must never use the network"); };
  try {
    assert.deepEqual(await validateLocalCatalog(manifest), { groups: 18, options: 182, assets: 148 });
    const modified = structuredClone(manifest); modified.assets[0].sha256 = "0".repeat(64);
    await assert.rejects(validateLocalCatalog(modified), /Missing or altered thumbnail/);
  } finally { globalThis.fetch = originalFetch; }
});

test("pruning and randomization cannot create duplicate slots, exclusive accessory conflicts or unsupported tiers", () => {
  assert.deepEqual(plain(traits.pruneSelection({ accessory: ["acc_glasses", "acc_none", "acc_hat"], freak_face: ["ff_nose_0", "ff_nose_1", "ff_nose_0"] }, "total")), { freak_face: ["ff_nose_0"], accessory: ["acc_none"] });
  for (const type of types.CHARACTER_TYPES) {
    for (let seed = 0; seed < 50; seed++) {
      let state = seed + 1;
      const selection = traits.randomSelection(type.id, () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32));
      assert.deepEqual(plain(traits.pruneSelection(selection, type.id)), plain(selection));
      for (const group of traits.groupsFor(type.id)) {
        const chosen = selection[group.id] ?? [], options = chosen.map(id => traits.getOption(group.id, id));
        assert.ok(chosen.length <= group.max);
        if (options.some(option => option.exclusive)) assert.equal(chosen.length, 1);
        const slots = options.map(option => option.slot).filter(Boolean);
        assert.equal(new Set(slots).size, slots.length);
      }
    }
  }
});

test("public bundle discovery accepts data literals and rejects executable expressions", () => {
  const fixture = "P=`https://static.higgsfield.ai/test`;V=[{id:`insects`,imageUrl:`${P}/insect.webp`}];U=[{id:`gender`,kind:`media`,max:1,options:[{id:`female`,imageUrl:`${P}/female.webp`}]}]";
  assert.equal(extractCatalog(fixture).groups[0].options[0].imageUrl, "https://static.higgsfield.ai/test/female.webp");
  assert.throws(() => extractCatalog(fixture.replace("imageUrl:`${P}/female.webp`", "imageUrl:fetch(`https://example.com`)")), /Unsupported catalog literal/);
});
