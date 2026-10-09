import "server-only";

import sharp, { type Sharp } from "sharp";

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_INPUT_PIXELS = 32_000_000;
const MAX_OUTPUT_PIXELS = 16_000_000;
const PREFERRED_EDGE = 2048;
const MAX_OUTPUT_EDGE = 4096;
const MIN_EDGE = 300;
const WHITE = { r: 255, g: 255, b: 255 };

type Dimensions = { width: number; height: number };
export type CharacterIdentityMedia = {
  strategy: "sheet-panels" | "single-image";
  /** Present only when a known sheet has a confidently separated left portrait. */
  frontal?: Buffer;
  appearance: Buffer;
  /** Whole appearance fitted with padding to the exact source-video ratio. */
  wan: Buffer;
  sourceDimensions: Dimensions;
  panelSplitX?: number;
  frontalDimensions?: Dimensions;
  appearanceDimensions: Dimensions;
  wanDimensions: Dimensions;
};
export type CharacterIdentityMediaOptions = {
  /** Must come from trusted owned-record provenance, never an arbitrary image guess. */
  knownTwoPanelSheet: boolean;
  videoWidth: number;
  videoHeight: number;
  signal?: AbortSignal;
};

function invalid(message = "A imagem do influencer não pôde ser preparada. Use uma imagem estática PNG, JPEG ou WebP válida.") {
  return new Error(message);
}

function hasAnimatedPngChunk(bytes: Buffer): boolean {
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) return false; // Decoder rejects truncation.
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === "acTL") return true;
    if (type === "IEND") return false;
    offset += length + 12;
  }
  return false;
}

function assertInput(bytes: Buffer) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 32 || bytes.length > MAX_INPUT_BYTES) throw invalid("A imagem precisa ter até 25 MB.");
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if ((!png && !jpeg && !webp) || (png && hasAnimatedPngChunk(bytes))) throw invalid();
}

function image(bytes: Buffer) {
  return sharp(bytes, { failOn: "warning", limitInputPixels: MAX_INPUT_PIXELS, limitInputChannels: 4, animated: false }).timeout({ seconds: 20 });
}

/** Cancellation stops the caller immediately; libvips also has a bounded CPU deadline. */
async function operation<T>(pipeline: Sharp, execute: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    const interrupted = signal ? new Promise<never>((_resolve, reject) => {
      abort = () => { pipeline.destroy(); reject(signal.reason ?? invalid("Preparação cancelada.")); };
      signal.addEventListener("abort", abort, { once: true });
    }) : undefined;
    signal?.throwIfAborted();
    const pending = execute();
    const result = interrupted ? await Promise.race([pending, interrupted]) : await pending;
    signal?.throwIfAborted();
    return result;
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

async function pngBuffer(pipeline: Sharp, signal?: AbortSignal) {
  const bytes = await operation(pipeline, () => pipeline.png({ compressionLevel: 6 }).toBuffer(), signal);
  if (bytes.length > MAX_INPUT_BYTES) throw invalid("A referência preparada ultrapassa o limite de 25 MB.");
  return bytes;
}

type RawSample = { data: Buffer; info: { width: number; height: number; channels: number } };
/** Finds an actual clean gutter, not a presumed percentage or facial detection. */
function sheetDivider(sample: RawSample, original: Dimensions): number | undefined {
  const { data, info: { width, height, channels } } = sample;
  if (original.width < 600 || original.height < 300 || original.width / original.height < 1.05 || original.width / original.height > 3 || channels !== 3) return;
  const whiteColumns: boolean[] = [], foreground: number[] = [];
  for (let x = 0; x < width; x++) {
    let whites = 0, marked = 0;
    for (let y = 0; y < height; y++) {
      const p = (y * width + x) * channels;
      const low = Math.min(data[p], data[p + 1], data[p + 2]);
      const high = Math.max(data[p], data[p + 1], data[p + 2]);
      if (low >= 244 && high - low <= 12) whites++;
      if (low < 235) marked++;
    }
    whiteColumns.push(whites / height >= 0.985);
    foreground.push(marked);
  }
  const candidates: number[] = [];
  for (let start = 0; start < width;) {
    if (!whiteColumns[start]) { start++; continue; }
    let end = start + 1;
    while (end < width && whiteColumns[end]) end++;
    const split = (start + end) / 2, gap = end - start;
    start = end;
    if (split < width * 0.2 || split > width * 0.8 || gap < Math.max(3, width * 0.008) || gap > width * 0.24) continue;
    const cut = Math.round(split);
    const left = foreground.slice(0, cut).reduce((a, b) => a + b, 0);
    const right = foreground.slice(cut).reduce((a, b) => a + b, 0);
    if (left / (cut * height) < 0.10 || right / ((width - cut) * height) < 0.035) continue;
    // Both views need substantial subject height. A mostly empty panel or a
    // decorative divider is insufficient evidence for producing an identity.
    const rows = [0, 0];
    for (let y = 0; y < height; y++) {
      const counts = [0, 0];
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * channels;
        if (Math.min(data[p], data[p + 1], data[p + 2]) < 235) counts[x < cut ? 0 : 1]++;
      }
      if (counts[0] >= 3) rows[0]++;
      if (counts[1] >= 3) rows[1]++;
    }
    if (rows[0] < height * 0.55 || rows[1] < height * 0.65) continue;
    candidates.push(Math.round(split / width * original.width));
  }
  // Multiple qualifying gutters can be a multi-view sheet. Preserve it whole.
  return candidates.length === 1 ? candidates[0] : undefined;
}

