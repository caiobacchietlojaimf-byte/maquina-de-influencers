import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { mp4Metadata, type VideoMetadata } from "./video-reference";

const run = promisify(execFile);
const DURATION_TOLERANCE = 0.15;
export type EditSegment = { start: number; duration: number };
export type PreparedEditSegment = EditSegment & { bytes: Buffer };
export type SplitEditOptions = { signal?: AbortSignal; onProgress?: (completed: number, total: number) => void };
export type JoinEditOptions = { targetDurations?: number[] };

/** Continuous, balanced ranges avoid an unsupported short tail or a silent 15-second crop. */
export function planEditSegments(duration: number): EditSegment[] {
  if (!Number.isFinite(duration) || duration < 3 || duration > 30) {
    throw new Error("O Kling O3 aceita vídeos de 3 a 30 segundos neste fluxo, divididos em até dois trechos de 15 segundos.");
  }
  if (duration <= 15) return [{ start: 0, duration }];
  const midpoint = duration / 2;
  return [{ start: 0, duration: midpoint }, { start: midpoint, duration: duration - midpoint }];
}

async function transcode(args: string[], signal?: AbortSignal, phase: "copy" | "encode" | "join" = "encode"): Promise<void> {
  signal?.throwIfAborted();
  let closed: Promise<void> | undefined;
  try {
    const operation = run(ffmpeg.path, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], {
      timeout: phase === "copy" ? 15000 : 180000, signal, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 2 * 1024 * 1024,
    });
    closed = new Promise(resolve => operation.child.once("close", () => resolve()));
    await operation;
  } catch (error) {
    // Abort may reject before the OS has released output files. Reap the child
    // before the caller removes its temporary directory (especially on Windows).
    await closed;
    signal?.throwIfAborted();
    const failure = error as { code?: unknown; signal?: unknown; killed?: unknown };
    // Deliberately exclude command arguments, stderr, local paths and credentials.
    const log = phase === "copy" ? console.warn : console.error;
    log("video-transcode-failed", { phase, code: typeof failure.code === "string" || typeof failure.code === "number" ? failure.code : null, signal: typeof failure.signal === "string" ? failure.signal : null, killed: failure.killed === true });
    throw new Error("Não foi possível preparar os trechos do vídeo com segurança. Nenhum trecho foi cortado para caber no modelo.");
  }
}

// 4K lookahead/frame-thread buffers exhausted the serverless instance. Keep
// native resolution and CRF while trading compression efficiency for bounded
// memory: two slice threads, one reference and no future-frame buffering.
const encoding = ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-crf", "17", "-threads", "2", "-x264-params", "bframes=0:rc-lookahead=0:sync-lookahead=0:ref=1:sliced-threads=1", "-pix_fmt", "yuv420p", "-vsync", "0"];

async function readPreparedSegments(files: string[], source: VideoMetadata, signal?: AbortSignal): Promise<PreparedEditSegment[]> {
  const segments: PreparedEditSegment[] = [];
  let pictures = 0, frames = 0;
  for (const file of files) {
    const bytes = await readFile(/* turbopackIgnore: true */ file, { signal });
    const actual = mp4Metadata(bytes);
    if (actual.duration < 3 || actual.duration > 15 || actual.width !== source.width || actual.height !== source.height || actual.hasAudio) {
      throw new Error("Um trecho não preservou os requisitos de duração, imagem ou áudio. A geração foi interrompida antes do envio.");
    }
    segments.push({ start: pictures, duration: actual.duration, bytes });
    pictures += actual.videoDuration ?? actual.duration;
    frames += actual.frameCount ?? 0;
  }
  if (Math.abs(segments.reduce((sum, part) => sum + part.duration, 0) - source.duration) > DURATION_TOLERANCE
    || Math.abs(pictures - (source.videoDuration ?? source.duration)) > DURATION_TOLERANCE) {
    throw new Error("Os trechos não preservaram a duração completa do vídeo original.");
  }
  if (source.frameCount && frames !== source.frameCount) throw new Error("Os trechos não preservaram todos os quadros do vídeo original.");
  return segments;
}

