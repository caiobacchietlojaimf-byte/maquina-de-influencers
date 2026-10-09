import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { claimVideoThumbnail, finishVideoThumbnail, getVideo, releaseVideoThumbnailWorker, reserveVideoThumbnailWorker, type Video } from "./db";
import { readPublicVideo } from "./video-media";
import { mp4Metadata } from "./video-reference";

const run = promisify(execFile);
const VIDEO_BYTE_LIMIT = 200 * 1024 * 1024;
const JPEG_BYTE_LIMIT = 1024 * 1024;
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const pending = new Map<string, Promise<VideoThumbnailResult>>();
let running = 0;
export type VideoThumbnailResult = { url: string } | { status: 404 | 503; retryAfter?: number };
const unavailable = (retryAfter = 3): VideoThumbnailResult => ({ status: 503, retryAfter });

function pathname(userId: string, id: string, source: string): string {
  const hash = createHash("sha256").update(`video-thumbnail-v1:${source}`).digest("hex").slice(0, 24);
  return `video-thumbnails/${userId}/${id}-${hash}.jpg`;
}
export function verifiedVideoThumbnail(video: Video): string | undefined {
  if (!video.resultUrl || video.thumbnailSourceUrl !== video.resultUrl || !video.thumbnailUrl || !ID.test(video.id) || !ID.test(video.userId)) return;
  try {
    const url = new URL(video.thumbnailUrl);
    if (url.protocol !== "https:" || !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/u.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash
      || url.pathname !== `/${pathname(video.userId, video.id, video.resultUrl)}`) return;
    return url.href;
  } catch { return; }
}
function usable(video: Video | undefined, userId: string): video is Video {
  return Boolean(video && video.userId === userId && !video.deletedAt && ["completed", "review"].includes(video.status) && video.resultUrl);
}
const pause = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal.throwIfAborted();
  const finished = () => { signal.removeEventListener("abort", aborted); resolve(); };
  const timer = setTimeout(finished, milliseconds);
  const aborted = () => { clearTimeout(timer); signal.removeEventListener("abort", aborted); reject(signal.reason); };
  signal.addEventListener("abort", aborted, { once: true });
});

/** One local MP4 frame. ffmpeg never opens a network URL or inherits shell input. */
export async function extractVideoThumbnail(bytes: Buffer, signal: AbortSignal): Promise<Buffer> {
  signal.throwIfAborted();
  if (!bytes.length || bytes.length > VIDEO_BYTE_LIMIT) throw new Error("Invalid video size");
  const media = mp4Metadata(bytes);
  const duration = media.videoDuration ?? media.duration;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 180 || media.width < 1 || media.height < 1 || media.width > 4096 || media.height > 4096 || media.width * media.height > 16_777_216) throw new Error("Unsupported video dimensions");
  const directory = await mkdtemp(path.join(tmpdir(), "mi-thumbnail-"));
  try {
    const source = path.join(directory, "source.mp4"), output = path.join(directory, "thumbnail.jpg");
    await writeFile(source, bytes, { signal });
    await run(ffmpeg.path, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1",
      "-protocol_whitelist", "file,pipe", "-ss", String(Math.min(1, duration * 0.1)), "-f", "mov", "-enable_drefs", "0", "-use_absolute_path", "0", "-i", source,
      "-map", "0:v:0", "-an", "-sn", "-dn", "-frames:v", "1", "-vf", "scale=640:640:force_original_aspect_ratio=decrease,setsar=1",
      "-threads", "1", "-q:v", "4", "-map_metadata", "-1", "-y", output,
    ], { timeout: 12_000, signal, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 256 * 1024 });
    signal.throwIfAborted();
    const info = await stat(output);
    if (!info.size || info.size > JPEG_BYTE_LIMIT) throw new Error("Invalid thumbnail size");
    const image = await readFile(output, { signal });
    if (image[0] !== 0xff || image[1] !== 0xd8 || image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9) throw new Error("Invalid JPEG");
    const metadata = await sharp(image, { limitInputPixels: 640 * 640, failOn: "error" }).metadata();
    if (metadata.format !== "jpeg" || !metadata.width || !metadata.height || metadata.width > 640 || metadata.height > 640) throw new Error("Invalid thumbnail dimensions");
    return image;
  } finally {
    // This helper deletes only its own mkdtemp folder inside the OS temp root.
    const resolved = path.resolve(directory), root = path.resolve(tmpdir());
    if (path.dirname(resolved) === root && path.basename(resolved).startsWith("mi-thumbnail-")) await rm(resolved, { recursive: true, force: true });
  }
}

