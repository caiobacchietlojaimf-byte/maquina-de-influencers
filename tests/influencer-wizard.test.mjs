import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url), root = fileURLToPath(new URL("..", import.meta.url));
function loader() {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require(id) {
      if (id.startsWith("./")) return load(path.resolve(path.dirname(file), `${id}.ts`));
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      return require(id);
    }, console }, { filename: file });
    return module.exports;
  }
  return load;
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const load = loader();
const traits = load("src/data/traits.ts");
const types = load("src/data/character-types.ts");
const wizard = load("src/data/influencer-wizard.ts");

test("inventory: the nine character types and eighteen trait groups are intact", () => {
  assert.deepEqual(plain(types.CHARACTER_TYPES.map((t) => t.id)), ["normal", "freak", "total", "insects", "frogs", "cats", "dogs", "capybaras", "birds"]);
  assert.equal(traits.TRAIT_GROUPS.length, 18);
  const optionCount = traits.TRAIT_GROUPS.reduce((sum, group) => sum + group.options.length, 0);
  assert.ok(optionCount >= 150, `expected the full option catalog, found ${optionCount}`);
});

test("every trait group belongs to exactly one wizard step", () => {
  const placed = wizard.WIZARD_STEPS.flatMap((step) => step.groups);
  assert.equal(new Set(placed).size, placed.length, "a group appears in two steps");
  const all = traits.TRAIT_GROUPS.map((group) => group.id);
  assert.deepEqual(plain([...placed].sort()), plain([...all].sort()));
});

test("steps only show groups that exist for the chosen type, without losing options", () => {
  for (const type of types.CHARACTER_TYPES) {
    const shown = wizard.WIZARD_STEPS.flatMap((step) => wizard.stepGroupsFor(step, type.id).map((group) => group.id));
    const expected = traits.groupsFor(type.id).map((group) => group.id);
    assert.deepEqual(plain([...shown].sort()), plain([...expected].sort()), `type ${type.id}`);
    for (const step of wizard.WIZARD_STEPS) {
      for (const group of wizard.stepGroupsFor(step, type.id)) {
        assert.ok(traits.optionsFor(group, type.id).length > 0, `${type.id}/${group.id} has no options`);
      }
    }
  }
  // Animals never see human-only groups such as ethnicity, age or skin tone.
  const animal = wizard.WIZARD_STEPS.flatMap((step) => wizard.stepGroupsFor(step, "cats").map((group) => group.id));
  for (const id of ["ethnicity_origin_base", "age", "skin_tone", "eye_color"]) assert.ok(!animal.includes(id), `${id} shown for cats`);
});

test("random selection and pruning keep working per type", () => {
  for (const type of types.CHARACTER_TYPES) {
    const picked = traits.randomSelection(type.id, () => 0.42);
    assert.deepEqual(plain(traits.pruneSelection(picked, type.id)), plain(picked), `random selection for ${type.id} must survive pruning`);
  }
  const human = traits.randomSelection("normal", () => 0.42);
  const pruned = traits.pruneSelection(human, "frogs");
  assert.ok(!("ethnicity_origin_base" in pruned));
});
