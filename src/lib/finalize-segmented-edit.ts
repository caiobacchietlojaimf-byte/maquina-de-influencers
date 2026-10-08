import "server-only";
import { put } from "@vercel/blob";
import { readPublicVideo } from "./video-media";
import { mp4Metadata } from "./video-reference";
import { checkEditResult } from "./character-edit";
import { joinEditedSegments } from "./edit-segments";
import { finalizeCharacterEdit } from "./finalize-edit";
import type { Video } from "./db";

/** Validate every piece BEFORE assembly; never stretch, loop or fill missing footage. */
export async function finalizeSegmentedEdit(video: Video, resultUrls: string[]): Promise<Partial<Video>> {
  try {
    const parts = video.edit?.segments;
    if (!parts || parts.length !== resultUrls.length) throw new Error("Quantidade de trechos diferente da preparação.");
    const buffers: Buffer[] = [];
    for (const [index, url] of resultUrls.entries()) {
      const bytes = await readPublicVideo(url);
      const mismatch = checkEditResult(parts[index].source, mp4Metadata(bytes));
      if (mismatch) throw new Error(`Trecho ${index + 1}: ${mismatch}`);
      buffers.push(bytes);
    }
    const joined = await joinEditedSegments(buffers);
    const mismatch = checkEditResult(video.edit!.source, mp4Metadata(joined));
    if (mismatch) throw new Error(mismatch);
    const stored = await put(`edited-videos/${video.userId}/${video.id}-joined.mp4`, joined, { access: "public", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true });
    return await finalizeCharacterEdit(video, stored.url);
  } catch (error) {
    return { status: "review", edit: video.edit, error: `Os trechos recebidos precisam de revisão: ${error instanceof Error ? error.message : "falha na montagem"}. Nenhuma nova geração foi solicitada.` };
  }
}
