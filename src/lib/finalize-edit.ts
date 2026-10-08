import "server-only";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { put } from "@vercel/blob";
import { mp4Metadata } from "./video-reference";
import { checkEditResult } from "./character-edit";
import { readPublicVideo } from "./video-media";
import type { Video } from "./db";
const run = promisify(execFile);
export async function ensureVideoToolsAvailable(): Promise<void> {
  try { await run(ffmpeg.path, ["-version"], { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 }); }
  catch { throw new Error("A finalização de áudio está indisponível. Nenhuma geração foi iniciada; tente novamente mais tarde."); }
}

/** Stream-copy preserves the generated picture and the ORIGINAL audio, without AI audio synthesis. */
export async function preserveSourceAudio(result: Buffer, source: Buffer): Promise<Buffer> {
  const directory = await mkdtemp(path.join(tmpdir(), "mi-edit-"));
  try {
    const resultPath = path.join(directory, "result.mp4"), sourcePath = path.join(directory, "source.mp4"), output = path.join(directory, "final.mp4");
    await Promise.all([writeFile(resultPath, result), writeFile(sourcePath, source)]);
    await run(ffmpeg.path, ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", resultPath, "-i", sourcePath, "-map", "0:v:0", "-map", "1:a?", "-c", "copy", "-map_metadata", "-1", "-movflags", "+faststart", "-y", output], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
    return await readFile(output);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function finalizeCharacterEdit(video: Video, resultUrl: string): Promise<Partial<Video>> {
  if (!video.edit) return { status: "completed", resultUrl };
  try {
    const result = await readPublicVideo(resultUrl);
    const metadata = mp4Metadata(result);
    const mismatch = checkEditResult(video.edit.source, metadata);
    if (mismatch) return { status: "review", resultUrl, error: mismatch, edit: { ...video.edit, result: metadata } };
    const original = await readPublicVideo(video.edit.sourceUrl);
    const sourceMetadata = mp4Metadata(original);
    if (checkEditResult(video.edit.source, sourceMetadata) || sourceMetadata.hasAudio !== video.edit.source.hasAudio) return { status: "review", resultUrl, error: "O arquivo original mudou; o áudio não foi substituído. Confira a referência." };
    const final = await preserveSourceAudio(result, original);
    const finalMetadata = mp4Metadata(final);
    if (checkEditResult(video.edit.source, finalMetadata) || finalMetadata.hasAudio !== sourceMetadata.hasAudio) throw new Error("Validação da finalização falhou.");
    const blob = await put(`edited-videos/${video.userId}/${video.id}.mp4`, final, { access: "public", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true });
    return { status: "completed", resultUrl: blob.url, edit: { ...video.edit, result: finalMetadata, audioPreserved: true } };
  } catch {
    return { status: "review", resultUrl, error: "O vídeo foi gerado, mas a conferência ou preservação do áudio não terminou. O arquivo recebido está disponível para revisão; nenhuma nova geração foi solicitada." };
  }
}
