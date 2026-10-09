import "server-only";
import { claimVideoFinalization, updateVideo, updateVideoFromPoll, type Video } from "./db";
import { FalError, getFalGenerationStatus, type FalGenerationStatus } from "./fal";
import { finalizeCharacterEdit } from "./finalize-edit";
import { finalizeSegmentedEdit } from "./finalize-segmented-edit";

let mediaWork = Promise.resolve();

/** Reads existing requests only. Shared by authenticated polling and verified callbacks. */
export async function reconcileFalVideo(video: Video, force = false): Promise<void> {
  if (!video.edit || video.edit.provider !== "fal" || video.edit.cancelledAt || video.deletedAt || video.status === "completed") return;
  const originalEdit = video.edit;
  if (!force && video.polling?.nextCheckAt && video.polling.nextCheckAt > Date.now()) return;
  const parts = video.edit.segments ?? [{ sourceUrl: video.edit.sourceUrl, start: 0, source: video.edit.source, requestId: video.requestId }];
  if (!parts.length || parts.some(part => !part.requestId)) {
    if (Date.now() - video.createdAt > 300_000) await updateVideoFromPoll(video, { status: "review", error: "O envio foi interrompido. Confira os pedidos registrados no provedor; nenhum trecho será reenviado automaticamente." });
    return;
  }
  if (video.status === "queued") {
    if (Date.now() - video.createdAt <= 300_000) return;
    if (!await updateVideoFromPoll(video, { status: "processing" })) return;
    video = { ...video, status: "processing" };
  }
  // A reviewed, already-muxed crop cannot be repaired by downloading it again.
  if (video.status === "review" && originalEdit.audioPreserved) return;
  try {
    const statuses: FalGenerationStatus[] = await Promise.all(parts.map(part => part.resultUrl
      ? Promise.resolve({ status: "completed" as const, videoUrl: part.resultUrl })
      : getFalGenerationStatus(originalEdit.model, part.requestId!)));
    const failed = statuses.find(item => item.status === "failed");
    const providerStatus = failed ? "failed" : statuses.every(item => item.status === "completed") ? "completed" : statuses.some(item => item.status === "processing") ? "processing" : "queued";
    const polling: Video["polling"] = { checkedAt: Date.now(), failures: 0, providerStatus };
    const edit = { ...originalEdit, segments: parts.map((part, index) => ({ ...part, ...(statuses[index].videoUrl ? { resultUrl: statuses[index].videoUrl } : {}) })) };
    if (failed) {
      await updateVideoFromPoll(video, { edit, polling, status: "review", error: `A fal.ai não concluiu a edição: ${failed.error ?? "falha no processamento"}. Nenhuma nova geração foi solicitada.` });
      return;
    }
    if (statuses.some(item => item.status !== "completed" || !item.videoUrl)) {
      await updateVideoFromPoll(video, { edit, polling, error: Date.now() - video.createdAt > 1800_000 ? "A fal.ai ainda está processando este pedido. O vídeo será conferido assim que o provedor concluir; nenhuma nova geração foi enviada." : undefined });
      return;
    }
    const urls = statuses.map(item => item.videoUrl!);
    // Serialize media work inside a warm worker; verified callbacks still finish when the browser closes.
    const prior = mediaWork; let release!: () => void;
    mediaWork = new Promise<void>(resolve => { release = resolve; });
    await prior;
    try {
      if (!await claimVideoFinalization(video)) return;
      // Save every already-paid output only after winning the lease. A stale
      // duplicate must not replace an already-muxed final URL with raw media.
      await updateVideo(video.id, { edit, polling, ...(urls.length === 1 ? { resultUrl: urls[0] } : {}) });
      const complete = { ...video, edit };
      const finalized = parts.length > 1 ? await finalizeSegmentedEdit(complete, urls) : await finalizeCharacterEdit(complete, urls[0]);
      await updateVideo(video.id, { ...finalized, polling, finalizationStartedAt: undefined, ...(finalized.status === "completed" ? { error: undefined } : {}) });
    } finally { release(); }
  } catch (error) {
    const failures = (video.polling?.failures ?? 0) + 1;
    const code = error instanceof FalError ? error.status : undefined;
    // A failed status lookup is not a failed generation. Keep the request and a visible explanation.
    const message = code === 401 || code === 403 ? "A consulta à fal.ai foi recusada. Confira a configuração da API; o pedido existente foi preservado."
      : code === 404 || code === 410 ? "A fal.ai não localizou o resultado deste pedido. Confira o identificador no provedor; nenhuma nova geração foi solicitada."
      : "Não foi possível conferir a geração agora. A consulta será repetida com o mesmo pedido, sem nova geração.";
    await updateVideoFromPoll(video, { polling: { checkedAt: Date.now(), failures, error: message, nextCheckAt: Date.now() + Math.min(60_000, failures * 15_000) }, error: message });
  }
}
