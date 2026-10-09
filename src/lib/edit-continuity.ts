import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { mp4Metadata, type VideoMetadata } from "./video-reference";
import type { EditSegment, PreparedEditSegment, SplitEditOptions } from "./edit-segments";

const run = promisify(execFile);
const OVERLAP = 0.5;
const MAX_DURATION = 15;

/** The shared time is context for both jobs; assembly must remove its duplicate. */
export function planContinuousSegments(pictureDuration: number): EditSegment[] {
  if (!Number.isFinite(pictureDuration) || pictureDuration < 3 || pictureDuration > 30) {
    throw new Error("A edição contínua aceita de 3 a 30 segundos de imagens.");
  }
  if (pictureDuration <= MAX_DURATION) return [{ start: 0, duration: pictureDuration }];
  const count = pictureDuration + OVERLAP <= MAX_DURATION * 2 ? 2 : 3;
  const duration = (pictureDuration + OVERLAP * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => {
    const start = index * (duration - OVERLAP);
    return { start, duration: index === count - 1 ? pictureDuration - start : duration };
  });
}

type Box = { type: string; start: number; end: number };
type PictureTimeline = { times: number[]; tick: number; keyframes: number[] };

function mp4Boxes(bytes: Buffer, start: number, end: number): Box[] {
  const result: Box[] = [];
  for (let offset = start; offset < end;) {
    if (offset + 8 > end) throw new Error("Caixa MP4 incompleta.");
    let size = bytes.readUInt32BE(offset), header = 8;
    if (size === 1) { if (offset + 16 > end) throw new Error("Caixa MP4 incompleta."); size = Number(bytes.readBigUInt64BE(offset + 8)); header = 16; }
    if (!size) size = end - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > end) throw new Error("Caixa MP4 inválida.");
    result.push({ type: bytes.toString("ascii", offset + 4, offset + 8), start: offset + header, end: offset + size });
    offset += size;
  }
  return result;
}

/** Decode-time + composition offsets give presentation times, including VFR/B-frames. */
function pictureTimeline(bytes: Buffer, source: VideoMetadata): PictureTimeline {
  const count = source.frameCount;
  if (!count || !Number.isSafeInteger(count) || count > 100_000 || !source.videoDuration) {
    throw new Error("Não foi possível conferir a linha do tempo dos quadros. Envie um MP4 não fragmentado.");
  }
  const invalid = () => new Error("A linha do tempo dos quadros do MP4 está incompleta ou não é compatível com a edição contínua.");
  const boxes = (start: number, end: number) => mp4Boxes(bytes, start, end);
  const child = (parent: Box, type: string) => boxes(parent.start, parent.end).find(box => box.type === type);
  const moov = boxes(0, bytes.length).find(box => box.type === "moov");
  if (!moov) throw invalid();
  for (const track of boxes(moov.start, moov.end).filter(box => box.type === "trak")) {
    const mdia = child(track, "mdia"), handler = mdia && child(mdia, "hdlr");
    if (!mdia || !handler || handler.end - handler.start < 12 || bytes.toString("ascii", handler.start + 8, handler.start + 12) !== "vide") continue;
    const mdhd = child(mdia, "mdhd"), minf = child(mdia, "minf"), stbl = minf && child(minf, "stbl");
    const stts = stbl && child(stbl, "stts"), ctts = stbl && child(stbl, "ctts"), stss = stbl && child(stbl, "stss");
    if (!mdhd || !stts || mdhd.end - mdhd.start < (bytes[mdhd.start] === 1 ? 36 : 24)) throw invalid();
    const scale = bytes.readUInt32BE(mdhd.start + (bytes[mdhd.start] === 1 ? 20 : 12));
    if (!scale) throw invalid();
    const durations: number[] = [], offsets: number[] = [];
    const expand = (box: Box, into: number[], signed: boolean) => {
      if (box.end - box.start < 8 || ![0, 1].includes(bytes[box.start])) throw invalid();
      const entries = bytes.readUInt32BE(box.start + 4);
      if (entries * 8 > box.end - box.start - 8) throw invalid();
      for (let index = 0; index < entries; index++) {
        const position = box.start + 8 + index * 8, samples = bytes.readUInt32BE(position);
        const value = signed ? bytes.readInt32BE(position + 4) : bytes.readUInt32BE(position + 4);
        if (!samples || into.length + samples > count) throw invalid();
        for (let sample = 0; sample < samples; sample++) into.push(value);
      }
      if (into.length !== count) throw invalid();
    };
    expand(stts, durations, false);
    if (ctts) expand(ctts, offsets, bytes[ctts.start] === 1);
    if (durations.some(duration => duration <= 0)) throw invalid();
    const syncSamples = new Set<number>();
    if (stss) {
      if (stss.end - stss.start < 8) throw invalid();
      const entries = bytes.readUInt32BE(stss.start + 4);
      if (entries * 4 > stss.end - stss.start - 8) throw invalid();
      for (let index = 0; index < entries; index++) syncSamples.add(bytes.readUInt32BE(stss.start + 8 + index * 4) - 1);
    }
    let decodeTime = 0;
    const frames = durations.map((duration, index) => {
      const frame = { start: decodeTime + (offsets[index] ?? 0), duration, sync: !stss || syncSamples.has(index) };
      decodeTime += duration;
      return frame;
    }).sort((a, b) => a.start - b.start);
    const first = frames[0].start;
    const times = frames.map(frame => (frame.start - first) / scale);
    const end = (frames.at(-1)!.start - first + frames.at(-1)!.duration) / scale;
    if (times.some((time, index) => !Number.isFinite(time) || (index > 0 && time <= times[index - 1]))
      || Math.abs(end - source.videoDuration) > Math.max(0.002, 2 / scale)) throw invalid();
    times.push(source.videoDuration);
    return { times, tick: 1 / scale, keyframes: frames.flatMap((frame, index) => frame.sync ? [index] : []) };
  }
  throw invalid();
}

