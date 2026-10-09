import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { validateEditTiming } from "./edit-segments";
import { mp4Metadata, type VideoMetadata } from "./video-reference";

const run = promisify(execFile);
const SAMPLE_SIZE = 64;
const SAMPLE_PIXELS = SAMPLE_SIZE * SAMPLE_SIZE;
const BLEND_FRAMES = 3;
const MAX_SEAM_MAE = 12;
const MAX_CENTER_MAE = 18;
const MAX_INPUT_BYTES = 150 * 1024 * 1024;
const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
const JOB_TIMEOUT_MS = 180_000;
const EPSILON = 1e-6;
type SourceSegment = { start: number; source: VideoMetadata };
type TimelinePart = { startFrame: number; endFrame: number; frames: number; ratio: number };
type Seam = { frame: number; blendFrames: number };

async function transcode(args: string[], deadline: number): Promise<Buffer> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("A montagem contínua atingiu o limite de tempo. Os trechos precisam ser revisados.");
  let closed: Promise<void> | undefined;
  try {
    const operation = run(ffmpeg.path, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], {
      timeout: remaining, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 2 * 1024 * 1024, encoding: "buffer",
    });
    closed = new Promise(resolve => operation.child.once("close", () => resolve()));
    const { stdout } = await operation;
    return stdout;
  } catch {
    // On Windows the rejected process promise may precede release of its files.
    await closed;
    throw new Error("Não foi possível concluir a montagem contínua dos trechos. Os resultados foram preservados para revisão.");
  }
}

function normalize(part: TimelinePart, fps: number): string {
  // A single extra EOF frame covers only sub-frame CFR rounding, never missing
  // footage: validateEditTiming has already bounded any provider duration drift.
  return `setpts=(PTS-STARTPTS)*${part.ratio.toFixed(12)},fps=${fps}:start_time=0:round=near,tpad=stop_mode=clone:stop=1,trim=end_frame=${part.frames},settb=1/${fps},setpts=N`;
}

function inspectPlan(buffers: Buffer[], segments: SourceSegment[]) {
  if (!Array.isArray(buffers) || buffers.length < 1 || buffers.length > 3 || segments.length !== buffers.length) throw new Error("A montagem contínua precisa de um a três trechos completos.");
  if (buffers.some(bytes => !Buffer.isBuffer(bytes) || bytes.length > MAX_INPUT_BYTES) || buffers.reduce((sum, bytes) => sum + bytes.length, 0) > MAX_TOTAL_BYTES) throw new Error("Os arquivos ultrapassam o limite seguro de montagem.");
  const generated = buffers.map(mp4Metadata);
  const first = generated[0];
  if (!Number.isInteger(first.width) || !Number.isInteger(first.height) || first.width < 2 || first.height < 2 || first.width % 2 || first.height % 2
    || Math.max(first.width, first.height) > 3840 || first.width * first.height > 3840 * 2160
    || generated.some(part => part.width !== first.width || part.height !== first.height)) throw new Error("Os trechos gerados têm dimensões incompatíveis para montagem contínua.");
  const nominalFps = first.frameCount ? first.frameCount / (first.videoDuration ?? first.duration) : 30;
  const fps = Math.abs(nominalFps - 24) <= Math.abs(nominalFps - 30) ? 24 : 30;
  const parts: TimelinePart[] = [];
  let previousEnd = 0;
  for (const [index, segment] of segments.entries()) {
    const duration = segment.source.videoDuration ?? segment.source.duration;
    const end = segment.start + duration;
    if (!Number.isFinite(segment.start) || segment.start < 0 || !Number.isFinite(duration) || duration <= 0 || duration > 15 + EPSILON || !Number.isFinite(end) || end > 30 + EPSILON
      || !Number.isFinite(segment.source.width) || !Number.isFinite(segment.source.height) || segment.source.width <= 0 || segment.source.height <= 0
      || Math.abs((first.width / first.height) / (segment.source.width / segment.source.height) - 1) > 0.02) throw new Error("As referências não formam uma linha do tempo válida com as proporções originais.");
    if (index === 0 && Math.abs(segment.start) > EPSILON) throw new Error("A montagem precisa começar no início do vídeo original.");
    if (index > 0) {
      const overlap = previousEnd - segment.start;
      if (segment.start <= segments[index - 1].start || end <= previousEnd || overlap < 0.2 - EPSILON || overlap > 1 + EPSILON) throw new Error("Esta montagem exige sobreposição real de até um segundo; trechos adjacentes não podem usar uma transição contínua.");
      if (index > 1 && segment.start < segments[index - 2].start + (segments[index - 2].source.videoDuration ?? segments[index - 2].source.duration)) throw new Error("As sobreposições dos trechos se cruzam e precisam de revisão.");
    }
    validateEditTiming(generated[index], duration);
    const startFrame = Math.round(segment.start * fps), endFrame = Math.round(end * fps);
    if (endFrame <= startFrame) throw new Error("O trecho não contém quadros suficientes para a montagem.");
    parts.push({ startFrame, endFrame, frames: endFrame - startFrame, ratio: ((endFrame - startFrame) / fps) / (generated[index].videoDuration ?? generated[index].duration) });
    previousEnd = end;
  }
  return { generated, parts, fps, targetDuration: previousEnd };
}

