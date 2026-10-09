import "server-only";
import { getVideo, claimVideoFinalization, updateVideo, type Video } from "./db";
import { finalizeCharacterEdit } from "./finalize-edit";
import { finalizeSegmentedEdit } from "./finalize-segmented-edit";

type RecoveryResult = { status: number; video?: Video; error?: string };

/** Reuse already-paid provider results. This module must never submit or debit a generation. */
export async function retryVideoFinalization(userId: string, videoId: string): Promise<RecoveryResult> {
  const video = await getVideo(userId, videoId);
  if (!video || video.deletedAt) return { status: 404, error: "Vídeo não encontrado." };
  if (video.status === "completed") return { status: 200, video };
  if (video.status !== "review" || !video.edit) return { status: 409, error: "Aguarde a geração terminar antes de finalizar o vídeo." };
  const segments = video.edit.segments;
  const urls = segments && segments.length > 1 ? segments.map(part => part.resultUrl) : [segments?.[0]?.resultUrl ?? video.resultUrl];
  if (!urls.length || urls.some(url => !url)) return { status: 422, error: "Ainda faltam resultados para montar o vídeo completo. Nenhuma nova geração foi iniciada." };
  if (!await claimVideoFinalization(video)) return { status: 409, error: "Este vídeo já está sendo finalizado. Aguarde e atualize a página." };
  try {
    const patch = urls.length > 1 ? await finalizeSegmentedEdit(video, urls as string[]) : await finalizeCharacterEdit(video, urls[0]!);
    const updated = await updateVideo(video.id, { ...patch, finalizationStartedAt: undefined, ...(patch.status === "completed" ? { error: undefined } : {}) });
    if (!updated) return { status: 404, error: "Vídeo não encontrado." };
    return updated.status === "completed" ? { status: 200, video: updated } : { status: 422, video: updated, error: updated.error ?? "A montagem ainda precisa de revisão. Nenhuma nova geração foi iniciada." };
  } catch {
    await updateVideo(video.id, { finalizationStartedAt: undefined });
    return { status: 503, error: "Não foi possível concluir a montagem agora. Os trechos foram preservados; tente novamente sem gerar outro vídeo." };
  }
}