type FrameRange = { first: number; end: number; start: number; duration: number };
function frameRanges(timeline: PictureTimeline, plan: EditSegment[]): FrameRange[] {
  const { times } = timeline, count = times.length - 1;
  const closest = (time: number) => times.reduce((best, value, index) => Math.abs(value - time) < Math.abs(times[best] - time) ? index : best, 0);
  const ranges = plan.map((part, index) => {
    let first = index === 0 ? 0 : closest(part.start);
    let end = index === plan.length - 1 ? count : closest(part.start + part.duration);
    if (index === plan.length - 1) {
      while (first < end && times[end] - times[first] > MAX_DURATION + 1e-9) first++;
    } else {
      while (end > first && times[end] - times[first] > MAX_DURATION + 1e-9) end--;
    }
    return { first, end, start: times[first], duration: times[end] - times[first] };
  });
  if (ranges.some((range, index) => range.duration < 3 || range.duration > MAX_DURATION + 1e-9 || range.end <= range.first
    || (index > 0 && (range.first >= ranges[index - 1].end || range.first <= ranges[index - 1].first)))
    || ranges[0].first !== 0 || ranges.at(-1)!.end !== count) {
    throw new Error("Não foi possível dividir esse vídeo em trechos sobrepostos sem perder quadros. Envie outra versão do original.");
  }
  return ranges;
}

/** Seek only to a real sync sample. The half-second context can end between keyframes. */
function copyRanges(timeline: PictureTimeline, plan: EditSegment[]): FrameRange[] | undefined {
  const { times, keyframes } = timeline, count = times.length - 1;
  if (!keyframes.includes(0)) return;
  const starts = [0];
  for (let index = 1; index < plan.length; index++) {
    const candidates = keyframes.filter(frame => frame > starts[index - 1]
      && times[frame] - times[starts[index - 1]] >= 2.5
      && times[frame] - times[starts[index - 1]] <= 14.8
      && (index !== plan.length - 1 || times[count] - times[frame] <= 15));
    candidates.sort((a, b) => Math.abs(times[a] - plan[index].start) - Math.abs(times[b] - plan[index].start));
    if (!candidates.length) return;
    starts.push(candidates[0]);
  }
  const ranges = starts.map((first, index) => {
    const target = index === starts.length - 1 ? times[count] : times[starts[index + 1]] + OVERLAP;
    let end = times.reduce((best, time, frame) => Math.abs(time - target) < Math.abs(times[best] - target) ? frame : best, 0);
    while (end > first && times[end] - times[first] > 15) end--;
    return { first, end, start: times[first], duration: times[end] - times[first] };
  });
  if (ranges.some((range, index) => range.duration < 3 || range.duration > 15 || (index > 0
    && (times[ranges[index - 1].end] - range.start < 0.2 || times[ranges[index - 1].end] - range.start > 1)))) return;
  return ranges;
}