async function prepareThumbnail(userId: string, id: string): Promise<VideoThumbnailResult> {
  const initial = await getVideo(userId, id);
  if (!usable(initial, userId)) return { status: 404 };
  const cached = verifiedVideoThumbnail(initial);
  if (cached) return { url: cached };
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) return unavailable(60);
  const deadline = AbortSignal.timeout(55_000);
  const claimId = randomUUID();
  let worker = false, local = false, claimed = false;
  const sourceUrl = initial.resultUrl!;
  try {
    // Bound CPU/download concurrency in a process; the per-user DB leases below
    // also prevent a gallery burst spreading work across serverless instances.
    const queueUntil = Date.now() + 8_000;
    while (running >= 2 && Date.now() < queueUntil) await pause(200, deadline);
    if (running >= 2) return unavailable();
    running++; local = true;
    for (let attempt = 0; attempt < 7; attempt++) {
      const current = await getVideo(userId, id);
      if (!usable(current, userId) || current.resultUrl !== sourceUrl) return { status: 404 };
      const existing = verifiedVideoThumbnail(current);
      if (existing) return { url: existing };
      if (current.thumbnailJob?.sourceUrl === sourceUrl && current.thumbnailJob.state === "failed" && (current.thumbnailJob.retryAfter ?? 0) > Date.now()) return unavailable(Math.min(60, Math.max(1, Math.ceil((current.thumbnailJob.retryAfter! - Date.now()) / 1000))));
      worker = await reserveVideoThumbnailWorker(userId, id, claimId);
      if (worker) break;
      if (attempt < 6) await pause(1000, deadline);
    }
    if (!worker) return unavailable();
    claimed = await claimVideoThumbnail(userId, id, sourceUrl, claimId);
    if (!claimed) {
      const fresh = await getVideo(userId, id);
      const ready = fresh && usable(fresh, userId) ? verifiedVideoThumbnail(fresh) : undefined;
      return ready ? { url: ready } : unavailable();
    }
    const bytes = await readPublicVideo(sourceUrl, VIDEO_BYTE_LIMIT, AbortSignal.any([deadline, AbortSignal.timeout(25_000)]));
    const thumbnail = await extractVideoThumbnail(bytes, deadline);
    const stored = await put(pathname(userId, id, sourceUrl), thumbnail, {
      access: "public", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true,
      cacheControlMaxAge: 31_536_000, abortSignal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)]),
    });
    if (!verifiedVideoThumbnail({ ...initial, thumbnailSourceUrl: sourceUrl, thumbnailUrl: stored.url })) throw new Error("Unexpected storage URL");
    if (!await finishVideoThumbnail(userId, id, sourceUrl, claimId, stored.url)) return { status: 404 };
    return { url: stored.url };
  } catch {
    if (claimed) await finishVideoThumbnail(userId, id, sourceUrl, claimId).catch(() => false);
    return unavailable(60);
  } finally {
    if (worker) await releaseVideoThumbnailWorker(userId, id, claimId).catch(() => undefined);
    if (local) running--;
  }
}

/** On-demand backfill for old videos, with shared work for repeated image requests. */
export async function getVideoThumbnail(userId: string, id: string): Promise<VideoThumbnailResult> {
  if (!ID.test(userId) || !ID.test(id)) return { status: 404 };
  const key = `${userId}:${id}`;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  // Also bound waiting work; callers receive an explicit retry hint.
  if (pending.size >= 24) return unavailable();
  const task = prepareThumbnail(userId, id);
  pending.set(key, task);
  try { return await task; }
  finally { if (pending.get(key) === task) pending.delete(key); }
}
