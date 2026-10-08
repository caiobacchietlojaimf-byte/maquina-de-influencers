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

/** Continuous, balanced ranges avoid an unsupported short tail or a silent 15-second crop. */
export function planEditSegments(duration: number): EditSegment[] {
  if (!Number.isFinite(duration) || duration < 3 || duration > 30) {
    throw new Error("O Kling O3 aceita vídeos de 3 a 30 segundos neste fluxo, divididos em até dois trechos de 15 segundos.");
  }
  if (duration <= 15) return [{ start: 0, duration }];
  const midpoint = duration / 2;
  return [{ start: 0, duration: midpoint }, { start: midpoint, duration: duration - midpoint }];
}

async function transcode(args: string[]): Promise<void> {
  try {
    await run(ffmpeg.path, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], {
      timeout: 180000, windowsHide: true, maxBuffer: 2 * 1024 * 1024,
    });
  } catch {
    throw new Error("Não foi possível preparar os trechos do vídeo com segurança. Nenhum trecho foi cortado para caber no modelo.");
  }
}

const encoding = ["-c:v", "libx264", "-preset", "fast", "-crf", "17", "-threads", "2", "-pix_fmt", "yuv420p", "-vsync", "0"];

/** Decode every original frame; adjacent trims never change playback speed. Finalization restores original audio. */
export async function splitEditSource(bytes: Buffer, duration: number): Promise<PreparedEditSegment[]> {
  const plan = planEditSegments(duration);
  const source = mp4Metadata(bytes);
  if (Math.abs(source.duration - duration) > DURATION_TOLERANCE) throw new Error("A duração do vídeo mudou durante a preparação.");
  if (plan.length === 1) return [{ ...plan[0], bytes }];
  const directory = await mkdtemp(path.join(tmpdir(), "mi-edit-segments-"));
  try {
    const input = path.join(directory, "original.mp4");
    await writeFile(input, bytes);
    const segments: PreparedEditSegment[] = [];
    for (const [index, segment] of plan.entries()) {
      const output = path.join(directory, `segment-${index}.mp4`);
      const start = segment.start.toFixed(9), end = (segment.start + segment.duration).toFixed(9);
      // AAC encoder priming can turn a 15s range into a 15.02s container, above the model limit.
      // Send only pictures for segmented jobs; retain the original full audio for final stream-copy.
      const args = ["-i", input, "-map", "0:v:0", "-vf", `trim=start=${start}:end=${end},setpts=PTS-STARTPTS`, "-an", ...encoding];
      args.push("-map_metadata", "-1", "-movflags", "+faststart", "-y", output);
      await transcode(args);
      const prepared = await readFile(output);
      const actual = mp4Metadata(prepared);
      if (actual.duration < 3 || actual.duration > 15 || actual.width !== source.width || actual.height !== source.height || actual.hasAudio) {
        throw new Error("Um trecho não preservou os requisitos de duração, imagem ou áudio. A geração foi interrompida antes do envio.");
      }
      segments.push({ start: segment.start, duration: actual.duration, bytes: prepared });
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
    await transcode([...files.flatMap(file => ["-i", file]), "-filter_complex", filter, "-map", "[outv]", "-an", ...encoding, "-map_metadata", "-1", "-movflags", "+faststart", "-y", output]);
    const assembled = await readFile(output), actual = mp4Metadata(assembled);
    if (actual.width !== first.width || actual.height !== first.height || Math.abs(actual.duration - metadata.reduce((sum, part) => sum + part.duration, 0)) > DURATION_TOLERANCE) {
      throw new Error("A montagem não preservou a duração ou as dimensões dos trechos gerados.");
    }
    return assembled;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