/** Prefer lossless keyframe cuts; decode only when two valid lossless ranges cannot cover every original frame. */
export async function splitEditSource(bytes: Buffer, duration: number, options: SplitEditOptions = {}): Promise<PreparedEditSegment[]> {
  options.signal?.throwIfAborted();
  const plan = planEditSegments(duration);
  const source = mp4Metadata(bytes);
  if (Math.abs(source.duration - duration) > DURATION_TOLERANCE) throw new Error("A duração do vídeo mudou durante a preparação.");
  if (plan.length === 1) return [{ ...plan[0], bytes }];
  const directory = await mkdtemp(path.join(tmpdir(), "mi-edit-segments-"));
  try {
    const input = path.join(directory, "original.mp4");
    await writeFile(input, bytes, { signal: options.signal });
    options.onProgress?.(0, plan.length);
    if (source.frameCount && Number.isSafeInteger(source.frameCount)) {
      // The segment muxer moves the cut to the next independently decodable
      // keyframe. Accept it ONLY if both parts stay <=15s and retain every frame.
      // Trying the lower valid boundary also finds keyframes before the midpoint.
      const cuts = [...new Set([plan[1].start, Math.max(3, (source.videoDuration ?? duration) - 15)])];
      const copies = [path.join(directory, "copy-0.mp4"), path.join(directory, "copy-1.mp4")];
      for (const cut of cuts) {
        try {
          await transcode(["-threads", "1", "-i", input, "-map", "0:v:0", "-an", "-c:v", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "segment", "-segment_times", cut.toFixed(9), "-reset_timestamps", "1", "-segment_format", "mp4", "-segment_format_options", "movflags=+faststart", "-y", path.join(directory, "copy-%d.mp4")], options.signal, "copy");
          const copied = await readPreparedSegments(copies, source, options.signal);
          options.onProgress?.(plan.length, plan.length);
          return copied;
        } catch { options.signal?.throwIfAborted(); }
        finally { await Promise.all(copies.map(file => rm(file, { force: true }))); }
      }
    }
    const outputs = plan.map((_, index) => path.join(directory, `segment-${index}.mp4`));
    const filter = `[0:v:0]split=${plan.length}${plan.map((_, index) => `[part${index}]`).join("")};`
      + plan.map((segment, index) => `[part${index}]trim=start=${segment.start.toFixed(9)}:end=${(segment.start + segment.duration).toFixed(9)},setpts=PTS-STARTPTS[out${index}]`).join(";");
    // Decode the original only once. Both branches retain all frames in their
    // adjacent ranges, without cropping/scaling or keyframe-based seeking.
    // Limit decoder and filter concurrency as well as encoder threads for 4K.
    await transcode(["-threads", "1", "-i", input, "-filter_complex_threads", "1", "-filter_complex", filter,
      ...outputs.flatMap((output, index) => ["-map", `[out${index}]`, "-an", ...encoding, "-map_metadata", "-1", "-movflags", "+faststart", "-y", output]),
    ], options.signal);
    const segments = await readPreparedSegments(outputs, source, options.signal);
    options.onProgress?.(plan.length, plan.length);
    return segments;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Only small provider frame-rounding errors may be corrected; missing footage must fail. */
export function validateEditTiming(media: VideoMetadata, target: number): void {
  const pictures = media.videoDuration ?? media.duration;
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(pictures) || pictures <= 0) throw new Error("Duração de montagem inválida.");
  const difference = Math.abs(target - pictures);
  const frameInterval = media.frameCount ? pictures / media.frameCount : undefined;
  if (difference > 0.25 + 1e-6 || difference / pictures > 0.02 + 1e-6 || (frameInterval && difference > 4 * frameInterval + 1e-6)) {
    throw new Error("O trecho não tem imagens suficientes para alinhar a duração com segurança. A diferença não é um pequeno arredondamento de quadros.");
  }
}

/** Identical AVC decoder configuration permits packet concatenation without re-encoding pictures. */
function avcConfiguration(bytes: Buffer): Buffer | undefined {
  try {
    type Box = { type: string; start: number; end: number };
    const boxes = (start: number, end: number): Box[] => {
      const result: Box[] = [];
      for (let offset = start; offset < end;) {
        if (offset + 8 > end) return [];
        let size = bytes.readUInt32BE(offset), header = 8;
        if (size === 1) { if (offset + 16 > end) return []; size = Number(bytes.readBigUInt64BE(offset + 8)); header = 16; }
        if (size === 0) size = end - offset;
        if (!Number.isSafeInteger(size) || size < header || offset + size > end) return [];
        result.push({ type: bytes.toString("ascii", offset + 4, offset + 8), start: offset + header, end: offset + size });
        offset += size;
      }
      return result;
    };
    const child = (parent: Box, type: string) => boxes(parent.start, parent.end).find(box => box.type === type);
    const moov = boxes(0, bytes.length).find(box => box.type === "moov");
    if (!moov) return;
    for (const track of boxes(moov.start, moov.end).filter(box => box.type === "trak")) {
      const mdia = child(track, "mdia"), handler = mdia && child(mdia, "hdlr");
      if (!mdia || !handler || bytes.toString("ascii", handler.start + 8, handler.start + 12) !== "vide") continue;
      const minf = child(mdia, "minf"), stbl = minf && child(minf, "stbl"), stsd = stbl && child(stbl, "stsd");
      if (!stsd || bytes.readUInt32BE(stsd.start + 4) !== 1) return;
      const entry = boxes(stsd.start + 8, stsd.end)[0];
      if (!entry || entry.type !== "avc1" || entry.end - entry.start < 78) return;
      const avc = boxes(entry.start + 78, entry.end).find(box => box.type === "avcC");
      return avc ? bytes.subarray(avc.start, avc.end) : undefined;
    }
  } catch { /* Unsupported sample descriptions use the validated encoder fallback. */ }
}

/** Join every generated picture; align only bounded timing errors and restore audio separately. */
export async function joinEditedSegments(buffers: Buffer[], options: JoinEditOptions = {}): Promise<Buffer> {
  if (!buffers.length || buffers.length > 2) throw new Error("A montagem precisa de um ou dois trechos completos.");
  const metadata = buffers.map(bytes => mp4Metadata(bytes));
  const first = metadata[0];
  if (metadata.some(part => part.width !== first.width || part.height !== first.height)) {
    throw new Error("Os trechos gerados têm dimensões diferentes e precisam de revisão.");
  }
  if (options.targetDurations && options.targetDurations.length !== buffers.length) throw new Error("Quantidade de durações diferente dos trechos.");
  const targets = metadata.map((part, index) => options.targetDurations?.[index] ?? part.videoDuration ?? part.duration);
  metadata.forEach((part, index) => validateEditTiming(part, targets[index]));
  const ratios = metadata.map((part, index) => targets[index] / (part.videoDuration ?? part.duration));
  if (buffers.length === 1 && Math.abs(ratios[0] - 1) < 1e-9) return buffers[0];
  const targetDuration = targets.reduce((sum, duration) => sum + duration, 0);
  const expectedFrames = metadata.every(part => part.frameCount) ? metadata.reduce((sum, part) => sum + part.frameCount!, 0) : undefined;
  const frameTolerance = Math.max(0.002, ...metadata.map(part => part.frameCount ? (part.videoDuration ?? part.duration) / part.frameCount : 0.05));
  function verify(bytes: Buffer): Buffer {
    const actual = mp4Metadata(bytes);
    if (actual.width !== first.width || actual.height !== first.height || actual.hasAudio
      || Math.abs((actual.videoDuration ?? actual.duration) - targetDuration) > frameTolerance + 0.002
      || (expectedFrames && actual.frameCount !== expectedFrames)) throw new Error("A montagem não preservou todos os quadros, a duração ou as dimensões dos trechos gerados.");
    return bytes;
  }
  const directory = await mkdtemp(path.join(tmpdir(), "mi-edit-assembly-"));
  try {
    const files = buffers.map((_, index) => path.join(directory, `part-${index}.mp4`));
    await Promise.all(files.map((file, index) => writeFile(file, buffers[index])));
    const output = path.join(directory, "assembled.mp4");
    const configurations = buffers.map(avcConfiguration);
    if (expectedFrames && configurations[0] && configurations.every(config => config?.equals(configurations[0]!))) {
      const adjusted = files.map((_, index) => path.join(directory, `timed-${index}.mp4`));
      try {
        for (const [index, file] of files.entries()) {
          // Change packet timestamps only. The encoded pictures remain byte-for-byte intact.
          await transcode(["-itsscale", ratios[index].toFixed(12), "-threads", "1", "-i", file, "-map", "0:v:0", "-an", "-c:v", "copy", "-map_metadata", "-1", "-video_track_timescale", "90000", "-movflags", "+faststart", "-y", adjusted[index]], undefined, "copy");
        }
        const manifest = path.join(directory, "parts.ffconcat");
        const escape = (file: string) => file.replace(/\\/g, "/").replace(/'/g, "'\\''");
        await writeFile(manifest, "ffconcat version 1.0\n" + adjusted.map((file, index) => `file '${escape(file)}'\nduration ${targets[index].toFixed(12)}\n`).join(""));
        await transcode(["-f", "concat", "-safe", "0", "-i", manifest, "-map", "0:v:0", "-an", "-c:v", "copy", "-map_metadata", "-1", "-video_track_timescale", "90000", "-movflags", "+faststart", "-y", output], undefined, "copy");
        return verify(await readFile(output));
      } catch { /* Incompatible timestamps fall back to bounded decoding, never to cropping or duplicated frames. */ }
      finally { await Promise.all(adjusted.map(file => rm(file, { force: true }))); }
    }
    // Decode/re-encode also accepts differing encoder headers/time bases from separate provider jobs.
    // The concat filter uses each VIDEO stream's timestamps, avoiding gaps from segment audio padding.
    const filter = files.map((_, index) => `[${index}:v:0]setpts=(PTS-STARTPTS)*${ratios[index].toFixed(12)}[v${index}]`).join(";")
      + ";" + files.map((_, index) => `[v${index}]`).join("") + `concat=n=${files.length}:v=1:a=0[outv]`;
    await transcode([...files.flatMap(file => ["-threads", "1", "-i", file]), "-filter_complex_threads", "1", "-filter_complex", filter, "-map", "[outv]", "-an", ...encoding, "-map_metadata", "-1", "-movflags", "+faststart", "-y", output], undefined, "join");
    return verify(await readFile(output));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
