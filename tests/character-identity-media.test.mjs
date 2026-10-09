import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const module = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL('../src/lib/character-identity-media.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
vm.runInNewContext(code, { module, exports: module.exports, require: id => id === 'server-only' ? {} : require(id), Buffer, AbortSignal });
const { prepareCharacterIdentityMedia } = module.exports;
const options = { knownTwoPanelSheet: true, videoWidth: 1080, videoHeight: 1920 };

async function drawing(width, height, rectangles) {
  const pixels = Buffer.alloc(width * height * 3, 255);
  for (const rectangle of rectangles) {
    const { left, top, width: w, height: h, rgb } = rectangle;
    for (let y = top; y < top + h; y++) for (let x = left; x < left + w; x++) {
      const p = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) pixels[p + c] = rgb[c];
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
}
const sheet = () => drawing(1200, 700, [
  { left: 0, top: 0, width: 660, height: 700, rgb: [170, 70, 45] },
  { left: 900, top: 20, width: 220, height: 660, rgb: [35, 55, 135] },
]);
const raw = bytes => sharp(bytes).removeAlpha().raw().toBuffer();
function klingDimensions({ width, height }) {
  assert.ok(width >= 300 && height >= 300);
  assert.ok(width / height >= 0.4 && width / height <= 2.5);
  assert.ok(Math.max(width, height) <= 2048);
}

test('a real off-center gutter separates entire portrait/body panels without deleting any source pixels', async () => {
  const source = await sheet(), out = await prepareCharacterIdentityMedia(source, options);
  assert.equal(out.strategy, 'sheet-panels');
  assert.ok(out.panelSplitX > 720 && out.panelSplitX < 850, 'the actual gap is beyond 60%, not the 50% midpoint');
  assert.ok(out.frontal);
  assert.equal(out.frontalDimensions.width + out.appearanceDimensions.width, 1200);
  const expectedPortrait = await sharp(source).extract({ left: 0, top: 0, width: out.panelSplitX, height: 700 }).raw().toBuffer();
  const expectedBody = await sharp(source).extract({ left: out.panelSplitX, top: 0, width: 1200 - out.panelSplitX, height: 700 }).raw().toBuffer();
  assert.deepEqual(await raw(out.frontal), expectedPortrait);
  assert.deepEqual(await raw(out.appearance), expectedBody);
  klingDimensions(out.frontalDimensions); klingDimensions(out.appearanceDimensions);
  assert.equal(out.wanDimensions.width * 1920, out.wanDimensions.height * 1080);
  const wanPixels = await sharp(out.wan).extract({ left: Math.floor((out.wanDimensions.width - out.appearanceDimensions.width) / 2), top: Math.floor((out.wanDimensions.height - 700) / 2), width: out.appearanceDimensions.width, height: 700 }).raw().toBuffer();
  assert.deepEqual(wanPixels, expectedBody, 'Wan adds padding without stretching or cropping the character');
});

test('arbitrary images never become face elements just because they contain a white vertical gap', async () => {
  const source = await sheet(), out = await prepareCharacterIdentityMedia(source, { ...options, knownTwoPanelSheet: false });
  assert.equal(out.strategy, 'single-image'); assert.equal(out.frontal, undefined); assert.equal(out.panelSplitX, undefined);
  assert.deepEqual(await raw(out.appearance), await raw(source));
});

test('ambiguous layouts, empty panels and absent gutters keep the image whole', async () => {
  const fixtures = [
    await drawing(1000, 600, [{ left: 0, top: 0, width: 1000, height: 600, rgb: [100, 50, 120] }]),
    await drawing(1000, 600, [{ left: 0, top: 0, width: 550, height: 600, rgb: [100, 50, 120] }]),
    await drawing(1200, 600, [
      { left: 0, top: 0, width: 330, height: 600, rgb: [100, 50, 120] },
      { left: 450, top: 0, width: 250, height: 600, rgb: [60, 80, 120] },
      { left: 820, top: 0, width: 300, height: 600, rgb: [40, 120, 70] },
    ]),
    await drawing(1000, 600, [{ left: 150, top: 0, width: 700, height: 600, rgb: [100, 50, 120] }]),
  ];
  for (const source of fixtures) {
    const out = await prepareCharacterIdentityMedia(source, options);
    assert.equal(out.strategy, 'single-image'); assert.equal(out.frontal, undefined);
    assert.deepEqual(await raw(out.appearance), await raw(source));
  }
});

test('minimum dimensions and extreme image ratios are padded instead of cropped or enlarged', async () => {
  for (const [width, height] of [[80, 120], [120, 1800], [1800, 120]]) {
    const source = await drawing(width, height, [{ left: 0, top: 0, width, height, rgb: [30, 80, 160] }]);
    const out = await prepareCharacterIdentityMedia(source, { ...options, knownTwoPanelSheet: false });
    klingDimensions(out.appearanceDimensions);
    const recovered = await sharp(out.appearance).extract({ left: Math.floor((out.appearanceDimensions.width - width) / 2), top: Math.floor((out.appearanceDimensions.height - height) / 2), width, height }).raw().toBuffer();
    assert.deepEqual(recovered, await raw(source));
    assert.equal((await sharp(out.appearance).metadata()).format, 'png');
  }
});

test('large sources fit bounded reference dimensions while preserving their full aspect and all edges', async () => {
  const source = await drawing(5000, 1000, [
    { left: 0, top: 0, width: 20, height: 1000, rgb: [255, 0, 0] },
    { left: 4980, top: 0, width: 20, height: 1000, rgb: [0, 0, 255] },
  ]);
  const out = await prepareCharacterIdentityMedia(source, { ...options, knownTwoPanelSheet: false });
  klingDimensions(out.appearanceDimensions);
  const { data, info } = await sharp(out.appearance).raw().toBuffer({ resolveWithObject: true });
  const middle = Math.floor(info.height / 2), left = (middle * info.width + 1) * 3, right = (middle * info.width + info.width - 2) * 3;
  assert.ok(data[left] > 220 && data[left + 2] < 40, 'left-edge mark retained');
  assert.ok(data[right + 2] > 220 && data[right] < 40, 'right-edge mark retained');
  assert.ok(out.wanDimensions.width * out.wanDimensions.height <= 16_000_000);
});

test('Wan canvases match reduced and coprime source ratios exactly within hard pixel limits', async () => {
  const source = await drawing(400, 600, [{ left: 20, top: 0, width: 360, height: 600, rgb: [90, 50, 10] }]);
  for (const [videoWidth, videoHeight] of [[1920, 1080], [1080, 1920], [1001, 1000], [3840, 2161]]) {
    const out = await prepareCharacterIdentityMedia(source, { ...options, videoWidth, videoHeight, knownTwoPanelSheet: false });
    assert.equal(out.wanDimensions.width * videoHeight, out.wanDimensions.height * videoWidth);
    assert.ok(Math.max(out.wanDimensions.width, out.wanDimensions.height) <= 4096);
    assert.ok(out.wanDimensions.width * out.wanDimensions.height <= 16_000_000);
  }
});

test('EXIF orientation is applied before measuring panels and metadata is stripped', async () => {
  const source = await sharp(await sheet()).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const out = await prepareCharacterIdentityMedia(source, { ...options, knownTwoPanelSheet: false });
  assert.equal(out.sourceDimensions.width, 700); assert.equal(out.sourceDimensions.height, 1200);
  assert.equal((await sharp(out.appearance).metadata()).orientation, undefined);
  assert.equal((await sharp(out.appearance).metadata()).exif, undefined);
});

test('invalid formats, animations, byte/pixel bombs and invalid target ratios fail without provider work', async () => {
  const normal = await sheet();
  const animatedControl = Buffer.alloc(20); animatedControl.writeUInt32BE(8); animatedControl.write('acTL', 4, 'ascii'); animatedControl.writeUInt32BE(2, 8);
  const animatedPng = Buffer.concat([normal.subarray(0, 33), animatedControl, normal.subarray(33)]);
  for (const input of [Buffer.from('<svg width="1000" height="600"></svg>'), Buffer.alloc(25 * 1024 * 1024 + 1), animatedPng, Buffer.alloc(40)]) {
    await assert.rejects(prepareCharacterIdentityMedia(input, options));
  }
  const bomb = await sharp({ create: { width: 6000, height: 6000, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(prepareCharacterIdentityMedia(bomb, options));
  for (const [videoWidth, videoHeight] of [[0, 1920], [1080, -1], [1080.5, 1920], [5000, 1]]) {
    await assert.rejects(prepareCharacterIdentityMedia(normal, { ...options, videoWidth, videoHeight }));
  }
});

test('pre-aborted and mid-processing cancellation return no reference bundle', async () => {
  const source = await sheet();
  const already = new AbortController(); already.abort(new Error('cancelled before decoding'));
  await assert.rejects(prepareCharacterIdentityMedia(source, { ...options, signal: already.signal }), /cancelled before decoding/);
  const active = new AbortController();
  const pending = prepareCharacterIdentityMedia(source, { ...options, signal: active.signal });
  active.abort(new Error('cancelled during decoding'));
  await assert.rejects(pending, /cancelled during decoding/);
});
