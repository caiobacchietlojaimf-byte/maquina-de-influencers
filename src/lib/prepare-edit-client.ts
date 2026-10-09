import type { EditEngine, EditQuote, EditResolution, EditSource, EditTargetMode } from "./character-edit";

export type PrepareEditInput = {
  influencerId: string;
  source: EditSource;
  targetMode: EditTargetMode;
  target?: string;
  resolution: EditResolution;
  engine: EditEngine;
};

export type PrepareEditResult = { quote: EditQuote } | { error: string };
export type PrepareEditProgress = { stage: string; message: string };
type PrepareErrorCode = "cancelled" | "timeout" | "connection" | "session" | "response";

export class PrepareEditClientError extends Error {
  constructor(public readonly code: PrepareErrorCode, message: string) {
    super(message);
    this.name = "PrepareEditClientError";
  }
}

const MAX_EVENT_LENGTH = 262_144;
const connectionError = () => new PrepareEditClientError("connection", "A conexão foi interrompida antes de concluir a preparação. Confira sua internet e tente novamente; nenhuma geração foi iniciada.");
const responseError = () => new PrepareEditClientError("response", "O servidor não concluiu a preparação do vídeo. Tente novamente; nenhuma geração foi iniciada.");

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    if (signal.aborted) aborted();
    else signal.addEventListener("abort", aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

function parseEvent(line: string): { type: "progress"; stage: string; message: string } | { type: "result"; result: PrepareEditResult } {
  if (line.length > MAX_EVENT_LENGTH) throw responseError();
  let event: unknown;
  try { event = JSON.parse(line); } catch { throw responseError(); }
  if (!event || typeof event !== "object" || !("type" in event)) throw responseError();
  if (event.type === "progress" && "stage" in event && typeof event.stage === "string" && "message" in event && typeof event.message === "string") {
    return { type: "progress", stage: event.stage, message: event.message };
  }
  if (event.type === "result" && "result" in event && event.result && typeof event.result === "object") {
    const result = event.result;
    if ("error" in result && typeof result.error === "string" && result.error.length > 0) return { type: "result", result: { error: result.error } };
    if ("quote" in result && result.quote && typeof result.quote === "object") {
      const quote = result.quote as EditQuote;
      if (typeof quote.token === "string" && quote.token.length > 0 && quote.metadata && Number.isFinite(quote.metadata.duration) && Number.isFinite(quote.estimatedUsd)) {
        return { type: "result", result: { quote } };
      }
    }
  }
  throw responseError();
}

/** Prepare only: this endpoint never submits a paid video generation. */
export async function prepareEditClient(input: PrepareEditInput, options: {
  signal?: AbortSignal;
  onProgress?: (progress: PrepareEditProgress) => void;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
} = {}): Promise<PrepareEditResult> {
  const controller = new AbortController();
  const cancel = () => controller.abort(new PrepareEditClientError("cancelled", "Preparação cancelada. Nenhuma geração foi iniciada."));
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new PrepareEditClientError("timeout", "A preparação ultrapassou o limite de espera. Tente novamente ou escolha outro vídeo; nenhuma geração foi iniciada.")), options.timeoutMs ?? 210_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await abortable((options.fetchImpl ?? fetch)("/api/character-edit/prepare", {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson", "X-MI-Prepare": "1" },
      body: JSON.stringify(input), signal: controller.signal,
    }), controller.signal);
    if (response.status === 401) throw new PrepareEditClientError("session", "Sua sessão expirou. Atualize a página e entre novamente antes de preparar o vídeo.");
    if (response.status === 408 || response.status === 504) throw new PrepareEditClientError("timeout", "O servidor atingiu o limite de espera. Tente novamente; nenhuma geração foi iniciada.");
    if (!response.ok || !response.body) throw responseError();
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let pending = "";
    while (true) {
      const { done, value } = await abortable(reader.read(), controller.signal);
      if (controller.signal.aborted) throw controller.signal.reason;
      pending += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        if (controller.signal.aborted) throw controller.signal.reason;
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (!line) continue;
        const event = parseEvent(line);
        if (event.type === "result") return event.result;
        options.onProgress?.({ stage: event.stage, message: event.message });
      }
      if (pending.length > MAX_EVENT_LENGTH) throw responseError();
      if (done) {
        if (pending.trim()) {
          const event = parseEvent(pending.trim());
          if (event.type === "result") return event.result;
        }
        throw connectionError();
      }
    }
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof PrepareEditClientError) throw error;
    throw connectionError();
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    if (reader) {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    controller.abort();
  }
}
