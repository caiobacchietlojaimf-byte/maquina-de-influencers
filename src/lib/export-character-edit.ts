import "server-only";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { ZipFile } from "yazl";
import { put, del } from "@vercel/blob";
import { requireUser } from "@/lib/auth";
import { getInfluencer, getViral } from "@/lib/db";
import { getProfile } from "@/data/ai-profiles";
import { getMotionPreset } from "@/data/motion-presets";
import { isAiCharacterVideo } from "@/lib/ai-discovery";
import { readUploadedReference } from "@/lib/uploaded-reference";
import { publicMediaUrl, readPublicVideo } from "@/lib/video-media";
import { mp4Metadata } from "@/lib/video-reference";
import { MAIN_CHARACTER_TARGET, validateProviderEdit } from "@/lib/character-edit";
import { splitEditSource } from "@/lib/edit-segments";
import { buildEditExportEntries } from "@/lib/edit-export-package";
import { isEditExportInput } from "@/lib/edit-export-input";
import type { PrepareEditInput } from "./prepare-edit-client";
import type { PrepareOptions } from "./prepare-character-edit";

export type ExportEditResult = { url: string; filename: string } | { error: string };

/** Files only: no provider credentials, generation request, quote or credit operation. */
export async function exportCharacterEdit(input: PrepareEditInput, options: PrepareOptions = {}): Promise<ExportEditResult> {
  let stage = "auth";
  const progress = (next: string, message: string) => {
    options.signal?.throwIfAborted();
    stage = next;
    options.onProgress?.({ type: "progress", stage, message });
  };
  try {
    progress("auth", "Conferindo sua sessão…");
    const user = await requireUser();
    if (!isEditExportInput(input)) return { error: "Selecione o influencer, a referência e o modelo antes de exportar." };
    progress("reference", "Separando o influencer e o vídeo de referência…");
    const influencer = await getInfluencer(user.id, input.influencerId);
    if (!influencer?.imageUrl || influencer.status !== "completed") return { error: "Selecione um influencer pronto da sua conta." };
    const source = input.source;
    let url: string | undefined, name: string | undefined;
    if (source.kind === "profile") {
      const profile = getProfile(source.handle), post = profile?.posts.find(item => item.code === source.id);
      url = post?.video;
      name = profile && post ? `@${profile.handle} · ${post.scene}` : undefined;
    } else if (source.kind === "viral") {
      const viral = await getViral(source.id);
      if (viral && isAiCharacterVideo(viral)) { url = viral.playUrl; name = viral.title; }
    } else if (source.kind === "preset") {
      const preset = getMotionPreset(source.id);
      url = preset?.drivingVideo; name = preset?.name;
    } else if (source.kind === "upload") {
      // Uploaded references are signed, expire and are bound to their owner.
      const uploaded = readUploadedReference(source.token, user.id);
      url = uploaded.videoUrl; name = uploaded.name;
    }
    if (!url || !name) return { error: "Vídeo original não encontrado. Selecione ou envie outra referência." };
    progress("download", "Baixando o vídeo original com áudio…");
    const original = await readPublicVideo(publicMediaUrl(url), undefined, options.signal);
    const metadata = mp4Metadata(original);
    const invalid = validateProviderEdit(input.engine, metadata, input.resolution, input.targetMode);
    if (invalid) return { error: invalid };
    progress("image", "Separando a foto do influencer…");
    const image = await readPublicVideo(publicMediaUrl(influencer.imageUrl), 25 * 1024 * 1024, options.signal);
    let segments = [{ start: 0, bytes: original }];
    if (input.engine.startsWith("fal-kling") && metadata.duration > 15) {
      progress("segments", "Preparando os trechos sem perder a duração do original…");
      segments = await splitEditSource(original, metadata.duration, { signal: options.signal });
    }
    progress("package", "Organizando arquivos, prompts e guia de uso…");
    const entries = buildEditExportEntries({
      name, influencerName: influencer.name, original, image, metadata, segments,
      engine: input.engine, resolution: input.resolution,
      target: input.targetMode === "main" ? MAIN_CHARACTER_TARGET : input.target!.trim(),
    });
    const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "video";
    const filename = `genjutsu-${slug}.zip`;
    const archive = new ZipFile();
    const output = archive.outputStream as Readable;
    const activeEntries = new Set<Readable>();
    archive.on("error", error => {
      for (const entry of activeEntries) entry.destroy();
      output.destroy(error);
    });
    // Keep a listener installed even if an upload exits before consuming the stream.
    output.on("error", () => {});
    const cancelArchive = () => {
      for (const entry of activeEntries) entry.destroy();
      output.destroy();
    };
    options.signal?.addEventListener("abort", cancelArchive, { once: true });
    try {
      for (const entry of entries) archive.addReadStreamLazy(entry.name, { compress: false, size: entry.bytes.length }, callback => {
        // MP4s can exceed 90 MB. Yield views in small chunks instead of handing
        // the multipart uploader one enormous buffer to copy and queue.
        const stream = Readable.from((function* () {
          for (let offset = 0; offset < entry.bytes.length; offset += 65_536) {
            options.signal?.throwIfAborted();
            yield entry.bytes.subarray(offset, offset + 65_536);
          }
        })(), { objectMode: false, highWaterMark: 65_536 });
        activeEntries.add(stream);
        stream.once("close", () => activeEntries.delete(stream));
        callback(null, stream);
      });
      archive.end();
      progress("upload", "Disponibilizando o pacote ZIP para download…");
      // Stream ZIP → multipart storage, not a buffered API response. The browser
      // downloads directly from storage, outside the function's time/body limits.
      const uploadStream = Readable.toWeb(output, { strategy: { highWaterMark: 65_536, size: chunk => chunk.byteLength } }) as ReadableStream<Uint8Array>;
      const blob = await put(`exports/${randomUUID()}/${filename}`, uploadStream, {
        access: "public", contentType: "application/zip", addRandomSuffix: false,
        allowOverwrite: false, multipart: true, abortSignal: options.signal,
      });
      if (options.signal?.aborted) {
        await del(blob.url).catch(() => undefined);
        options.signal.throwIfAborted();
      }
      return { url: blob.downloadUrl, filename };
    } finally {
      options.signal?.removeEventListener("abort", cancelArchive);
      cancelArchive();
    }
  } catch {
    console.error("[export-edit]", { stage, cancelled: options.signal?.aborted === true });
    return { error: options.signal?.aborted
      ? "Exportação cancelada ou limite de espera atingido. Nenhuma geração foi iniciada."
      : "Não foi possível montar o pacote. Confira a referência e tente novamente; nenhum crédito de geração foi consumido." };
  }
}
