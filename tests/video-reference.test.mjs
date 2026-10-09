import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id === "server-only" ? {} : id in mocks ? mocks[id] : require(id), process: { env: { AUTH_SECRET: "reference-test-secret" } }, Buffer, URL, AbortSignal, ...globals });
  return module.exports;
}
const media = load("src/lib/video-reference.ts");
const signed = load("src/lib/uploaded-reference.ts");
const edit = load("src/lib/character-edit.ts");
const pathname = "video-references/owner/11111111-1111-1111-1111-111111111111.mp4";

test("MP4 duration comes from the file and rejects renamed non-video files", () => {
  const bytes = readFileSync(new URL("../public/reel-videos/DeBwwYiIO-F.mp4", import.meta.url));
  assert.ok(Math.abs(media.mp4Duration(bytes) - 21.758) < 0.1);
  assert.throws(() => media.mp4Duration(Buffer.from("not a video")));
  assert.throws(() => media.mp4Duration(bytes.subarray(0, 100)));
});
test("upload paths are account-scoped and cannot escape the video folder", () => {
  assert.ok(media.validUploadPath(pathname, "owner"));
  for (const invalid of [pathname.replace("owner", "someone-else"), "video-references/owner/../other.mp4", "https://example.com/video.mp4", null]) assert.equal(media.validUploadPath(invalid, "owner"), false);
});
test("verified upload tokens reject tampering, another owner, and expiration", () => {
  const reference = { kind: "upload", id: pathname, name: "Video", duration: 10, videoUrl: "https://store.public.blob.vercel-storage.com/video.mp4" };
  const token = signed.signUploadedReference(reference, "owner");
  assert.equal(signed.readUploadedReference(token, "owner").videoUrl, reference.videoUrl);
  assert.throws(() => signed.readUploadedReference(token, "other"));
  assert.throws(() => signed.readUploadedReference(token + "x", "owner"));
  const future = load("src/lib/uploaded-reference.ts", {}, { Date: { now: () => Date.now() + 25 * 60 * 60 * 1000 } });
  assert.throws(() => future.readUploadedReference(token, "owner"));
});
test("upload verification checks ownership, size and media before issuing a generation token", async () => {
  let reads = 0;
  const actions = load("src/app/actions/video-reference.ts", {
    "@vercel/blob": { head: async () => { reads++; return { size: media.MAX_REFERENCE_BYTES + 1, contentType: "video/mp4" }; } },
    "@/lib/auth": { requireUser: async () => ({ id: "owner" }) }, "@/lib/character-edit": edit, "@/lib/video-reference": media, "@/lib/uploaded-reference": signed,
  });
  assert.ok("error" in await actions.verifyVideoReferenceAction(pathname.replace("owner", "other"), "Test"));
  assert.equal(reads, 0);
  assert.ok("error" in await actions.verifyVideoReferenceAction(pathname, "Test"));
  assert.equal(reads, 1);
});
test("older upload clients cannot trigger the former paid Kling path", async () => {
  const submits = []; const charges = [];
  const reference = { kind: "upload", id: pathname, name: "My clip", duration: 10, videoUrl: "https://store.public.blob.vercel-storage.com/clip.mp4" };
  const actions = load("src/app/actions/videos.ts", {
    "next/cache": { revalidatePath() {} }, "@/data/motion-presets": { getMotionPreset: () => null }, "@/data/viral-effects": {}, "@/data/video-presets": {}, "@/lib/prompt": {}, "@/lib/costs": { VIDEO_COST: 1000 },
    "@/lib/auth": { requireUser: async () => ({ id: "owner", credits: 5000 }) }, "@/lib/uploaded-reference": signed, "@/lib/finalize-edit": {}, "@/lib/fal": {}, "@/lib/finalize-segmented-edit": {}, "@/lib/reconcile-fal-video": {},
    "@/lib/db": { getInfluencer: async () => ({ id: "chosen", imageUrl: "https://example.com/influencer.jpg" }), adjustCredits: async (...args) => charges.push(args), createVideo: async () => ({ id: "job" }), updateVideo: async () => {} },
    "@/lib/platform": { isConfigured: () => true, submitGeneration: async (...args) => { submits.push(args); return { requestId: "request" }; } },
  });
  assert.ok("error" in await actions.createMotionVideoAction({ influencerId: "chosen", uploadToken: "forged" }));
  assert.equal(charges.length, 0);
  const result = await actions.createMotionVideoAction({ influencerId: "chosen", uploadToken: signed.signUploadedReference(reference, "owner") });
  assert.ok("error" in result);
  assert.equal(submits.length, 0);
  assert.equal(charges.length, 0);
});

test("a playable uploaded MP4 receives an owner-bound token while corrupt media is rejected", async () => {
  let bytes = readFileSync(new URL("../public/reel-videos/DeBwwYiIO-F.mp4", import.meta.url));
  const actions = load("src/app/actions/video-reference.ts", {
    "@vercel/blob": { head: async () => ({ size: bytes.length, contentType: "video/mp4", url: "https://store.public.blob.vercel-storage.com/clip.mp4" }) },
    "@/lib/auth": { requireUser: async () => ({ id: "owner" }) },
    "@/lib/character-edit": edit,
    "@/lib/video-reference": media, "@/lib/uploaded-reference": signed,
  }, { fetch: async () => ({ ok: true, arrayBuffer: async () => Uint8Array.from(bytes).buffer }) });
  const result = await actions.verifyVideoReferenceAction(pathname, " My clip.mp4 ");
  assert.equal(result.reference.name, "My clip.mp4");
  assert.ok(result.reference.duration > 21 && result.reference.duration < 22);
  assert.equal(signed.readUploadedReference(result.reference.token, "owner").id, pathname);
  bytes = Buffer.from("renamed fake video");
  assert.ok("error" in await actions.verifyVideoReferenceAction(pathname, "Fake.mp4"));
});
