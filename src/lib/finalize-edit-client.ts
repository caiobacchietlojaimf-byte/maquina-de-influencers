import type { Video } from "./db";

export function canFinalizeExistingEdit(video: Video): boolean {
  if (video.status !== "review" || !video.edit || video.deletedAt) return false;
  const segments = video.edit.segments;
  return segments && segments.length > 1 ? segments.every(part => Boolean(part.resultUrl)) : Boolean(video.resultUrl);
}

type FinalizeResponse = { video?: Video; error?: string };

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    if (signal.aborted) aborted();
    else signal.addEventListener("abort", aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

/** Finalizes the existing provider result only; never starts a generation. */
export async function finalizeEditClient(videoId: string, options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
} = {}): Promise<FinalizeResponse> {
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error("A conexão com a finalização foi encerrada. Atualize a página para conferir o vídeo."));
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("A confirmação da finalização demorou além do limite. Atualize a página para conferir o vídeo. Nenhuma nova geração foi solicitada.")), options.timeoutMs ?? 210_000);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await abortable((options.fetchImpl ?? fetch)("/api/character-edit/finalize", {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", "X-MI-Finalize": "1" },
      body: JSON.stringify({ videoId }), signal: controller.signal,
    }), controller.signal);
    if (response.status === 401) return { error: "Sua sessão expirou. Atualize a página e entre novamente para finalizar o vídeo." };
    const body: unknown = await abortable(response.json(), controller.signal);
    if (!body || typeof body !== "object") throw new Error("Resposta de finalização inválida.");
    const error = "error" in body && typeof body.error === "string" ? body.error : undefined;
    const candidate = "video" in body && body.video && typeof body.video === "object" ? body.video as Video : undefined;
    const video = candidate?.id === videoId && ["completed", "review", "processing", "queued", "failed"].includes(candidate.status) ? candidate : undefined;
    if ((response.ok || response.status === 422) && video) return { video, error };
    if (error) return { error };
    return { error: response.status === 409 ? "Esse vídeo já está sendo finalizado. Aguarde e atualize a página para conferir." : "Não foi possível confirmar a finalização. Atualize a página para conferir o vídeo; nenhuma nova geração foi solicitada." };
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw new Error("A conexão com a finalização foi interrompida. Atualize a página para conferir o vídeo; nenhuma nova geração foi solicitada.", { cause: error });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
}
