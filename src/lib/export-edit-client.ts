import type { PrepareEditInput, PrepareEditProgress } from "./prepare-edit-client";

export type ExportEditPackage = { url: string; filename: string };
export type ExportEditResult = { package: ExportEditPackage } | { error: string };
type ExportErrorCode = "cancelled" | "timeout" | "connection" | "session" | "response";

export class ExportEditClientError extends Error {
  constructor(public readonly code: ExportErrorCode, message: string) {
    super(message);
    this.name = "ExportEditClientError";
  }
}

const MAX_EVENT_LENGTH = 32_768;
const connectionError = () => new ExportEditClientError("connection", "A conexão foi interrompida antes de concluir o pacote. Tente novamente; nenhum crédito de geração foi usado.");
const responseError = () => new ExportEditClientError("response", "O servidor não concluiu a exportação. Tente novamente; nenhum crédito de geração foi usado.");

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    if (signal.aborted) aborted();
    else signal.addEventListener("abort", aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

function readPackage(value: unknown): ExportEditPackage {
  if (!value || typeof value !== "object" || !("url" in value) || typeof value.url !== "string" || !("filename" in value) || typeof value.filename !== "string") throw responseError();
  if (!value.filename.toLowerCase().endsWith(".zip") || value.filename.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(value.filename)) throw responseError();
  let url: URL;
  try { url = new URL(value.url); } catch { throw responseError(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname) || !url.pathname.startsWith("/exports/") || !url.pathname.toLowerCase().endsWith(".zip")) throw responseError();
  return { url: url.href, filename: value.filename };
}

function parseEvent(line: string): { type: "progress"; stage: string; message: string } | { type: "result"; result: ExportEditResult } {
  if (line.length > MAX_EVENT_LENGTH) throw responseError();
  let event: unknown;
  try { event = JSON.parse(line); } catch { throw responseError(); }
  if (!event || typeof event !== "object" || !("type" in event)) throw responseError();
  if (event.type === "progress" && "stage" in event && typeof event.stage === "string" && "message" in event && typeof event.message === "string") return { type: "progress", stage: event.stage, message: event.message };
  if (event.type === "result" && "result" in event && event.result && typeof event.result === "object") {
    if ("error" in event.result && typeof event.result.error === "string" && event.result.error.length > 0) return { type: "result", result: { error: event.result.error } };
    return { type: "result", result: { package: readPackage(event.result) } };
  }
  throw responseError();
}

/** Export existing source assets only. No quote acceptance, credit debit or generation submission. */
export async function exportEditClient(input: PrepareEditInput, options: {
  signal?: AbortSignal;
  onProgress?: (progress: PrepareEditProgress) => void;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
} = {}): Promise<ExportEditResult> {
  const controller = new AbortController();
  const cancel = () => controller.abort(new ExportEditClientError("cancelled", "Exportação cancelada. Nenhum crédito de geração foi usado."));
  if (options.signal?.aborted) cancel();
  else options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new ExportEditClientError("timeout", "A exportação ultrapassou o limite de espera. Tente novamente; nenhum crédito de geração foi usado.")), options.timeoutMs ?? 210_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await abortable((options.fetchImpl ?? fetch)("/api/character-edit/export", {
      method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", "Accept": "application/x-ndjson", "X-MI-Export": "1" },
      body: JSON.stringify(input), signal: controller.signal,
    }), controller.signal);
    if (response.status === 401) throw new ExportEditClientError("session", "Sua sessão expirou. Atualize a página e entre novamente para exportar o pacote.");
    if (response.status === 408 || response.status === 504) throw new ExportEditClientError("timeout", "O servidor atingiu o limite de espera. Tente exportar novamente; nenhum crédito de geração foi usado.");
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
    if (error instanceof ExportEditClientError) throw error;
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
