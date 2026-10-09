import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const module = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL("../src/lib/character-edit.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { module, exports: module.exports });
const edit = module.exports;
const source = "https://media.example/original.mp4";
const sheet = "https://media.example/selected-version.png";
const identity = {
  strategy: "sheet-panels",
  frontalUrl: "https://media.example/selected-version-face.png",
  appearanceUrl: "https://media.example/selected-version-body.png",
  wanUrl: "https://media.example/selected-version-body-padded.png",
};
const target = "o homem de casaco preto no centro";
const plain = value => JSON.parse(JSON.stringify(value));
function payload(engine, options, description = target) {
  return plain(edit.buildProviderEditInput(engine, source, sheet, description, 14.83, engine.startsWith("fal-kling") ? "auto" : "720p", 123, options));
}

// Contract: official Kling O3 Pro/Standard video-to-video/edit API.
// https://fal.ai/models/fal-ai/kling-video/o3/pro/video-to-video/edit/api
// https://fal.ai/models/fal-ai/kling-video/o3/standard/video-to-video/edit/api
for (const engine of ["fal-kling-pro", "fal-kling-standard"]) {
  test(`${engine}: separate views bind one identity element instead of competing image references`, () => {
    const input = payload(engine, { identity });
    assert.deepEqual(Object.keys(input).sort(), ["elements", "keep_audio", "prompt", "video_url"]);
    assert.deepEqual(input.elements, [{ frontal_image_url: identity.frontalUrl, reference_image_urls: [identity.appearanceUrl] }]);
    assert.equal(input.video_url, source);
    assert.equal(input.keep_audio, true);
    assert.match(input.prompt, /Edit @Video1/);
    assert.match(input.prompt, /Use @Element1 as the exact facial identity/);
    assert.match(input.prompt, /Use @Element1 for the same character's body/);
    assert.doesNotMatch(input.prompt, /@Image\d/);
    assert.equal(input.image_urls, undefined);
  });

  test(`${engine}: seven-argument callers and unconfirmed sheets retain a single-image fallback`, () => {
    const legacy = payload(engine);
    assert.deepEqual(Object.keys(legacy).sort(), ["image_urls", "keep_audio", "prompt", "video_url"]);
    assert.deepEqual(legacy.image_urls, [sheet]);
    assert.match(legacy.prompt, /Use @Image1 as the exact facial identity/);
    for (const reference of [
      { strategy: "single-image", appearanceUrl: identity.appearanceUrl, frontalUrl: identity.frontalUrl },
      { strategy: "sheet-panels", appearanceUrl: identity.appearanceUrl },
    ]) {
      const input = payload(engine, { identity: reference });
      assert.deepEqual(input.image_urls, [identity.appearanceUrl]);
      assert.equal(input.elements, undefined);
      assert.doesNotMatch(input.prompt, /@Element\d/);
    }
  });
}

test("Higgsfield explicitly maps face and outfit to its supported image array", () => {
  const input = payload("higgsfield", { identity });
  assert.deepEqual(Object.keys(input).sort(), ["image_urls", "prompt", "resolution", "video_url"]);
  assert.deepEqual(input.image_urls, [identity.frontalUrl, identity.appearanceUrl]);
  assert.match(input.prompt, /Use reference image 1 as the exact facial identity/);
  assert.match(input.prompt, /Use reference image 2 for the same character's body/);
  assert.doesNotMatch(input.prompt, /@Element|@Image|@Video/);
  const legacy = payload("higgsfield");
  assert.deepEqual(legacy.image_urls, [sheet]);
  assert.match(legacy.prompt, /Use reference image 1 for the same character's body/);
});

test("Wan uses only its single prepared reference and never sends unsupported prompt/identity parameters", () => {
  // https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace/api
  const input = payload("fal-wan", { identity, continuous: true });
  assert.deepEqual(Object.keys(input).sort(), ["enable_output_safety_checker", "enable_safety_checker", "guidance_scale", "image_url", "num_inference_steps", "resolution", "seed", "use_turbo", "video_quality", "video_url", "video_write_mode"]);
  assert.equal(input.image_url, identity.wanUrl);
  assert.equal(input.video_url, source);
  assert.equal(input.guidance_scale, 1);
  assert.equal(input.num_inference_steps, 20);
  assert.equal(input.use_turbo, false);
  assert.equal(payload("fal-wan", { identity: { ...identity, wanUrl: undefined } }).image_url, identity.appearanceUrl);
  assert.equal(payload("fal-wan").image_url, sheet);
});

test("canonical prompt transfers performance without inheriting source facial geometry or changing scene", () => {
  const canonical = edit.buildCharacterEditPrompt(target, 14.83);
  assert.match(canonical, /exact facial identity: facial proportions, eye shape\/color, nose, mouth, jaw, hairline, skin tone and defining facial hair/);
  assert.match(canonical, /Never blend with or retain the source actor's facial identity/);
  assert.match(canonical, /Transfer source expressions, gaze and mouth motion without transferring source facial geometry/);
  assert.match(canonical, /head turns, profiles, blur and occlusions/);
  assert.match(canonical, /body proportions, clothing, fit, colors and accessories/);
  assert.match(canonical, /Never copy reference backgrounds, poses or framing/);
  assert.match(canonical, /14\.830-second timeline, aspect ratio, composition, cuts, camera motion/);
  assert.match(canonical, /Do not replace any other person/);
  assert.match(canonical, /Preserve the source audio/);
  assert.match(canonical, /not a still image/);
  assert.equal(payload("higgsfield").prompt, canonical);
});

test("all Kling reference modes keep the complete prompt within the 2500-character official limit", () => {
  // JSON escaping can double the target length; continuity must share the budget.
  for (const description of ["a".repeat(500), '"'.repeat(500), "\\".repeat(500), edit.MAIN_CHARACTER_TARGET]) {
    for (const reference of [undefined, identity]) {
      for (const engine of ["fal-kling-pro", "fal-kling-standard"]) {
        const input = payload(engine, { identity: reference, continuous: true }, description);
        assert.ok(input.prompt.length <= 2500, `${engine}: ${input.prompt.length}`);
        assert.ok(input.prompt.includes(JSON.stringify(description)));
        assert.match(input.prompt, /temporally ordered excerpt of the same source video\. Preserve any existing cuts/);
        assert.match(input.prompt, /exact screen position, body scale, distance, identity and outfit at both ends/);
        assert.match(input.prompt, /without a new entrance, pose, framing reset or ending/);
      }
    }
  }
  assert.doesNotMatch(payload("fal-kling-pro").prompt, /temporally ordered excerpt/);
  assert.throws(() => edit.buildCharacterEditPrompt(target, 14.83, "x".repeat(2500)), /limite/);
});

test("targets normalize ordinary whitespace and Unicode without silently truncating or accepting hidden controls", () => {
  assert.equal(edit.normalizeCharacterEditTarget("  homem\tde\ncasaco\r\npreto  "), "homem de casaco preto");
  assert.equal(edit.normalizeCharacterEditTarget("Jose\u0301"), "José");
  assert.equal(edit.normalizeCharacterEditTarget("x".repeat(500)).length, 500);
  for (const invalid of ["", " \t\n", "x".repeat(501), "homem\u0000", "homem\u001b", "homem\u007f", "homem\u0085", "homem\u202e", "homem\u200b", undefined, null, 3]) {
    assert.throws(() => edit.normalizeCharacterEditTarget(invalid));
    for (const engine of ["fal-kling-pro", "fal-kling-standard", "fal-wan", "higgsfield"]) {
      assert.throws(() => edit.buildProviderEditInput(engine, source, sheet, invalid, 14.83, "720p", 123));
    }
  }
  for (const duration of [NaN, Infinity, 0, -1]) assert.throws(() => edit.buildCharacterEditPrompt(target, duration));
});
