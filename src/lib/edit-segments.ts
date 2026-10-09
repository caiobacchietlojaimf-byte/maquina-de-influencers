import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { mp4Metadata } from "./video-reference";

const run = promisify(execFile);
const DURATION_TOLERANCE = 0.15;
export type EditSegment = { start: number; duration: number };
export type PreparedEditSegment = EditSegment & { bytes: Buffer };
export type SplitEditOptions = { signal?: AbortSignal; onProgress?: (completed: number, total: number) => void };

/** Continuous, balanced ranges avoid an unsupported short tail or a silent 15-second crop. */
export function planEditSegments(duration: number): EditSegment[] {
  if (!Number.isFinite(duration) || duration < 3 || duration > 30) {
    throw new Error("O Kling O3 aceita vídeos de 3 a 30 segundos neste fluxo, divididos em até dois trechos de 15 segundos.");
  }
  if (duration <= 15) return [{ start: 0, duration }];
  const midpoint = duration / 2;
  return [{ start: 0, duration: midpoint }, { start: midpoint, duration: duration - midpoint }];
}

async function transcode(args: string[], signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  let closed: Promise<void> | undefined;
  try {
    const operation = run(ffmpeg.path, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], {
      timeout: 180000, signal, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 2 * 1024 * 1024,
    });
    closed = new Promise(resolve => operation.child.once("close", () => resolve()));
    await operation;
  } catch {
    // Abort may reject before the OS has released output files. Reap the child
    // before the caller removes its temporary directory (especially on Windows).
    await closed;
    signal?.throwIfAborted();
    throw new Error("Não foi possível preparar os trechos do vídeo com segurança. Nenhum trecho foi cortado para caber no modelo.");
  }
}

// 4K lookahead/frame-thread buffers exhausted the serverless instance. Keep
// native resolution and CRF while trading compression efficiency for bounded
// memory: two slice threads, one reference and no future-frame buffering.
const encoding = ["-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-crf", "17", "-threads", "2", "-x264-params", "bframes=0:rc-lookahead=0:sync-lookahead=0:ref=1:sliced-threads=1", "-pix_fmt", "yuv420p", "-vsync", "0"];

/** Decode every original frame; adjacent trims never change playback speed. Finalization restores original audio. */
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
    const outputs = plan.map((_, index) => path.join(directory, `segment-${index}.mp4`));
    const filter = `[0:v:0]split=${plan.length}${plan.map((_, index) => `[part${index}]`).join("")};`
      + plan.map((segment, index) => `[part${index}]trim=start=${segment.start.toFixed(9)}:end=${(segment.start + segment.duration).toFixed(9)},setpts=PTS-STARTPTS[out${index}]`).join(";");
    // Decode the original only once. Both branches retain all frames in their
    // adjacent ranges, without cropping/scaling or keyframe-based seeking.
    // Limit decoder and filter concurrency as well as encoder threads for 4K.
    options.onProgress?.(0, plan.length);
    await transcode(["-threads", "1", "-i", input, "-filter_complex_threads", "1", "-filter_complex", filter,
      ...outputs.flatMap((output, index) => ["-map", `[out${index}]`, "-an", ...encoding, "-map_metadata", "-1", "-movflags", "+faststart", "-y", output]),
    ], options.signal);
    const segments: PreparedEditSegment[] = [];
    for (const [index, segment] of plan.entries()) {
      // AAC encoder priming can turn a 15s range into a 15.02s container, above the model limit.
      // Send only pictures for segmented jobs; retain the original full audio for final stream-copy.
      // Runtime temporary files must not be traced into the deployment bundle.
      const prepared = await readFile(/* turbopackIgnore: true */ outputs[index], { signal: options.signal });
      const actual = mp4Metadata(prepared);
      if (actual.duration < 3 || actual.duration > 15 || actual.width !== source.width || actual.height !== source.height || actual.hasAudio) {
        throw new Error("Um trecho não preservou os requisitos de duração, imagem ou áudio. A geração foi interrompida antes do envio.");
      }
      segments.push({ start: segment.start, duration: actual.duration, bytes: prepared });
      options.onProgress?.(index + 1, plan.length);
    }
    if (Math.abs(segments.reduce((sum, part) => sum + part.duration, 0) - source.duration) > DURATION_TOLERANCE) {
      throw new Error("Os trechos não preservaram a duração completa do vídeo original.");
    }
    return segments;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Join pictures on their original timeline; finalization restores the single original audio track. */
export async function joinEditedSegments(buffers: Buffer[]): Promise<Buffer> {
  if (!buffers.length || buffers.length > 2) throw new Error("A montagem precisa de um ou dois trechos completos.");
  const metadata = buffers.map(bytes => mp4Metadata(bytes));
  const first = metadata[0];
  if (metadata.some(part => part.width !== first.width || part.height !== first.height)) {
    throw new Error("Os trechos gerados têm dimensões diferentes e precisam de revisão.");
  }
  if (buffers.length === 1) return buffers[0];
  const directory = await mkdtemp(path.join(tmpdir(), "mi-edit-assembly-"));
  try {
    const files = buffers.map((_, index) => path.join(directory, `part-${index}.mp4`));
    await Promise.all(files.map((file, index) => writeFile(file, buffers[index])));
    const output = path.join(directory, "assembled.mp4");
    // Decode/re-encode also accepts differing encoder headers/time bases from separate provider jobs.
    // The concat filter uses each VIDEO stream's timestamps, avoiding gaps from segment audio padding.
    const filter = files.map((_, index) => `[${index}:v:0]setpts=PTS-STARTPTS[v${index}]`).join(";")
      + ";" + files.map((_, index) => `[v${index}]`).join("") + `concat=n=${files.length}:v=1:a=0[outv]`;
    await transcode([...files.flatMap(file => ["-threads", "1", "-i", file]), "-filter_complex_threads", "1", "-filter_complex", filter, "-map", "[outv]", "-an", ...encoding, "-map_metadata", "-1", "-movflags", "+faststart", "-y", output]);
    const assembled = await readFile(output), actual = mp4Metadata(assembled);
    if (actual.width !== first.width || actual.height !== first.height || Math.abs(actual.duration - metadata.reduce((sum, part) => sum + part.duration, 0)) > DURATION_TOLERANCE) {
      throw new Error("A montagem não preservou a duração ou as dimensões dos trechos gerados.");
    }
    return assembled;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