function klingCanvas(dimensions: Dimensions): Dimensions {
  const scale = Math.min(1, PREFERRED_EDGE / Math.max(dimensions.width, dimensions.height));
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  return { width: Math.max(MIN_EDGE, width, Math.ceil(height * 0.4)), height: Math.max(MIN_EDGE, height, Math.ceil(width / 2.5)) };
}

function gcd(a: number, b: number): number {
  while (b) { const next = a % b; a = b; b = next; }
  return a;
}

function wanCanvas(dimensions: Dimensions, videoWidth: number, videoHeight: number): Dimensions {
  if (!Number.isSafeInteger(videoWidth) || !Number.isSafeInteger(videoHeight) || videoWidth <= 0 || videoHeight <= 0 || Math.max(videoWidth, videoHeight) > 16384) throw invalid("A proporção do vídeo é inválida para preparar a referência.");
  const divisor = gcd(videoWidth, videoHeight), x = videoWidth / divisor, y = videoHeight / divisor;
  const minimum = Math.ceil(Math.max(MIN_EDGE / x, MIN_EDGE / y));
  const hardMaximum = Math.floor(Math.min(MAX_OUTPUT_EDGE / Math.max(x, y), Math.sqrt(MAX_OUTPUT_PIXELS / (x * y))));
  if (minimum > hardMaximum) throw invalid("A proporção do vídeo excede o limite seguro das referências.");
  const preferred = Math.floor(PREFERRED_EDGE / Math.max(x, y));
  const fitting = Math.ceil(Math.max(dimensions.width / x, dimensions.height / y));
  const factor = Math.max(minimum, Math.min(fitting, Math.max(minimum, preferred), hardMaximum));
  return { width: x * factor, height: y * factor };
}

/** Contain + white padding only: never crop or stretch the selected character. */
async function padded(bytes: Buffer, canvas: Dimensions, signal?: AbortSignal) {
  if (Math.max(canvas.width, canvas.height) > MAX_OUTPUT_EDGE || canvas.width * canvas.height > MAX_OUTPUT_PIXELS) throw invalid("As dimensões da referência excedem o limite seguro.");
  const pipeline = image(bytes).resize({ width: canvas.width, height: canvas.height, fit: "inside", withoutEnlargement: true });
  const fitted = await operation(pipeline, () => pipeline.png().toBuffer({ resolveWithObject: true }), signal);
  const horizontal = canvas.width - fitted.info.width, vertical = canvas.height - fitted.info.height;
  return pngBuffer(image(fitted.data).extend({ left: Math.floor(horizontal / 2), right: Math.ceil(horizontal / 2), top: Math.floor(vertical / 2), bottom: Math.ceil(vertical / 2), background: WHITE }), signal);
}