async function sampleOverlap(file: string, part: TimelinePart, startFrame: number, endFrame: number, fps: number, step: number, deadline: number): Promise<Buffer> {
  const filter = `scale=${SAMPLE_SIZE}:${SAMPLE_SIZE}:flags=area,format=gray,${normalize(part, fps)},trim=start_frame=${startFrame - part.startFrame}:end_frame=${endFrame - part.startFrame},setpts=PTS-STARTPTS,select='not(mod(n,${step}))'`;
  return transcode(["-threads", "1", "-i", file, "-filter_threads", "1", "-map", "0:v:0", "-an", "-vf", filter, "-vsync", "0", "-threads", "1", "-f", "rawvideo", "pipe:1"], deadline);
}

async function chooseSeam(leftFile: string, rightFile: string, left: TimelinePart, right: TimelinePart, fps: number, deadline: number): Promise<Seam> {
  const start = right.startFrame, end = left.endFrame;
  if (end - start < BLEND_FRAMES + 1) throw new Error("A sobreposição não tem quadros suficientes para unir os trechos.");
  // Usually 8/10 samples per second. A minimum overlap can quantize to just
  // four frames; inspect those few frames so valid interior centers are not
  // skipped by the sparse sampling grid. Every pair still shares one timestamp.
  const step = end - start < 6 ? 1 : 3;
  const a = await sampleOverlap(leftFile, left, start, end, fps, step, deadline);
  const b = await sampleOverlap(rightFile, right, start, end, fps, step, deadline);
  const count = Math.ceil((end - start) / step);
  if (a.length !== count * SAMPLE_PIXELS || b.length !== a.length) throw new Error("Não foi possível comparar os mesmos instantes na sobreposição dos trechos.");
  let bestStart = -1, bestScore = Infinity, bestCenterScore = Infinity, bestDistance = Infinity;
  const middle = (start + end - BLEND_FRAMES) / 2;
  for (let sample = 0; sample < count; sample++) {
    const globalFrame = start + sample * step;
    const blendStart = globalFrame - Math.floor(BLEND_FRAMES / 2);
    if (blendStart < start || blendStart + BLEND_FRAMES > end) continue;
    let difference = 0, centerDifference = 0, centerPixels = 0;
    const offset = sample * SAMPLE_PIXELS;
    for (let pixel = 0; pixel < SAMPLE_PIXELS; pixel++) {
      const delta = Math.abs(a[offset + pixel] - b[offset + pixel]);
      difference += delta;
      const x = pixel % SAMPLE_SIZE, y = Math.floor(pixel / SAMPLE_SIZE);
      if (x >= 16 && x < 48 && y >= 8 && y < 56) { centerDifference += delta; centerPixels++; }
    }
    // Favor the central subject as well as the whole scene, without attempting
    // identity recognition or matching different moments of the action.
    const score = 0.6 * difference / SAMPLE_PIXELS + 0.4 * centerDifference / centerPixels, distance = Math.abs(blendStart - middle);
    if (score < bestScore - EPSILON || (Math.abs(score - bestScore) <= EPSILON && distance < bestDistance)) {
      bestScore = score; bestCenterScore = centerDifference / centerPixels; bestDistance = distance; bestStart = blendStart;
    }
  }
  if (bestStart < 0) throw new Error("Não há um instante válido para unir os trechos na sobreposição.");
  // Gross visual divergence uses the least-different hard cut: blending two
  // incompatible poses would add ghosting. Neither path certifies fidelity.
  return bestScore > MAX_SEAM_MAE || bestCenterScore > MAX_CENTER_MAE ? { frame: bestStart + 1, blendFrames: 0 } : { frame: bestStart, blendFrames: BLEND_FRAMES };
}