/** Older FFmpeg writes a zero-length final sample with an explicit encoder timebase.
 * Repair that one duration in-place; no picture, PTS, sample count or box size changes. */
function repairFinalSample(bytes: Buffer, duration: number, finalFrameDuration: number): Buffer {
  const child = (parent: Box, type: string) => mp4Boxes(bytes, parent.start, parent.end).find(box => box.type === type);
  const moov = mp4Boxes(bytes, 0, bytes.length).find(box => box.type === "moov");
  if (!moov) return bytes;
  const mvhd = child(moov, "mvhd"), track = child(moov, "trak"), tkhd = track && child(track, "tkhd"), mdia = track && child(track, "mdia");
  const mdhd = mdia && child(mdia, "mdhd"), minf = mdia && child(mdia, "minf"), stbl = minf && child(minf, "stbl");
  const stts = stbl && child(stbl, "stts"), edts = track && child(track, "edts"), elst = edts && child(edts, "elst");
  if (!mvhd || !tkhd || !mdhd || !stts || stts.end - stts.start < 16) return bytes;
  const entries = bytes.readUInt32BE(stts.start + 4), last = stts.start + 8 + (entries - 1) * 8;
  if (!entries || last + 8 > stts.end || bytes.readUInt32BE(last) !== 1 || bytes.readUInt32BE(last + 4) !== 0) return bytes;
  const scale = bytes.readUInt32BE(mdhd.start + (bytes[mdhd.start] === 1 ? 20 : 12));
  const movieScale = bytes.readUInt32BE(mvhd.start + (bytes[mvhd.start] === 1 ? 20 : 12));
  const finalTicks = Math.round(finalFrameDuration * scale), ticks = Math.round(duration * scale), movieTicks = Math.ceil(duration * movieScale - 1e-7);
  let priorTicks = 0;
  for (let position = stts.start + 8; position < last; position += 8) priorTicks += bytes.readUInt32BE(position) * bytes.readUInt32BE(position + 4);
  if (!scale || !movieScale || finalTicks <= 0 || Math.abs(priorTicks + finalTicks - ticks) > 1) return bytes;
  if (elst && (elst.end - elst.start < 20 || bytes.readUInt32BE(elst.start + 4) !== 1)) return bytes;
  const result = Buffer.from(bytes);
  const writeDuration = (box: Box, offset0: number, offset1: number, value: number) => {
    if (result[box.start] === 1) result.writeBigUInt64BE(BigInt(value), box.start + offset1);
    else result.writeUInt32BE(value, box.start + offset0);
  };
  result.writeUInt32BE(finalTicks, last + 4);
  writeDuration(mdhd, 16, 24, priorTicks + finalTicks);
  writeDuration(mvhd, 16, 24, movieTicks);
  writeDuration(tkhd, 20, 28, movieTicks);
  if (elst) writeDuration(elst, 8, 8, movieTicks);
  return result;
}

async function transcode(args: string[], signal?: AbortSignal, copy = false) {
  signal?.throwIfAborted();
  let closed: Promise<void> | undefined;
  try {
    const operation = run(ffmpeg.path, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], {
      timeout: copy ? 20_000 : 180_000, signal, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 2 * 1024 * 1024,
    });
    closed = new Promise(resolve => operation.child.once("close", () => resolve()));
    await operation;
  } catch (error) {
    await closed;
    signal?.throwIfAborted();
    const failure = error as { code?: unknown; signal?: unknown };
    console.error("continuous-video-preparation-failed", { copy, code: typeof failure.code === "string" || typeof failure.code === "number" ? failure.code : null, signal: typeof failure.signal === "string" ? failure.signal : null });
    throw new Error("Não foi possível preparar a continuidade do vídeo. Nenhuma geração foi iniciada.");
  }
}

const encoding = ["-c:v", "libx264", "-tune", "zerolatency", "-crf", "17", "-threads", "2", "-x264-params", "bframes=0:rc-lookahead=0:sync-lookahead=0:ref=1:sliced-threads=1", "-pix_fmt", "yuv420p", "-enc_time_base", "-1", "-vsync", "0"];