/** Pure local image processing. No provider request, generation, upload or database access. */
export async function prepareCharacterIdentityMedia(bytes: Buffer, options: CharacterIdentityMediaOptions): Promise<CharacterIdentityMedia> {
  options.signal?.throwIfAborted();
  assertInput(bytes);
  try {
    const inspector = image(bytes);
    const metadata = await operation(inspector, () => inspector.metadata(), options.signal);
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || !["png", "jpeg", "webp"].includes(metadata.format ?? "") || metadata.width * metadata.height > MAX_INPUT_PIXELS || Math.max(metadata.width, metadata.height) > 16384) throw invalid();
    // Orient once before locating a gutter. Metadata, animation and alpha are
    // removed from provider references; source pixels stay intact in the record.
    const normalizedPipeline = image(bytes).autoOrient().flatten({ background: WHITE }).removeAlpha().toColourspace("srgb");
    const normalized = await operation(normalizedPipeline, () => normalizedPipeline.png().toBuffer({ resolveWithObject: true }), options.signal);
    const dimensions = { width: normalized.info.width, height: normalized.info.height };
    let split: number | undefined;
    if (options.knownTwoPanelSheet === true) {
      const sampler = image(normalized.data).resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).removeAlpha().raw();
      const sample = await operation(sampler, () => sampler.toBuffer({ resolveWithObject: true }), options.signal);
      split = sheetDivider(sample, dimensions);
    }
    let frontalSource: Buffer | undefined, appearanceSource = normalized.data;
    let frontalDimensions: Dimensions | undefined, appearanceSourceDimensions = dimensions;
    if (split && split > 0 && split < dimensions.width) {
      frontalSource = await pngBuffer(image(normalized.data).extract({ left: 0, top: 0, width: split, height: dimensions.height }), options.signal);
      appearanceSource = await pngBuffer(image(normalized.data).extract({ left: split, top: 0, width: dimensions.width - split, height: dimensions.height }), options.signal);
      frontalDimensions = klingCanvas({ width: split, height: dimensions.height });
      appearanceSourceDimensions = { width: dimensions.width - split, height: dimensions.height };
    }
    const appearanceDimensions = klingCanvas(appearanceSourceDimensions);
    const wanDimensions = wanCanvas(appearanceSourceDimensions, options.videoWidth, options.videoHeight);
    const frontal = frontalSource && frontalDimensions ? await padded(frontalSource, frontalDimensions, options.signal) : undefined;
    const appearance = await padded(appearanceSource, appearanceDimensions, options.signal);
    const wan = await padded(appearanceSource, wanDimensions, options.signal);
    options.signal?.throwIfAborted();
    return { strategy: frontal ? "sheet-panels" : "single-image", ...(frontal ? { frontal, frontalDimensions, panelSplitX: split } : {}), appearance, wan, sourceDimensions: dimensions, appearanceDimensions, wanDimensions };
  } catch (error) {
    options.signal?.throwIfAborted();
    if (error instanceof Error && error.message.startsWith("A ")) throw error;
    throw invalid();
  }
}

/** A single full-body studio shot leaves the face at ~5% of the frame, so Kling
 * rebuilt the source actor's face under a pasted moustache and read hair as a
 * beanie. Crop the head into its own view; only on a clean white background
 * with one clearly separated silhouette, otherwise return nothing. */
export async function headCloseUp(bytes: Buffer, signal?: AbortSignal): Promise<Buffer | undefined> {
  assertInput(bytes);
  try {
    const normalizedPipeline = image(bytes).autoOrient().flatten({ background: WHITE }).removeAlpha().toColourspace("srgb");
    const normalized = await operation(normalizedPipeline, () => normalizedPipeline.png().toBuffer({ resolveWithObject: true }), signal);
    const { width, height } = normalized.info;
    if (height < 600 || width / height > 1.05) return;
    const sampler = image(normalized.data).resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).removeAlpha().raw();
    const { data, info } = await operation(sampler, () => sampler.toBuffer({ resolveWithObject: true }), signal);
    const sw = info.width, sh = info.height, ch = info.channels;
    if (ch !== 3) return;
    const ink = (x: number, y: number) => { const p = (y * sw + x) * ch; return Math.min(data[p], data[p + 1], data[p + 2]) < 225; };
    let edge = 0, edgeInk = 0;
    for (let x = 0; x < sw; x++) { edge++; if (ink(x, 0)) edgeInk++; }
    for (let y = 0; y < sh; y++) { edge += 2; if (ink(0, y)) edgeInk++; if (ink(sw - 1, y)) edgeInk++; }
    if (edgeInk / edge > 0.03) return;
    const rowInk = (y: number) => { let n = 0; for (let x = 0; x < sw; x++) if (ink(x, y)) n++; return n; };
    let top = 0; while (top < sh && rowInk(top) < 2) top++;
    let bottom = sh - 1; while (bottom > top && rowInk(bottom) < 2) bottom--;
    const subject = bottom - top;
    if (subject < sh * 0.55) return;
    const band = Math.max(4, Math.round(subject * 0.12));
    let xmin = sw, xmax = -1;
    for (let y = top; y < top + band; y++) for (let x = 0; x < sw; x++) if (ink(x, y)) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); }
    const headWidth = xmax - xmin;
    if (headWidth <= 0 || headWidth > sw * 0.45) return;
    const scale = width / sw;
    const side = Math.round(Math.max(subject * 0.24, headWidth * 1.9) * scale);
    const centerX = (xmin + xmax) / 2 * scale, centerY = (top + subject * 0.1) * scale;
    const left = Math.round(Math.min(Math.max(0, centerX - side / 2), Math.max(0, width - side)));
    const crop = { left, top: Math.max(0, Math.round(centerY - side * 0.45)), width: Math.min(side, width), height: 0 };
    crop.height = Math.min(side, height - crop.top);
    if (crop.width < 120 || crop.height < 120) return;
    return pngBuffer(image(normalized.data).extract(crop).resize({ width: 1024, height: 1024, fit: "contain", background: WHITE, kernel: "lanczos3" }), signal);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof Error && error.message.startsWith("A ")) throw error;
    return;
  }
}