/** Merge overlapping edits on the original timeline. Audio is restored by the finalizer. */
export async function joinContinuousEditSegments(buffers: Buffer[], segments: SourceSegment[]): Promise<Buffer> {
  const { generated, parts, fps, targetDuration } = inspectPlan(buffers, segments);
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  const directory = await mkdtemp(path.join(tmpdir(), "mi-continuous-edit-"));
  try {
    const files = buffers.map((_, index) => path.join(directory, `part-${index}.mp4`));
    for (const [index, file] of files.entries()) await writeFile(file, buffers[index]);
    const seams: Seam[] = [];
    for (let index = 1; index < parts.length; index++) seams.push(await chooseSeam(files[index - 1], files[index], parts[index - 1], parts[index], fps, deadline));
    const filters: string[] = [];
    const pieces: string[] = [];
    const totalFrames = parts.at(-1)!.endFrame;
    parts.forEach((part, index) => {
      const branches = [`[body${index}]`, ...(index > 0 && seams[index - 1].blendFrames ? [`[before${index}]`] : []), ...(index < seams.length && seams[index].blendFrames ? [`[after${index}]`] : [])];
      filters.push(`[${index}:v:0]${normalize(part, fps)},setsar=1,format=yuv420p${branches.length > 1 ? `,split=${branches.length}` : ""}${branches.join("")}`);
      const start = index === 0 ? 0 : seams[index - 1].frame + seams[index - 1].blendFrames;
      const end = index < seams.length ? seams[index].frame : totalFrames;
      if (end <= start) throw new Error("As junções não preservam uma sequência contínua de imagens.");
      filters.push(`[body${index}]trim=start_frame=${start - part.startFrame}:end_frame=${end - part.startFrame},setpts=N/(${fps}*TB)[piece${index}]`);
      pieces.push(`[piece${index}]`);
      if (index < seams.length && seams[index].blendFrames) {
        const seam = seams[index].frame;
        const next = parts[index + 1];
        filters.push(`[after${index}]trim=start_frame=${seam - part.startFrame}:end_frame=${seam + BLEND_FRAMES - part.startFrame},setpts=N/(${fps}*TB)[blendleft${index}]`);
        filters.push(`[before${index + 1}]trim=start_frame=${seam - next.startFrame}:end_frame=${seam + BLEND_FRAMES - next.startFrame},setpts=N/(${fps}*TB)[blendright${index}]`);
        // Use synchronized timestamps instead of blend's N: bundled FFmpeg
        // releases differ in whether their frame counter starts at zero or one.
        filters.push(`[blendleft${index}][blendright${index}]blend=all_expr='A*(1-(T*${fps}+1)/${BLEND_FRAMES + 1})+B*((T*${fps}+1)/${BLEND_FRAMES + 1})':shortest=1:repeatlast=0[seam${index}]`);
        pieces.push(`[seam${index}]`);
      }
    });
    filters.push(`${pieces.join("")}concat=n=${pieces.length}:v=1:a=0,settb=1/${fps},setpts=N[outv]`);
    const output = path.join(directory, "continuous.mp4");
    await transcode([...files.flatMap(file => ["-threads", "1", "-i", file]), "-filter_complex_threads", "1", "-filter_complex", filters.join(";"),
      "-map", "[outv]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-crf", "17", "-threads", "2",
      "-x264-params", "bframes=0:rc-lookahead=0:sync-lookahead=0:ref=1:sliced-threads=1", "-pix_fmt", "yuv420p", "-vsync", "0",
      "-map_metadata", "-1", "-video_track_timescale", "90000", "-movflags", "+faststart", "-y", output,
    ], deadline);
    const bytes = await readFile(output);
    const result = mp4Metadata(bytes);
    if (result.width !== generated[0].width || result.height !== generated[0].height || result.hasAudio || result.frameCount !== totalFrames
      || Math.abs((result.videoDuration ?? result.duration) - targetDuration) > 1 / fps + EPSILON) throw new Error("A montagem contínua não preservou a duração, as dimensões ou a linha do tempo do original.");
    return bytes;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