/** Frame-addressed ranges retain real source timestamps; no audio tail creates an extra job. */
export async function splitContinuousEditSource(bytes: Buffer, duration: number, options: SplitEditOptions = {}): Promise<PreparedEditSegment[]> {
  options.signal?.throwIfAborted();
  const source = mp4Metadata(bytes);
  if (!Number.isFinite(duration) || Math.abs(source.duration - duration) > 0.15) throw new Error("A duração do vídeo mudou durante a preparação.");
  const pictures = source.videoDuration ?? source.duration;
  const plan = planContinuousSegments(pictures);
  if (plan.length === 1 && source.duration <= MAX_DURATION) return [{ start: 0, duration: source.duration, bytes }];
  const timeline = pictureTimeline(bytes, source);
  const copyPlan = plan.length > 1 ? copyRanges(timeline, plan) : undefined;
  const ranges = copyPlan ?? frameRanges(timeline, plan);
  const verify = (result: Buffer, range: FrameRange) => {
    const actual = mp4Metadata(result), actualPictures = actual.videoDuration ?? actual.duration;
    const tolerance = Math.max(0.002, timeline.tick * 2);
    if (actual.duration < 3 || actual.duration > MAX_DURATION || actual.width !== source.width || actual.height !== source.height || actual.hasAudio
      || actual.frameCount !== range.end - range.first || Math.abs(actualPictures - range.duration) > tolerance) {
      throw new Error("Um trecho não preservou os quadros, o tempo ou as dimensões do original. Nenhuma geração foi iniciada.");
    }
    const actualTimeline = pictureTimeline(result, actual);
    if (actualTimeline.times.some((time, index) => Math.abs(time - (timeline.times[range.first + index] - range.start)) > tolerance)) {
      throw new Error("Um trecho alterou o tempo dos quadros do original. Nenhuma geração foi iniciada.");
    }
    return actual;
  };
  const directory = await mkdtemp(path.join(tmpdir(), "mi-edit-continuity-"));
  try {
    const input = path.join(directory, "original.mp4");
    await writeFile(input, bytes, { signal: options.signal });
    options.onProgress?.(0, ranges.length);
    const prepared: PreparedEditSegment[] = [];
    // Sequential encodes avoid keeping three 4K encoder/frame pools in memory.
    for (const [index, range] of ranges.entries()) {
      options.signal?.throwIfAborted();
      const output = path.join(directory, `part-${index}.mp4`);
      let result: Buffer | undefined;
      if (ranges.length === 1) {
        // Picture duration is valid; only the original audio extended the container.
        await transcode(["-threads", "1", "-i", input, "-map", "0:v:0", "-an", "-c:v", "copy", "-map_metadata", "-1", "-movflags", "+faststart", "-y", output], options.signal, true);
        result = await readFile(/* turbopackIgnore: true */ output, { signal: options.signal });
      } else {
        if (copyPlan) {
          try {
            await transcode(["-threads", "1", "-ss", range.start.toFixed(9), "-i", input, "-map", "0:v:0", "-an", "-c:v", "copy", "-frames:v", String(range.end - range.first), "-map_metadata", "-1", "-movflags", "+faststart", "-y", output], options.signal, true);
            const copied = await readFile(/* turbopackIgnore: true */ output, { signal: options.signal });
            verify(copied, range);
            result = copied;
          } catch { options.signal?.throwIfAborted(); }
        }
        if (!result) {
          const finalFrameDuration = timeline.times[range.end] - timeline.times[range.end - 1];
          await transcode(["-threads", "1", "-i", input, "-filter_threads", "1", "-map", "0:v:0", "-vf", `trim=start_frame=${range.first}:end_frame=${range.end},setpts=PTS-STARTPTS`, "-an", ...encoding, "-preset", source.width * source.height > 1920 * 1080 ? "ultrafast" : "veryfast", "-r", String(1 / finalFrameDuration), "-map_metadata", "-1", "-movflags", "+faststart", "-y", output], options.signal);
          result = repairFinalSample(await readFile(/* turbopackIgnore: true */ output, { signal: options.signal }), range.duration, finalFrameDuration);
        }
      }
      const actual = verify(result, range);
      prepared.push({ start: range.start, duration: actual.videoDuration ?? actual.duration, bytes: result });
      options.onProgress?.(index + 1, ranges.length);
      await rm(output, { force: true });
    }
    return prepared;
  } finally { await rm(directory, { recursive: true, force: true }); }
}
