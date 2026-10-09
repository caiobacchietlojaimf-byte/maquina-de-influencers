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

async function audioPacketFingerprint(file: string): Promise<string> {
  const { stdout } = await run(ffmpeg.path, ["-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1", "-i", file, "-map", "0:a", "-c", "copy", "-f", "framehash", "-hash", "sha256", "pipe:1"], {
    timeout: 30000, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 8 * 1024 * 1024,
  });
  // Keep codec configuration, time bases, timestamps and every packet's SHA256
  // (including priming side data). MP4 remuxers can rewrite the final packet's
  // declared duration, so compare its content and position instead of that field.
  const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const headers = lines.filter(line => /^#(?:extradata|tb |codec_id |sample_rate |channel_layout )/.test(line));
  const packets = lines.filter(line => !line.startsWith("#")).map(line => {
    const fields = line.split(",").map(field => field.trim());
    if (fields.length < 6) throw new Error("Não foi possível conferir os pacotes do áudio original.");
    return [...fields.slice(0, 3), ...fields.slice(4)].join(",");
  });
  if (!packets.length) throw new Error("O vídeo original não contém pacotes de áudio válidos.");
  return [...headers, ...packets].join("\n");
}

export async function ensureVideoToolsAvailable(): Promise<void> {
  try { await run(ffmpeg.path, ["-version"], { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 }); }
  catch { throw new Error("A finalização de áudio está indisponível. Nenhuma geração foi iniciada; tente novamente mais tarde."); }
}

/** Stream-copy preserves the generated picture and the ORIGINAL audio, without AI audio synthesis. */
export async function preserveSourceAudio(result: Buffer, source: Buffer): Promise<Buffer> {
  const pictures = mp4Metadata(result), original = mp4Metadata(source);
  const directory = await mkdtemp(path.join(tmpdir(), "mi-edit-"));
  try {
    const resultPath = path.join(directory, "result.mp4"), sourcePath = path.join(directory, "source.mp4"), output = path.join(directory, "final.mp4");
    await Promise.all([writeFile(resultPath, result), writeFile(sourcePath, source)]);
    // The edit providers receive silent picture segments. Restore the whole
    // original audio only after assembly, never provider audio, -shortest or -t:
    // those would discard the original AAC tail at the picture boundary.
    await run(ffmpeg.path, ["-hide_banner", "-loglevel", "error", "-nostdin", "-threads", "1", "-i", resultPath, "-threads", "1", "-i", sourcePath, "-map", "0:v:0", "-map", original.hasAudio ? "1:a" : "1:a?", "-c", "copy", "-map_metadata", "-1", "-movflags", "+faststart", "-y", output], { timeout: 60000, killSignal: "SIGKILL", windowsHide: true, maxBuffer: 1024 * 1024 });
    const final = await readFile(output), metadata = mp4Metadata(final);
    if (metadata.hasAudio !== original.hasAudio) throw new Error("Não foi possível preservar o áudio original completo.");
    // Edit lists / encoder priming can change mdhd duration during a lossless
    // remux. Keep a bounded metadata sanity check, then require exact packet
    // content AND timestamps below; duration alone cannot prove audio fidelity.
    if (original.hasAudio && (original.audioDuration === undefined || metadata.audioDuration === undefined || Math.abs(metadata.audioDuration - original.audioDuration) > 0.25)) {
      throw new Error("A duração do áudio original não foi preservada.");
    }
    if (metadata.width !== pictures.width || metadata.height !== pictures.height
      || Math.abs((metadata.videoDuration ?? metadata.duration) - (pictures.videoDuration ?? pictures.duration)) > 0.001
      || (pictures.frameCount !== undefined && metadata.frameCount !== pictures.frameCount)) {
      throw new Error("A finalização alterou os quadros do vídeo gerado.");
    }
    if (original.hasAudio) {
      const [sourceAudio, finalAudio] = await Promise.all([audioPacketFingerprint(sourcePath), audioPacketFingerprint(output)]);
      if (sourceAudio !== finalAudio) throw new Error("Os pacotes ou a sincronização do áudio original foram alterados.");
    }
    return final;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function finalizeCharacterEdit(video: Video, resultInput: string | Buffer): Promise<Partial<Video>> {
  const resultUrl = typeof resultInput === "string" ? resultInput : video.resultUrl;
  if (!video.edit) return { status: "completed", resultUrl, error: undefined };
  try {
    // The segmented path already has the assembled MP4 in memory. Passing it
    // directly avoids storing a silent intermediate and downloading it again.
    const result = typeof resultInput === "string" ? await readPublicVideo(resultInput) : resultInput;
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
    return { status: "completed", resultUrl: blob.url, error: undefined, edit: { ...video.edit, result: finalMetadata, audioPreserved: true } };
  } catch {
    return { status: "review", resultUrl, error: "O vídeo foi gerado, mas a conferência ou preservação do áudio não terminou. O arquivo recebido está disponível para revisão; nenhuma nova geração foi solicitada." };
  }
}
