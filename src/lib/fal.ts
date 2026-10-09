import "server-only";

// fal's queue API uses the full model path for submission, but only owner/app
// for status and result retrieval (the same routing used by @fal-ai/client).
const QUEUE_ORIGIN = "https://queue.fal.run";
const QUEUE_APPS = new Map([
  ["fal-ai/wan/v2.2-14b/animate/replace", "fal-ai/wan"],
  ["fal-ai/kling-video/o3/standard/video-to-video/edit", "fal-ai/kling-video"],
  ["fal-ai/kling-video/o3/pro/video-to-video/edit", "fal-ai/kling-video"],
]);
const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/;

export class FalError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(redact(message));
    this.name = "FalError";
    this.status = status;
  }
}

export type FalGenerationStatus = {
  status: "queued" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
};

export function isFalConfigured(): boolean {
  const key = process.env.FAL_KEY?.trim();
  return Boolean(key && key.length >= 16 && !/\s/.test(key));
}

function credentials(): string {
  if (!isFalConfigured()) throw new FalError(500, "A fal.ai ainda não foi configurada no servidor.");
  return process.env.FAL_KEY!.trim();
}

function queueApp(model: string): string {
  const app = QUEUE_APPS.get(model);
  if (!app) throw new FalError(400, "Modelo de edição da fal.ai inválido.");
  return app;
}

function redact(value: string): string {
  const key = process.env.FAL_KEY?.trim();
  if (!key) return value;
  const secrets = [key, ...key.split(":")].filter(Boolean);
  for (const secret of secrets) {
    value = value.replaceAll(secret, "[redacted]");
    value = value.replaceAll(encodeURIComponent(secret), "[redacted]");
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function messageFromBody(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) return redact(body).slice(0, 1000);
  const data = record(body);
  for (const key of ["error", "detail", "message"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return redact(value).slice(0, 1000);
    if (Array.isArray(value)) {
      const messages = value.flatMap(item => {
        const message = record(item).msg;
        return typeof message === "string" ? [message] : [];
      });
      if (messages.length) return redact(messages.join("; ")).slice(0, 1000);
    }
  }
  return fallback;
}

async function send(method: "POST" | "GET" | "PUT", path: string, input?: Record<string, unknown>): Promise<unknown> {
  const key = credentials();
  let response: Response;
  let body: string;
  try {
    response = await fetch(`${QUEUE_ORIGIN}/${path}`, {
      method,
      headers: {
        Authorization: `Key ${key}`,
        ...(input ? { "Content-Type": "application/json" } : {}),
      },
      ...(input ? { body: JSON.stringify(input) } : {}),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    body = await response.text();
  } catch {
    // A submission timeout can still have enqueued a paid job. Let the caller
    // retain that uncertainty; never automatically re-submit a POST.
    throw new FalError(502, "Não foi possível confirmar a resposta da fal.ai. A solicitação não foi reenviada.");
  }
  let payload: unknown;
  try { payload = body ? JSON.parse(body) : null; }
  catch { payload = body; }
  if (!response.ok) {
    throw new FalError(response.status, messageFromBody(payload, `Falha na fal.ai (${response.status}).`));
  }
  return payload;
}

export function falVideoWebhookUrl(videoId: string): string | undefined {
  const base = process.env.PUBLIC_BASE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  if (!base || !/^[a-f0-9-]{36}$/i.test(videoId)) return undefined;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname.includes(".")) return undefined;
    return new URL(`/api/fal/webhook/${videoId}`, url.origin).href;
  } catch { return undefined; }
}

export async function submitFalGeneration(model: string, input: Record<string, unknown>, webhookUrl?: string): Promise<{ requestId: string }> {
  queueApp(model);
  if (webhookUrl) {
    const url = new URL(webhookUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new FalError(400, "Endereço de confirmação inválido.");
  }
  const data = record(await send("POST", `${model}${webhookUrl ? `?fal_webhook=${encodeURIComponent(webhookUrl)}` : ""}`, input));
  const requestId = data.request_id;
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId) || redact(requestId) !== requestId) {
    throw new FalError(502, "A fal.ai não retornou um identificador válido. A solicitação não foi reenviada.");
  }
  return { requestId };
}

/** Best effort: fal only guarantees no charge for requests still IN_QUEUE. */
export async function cancelFalGeneration(model: string, requestId: string): Promise<void> {
  const app = queueApp(model);
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) throw new FalError(400, "Identificador da geração inválido.");
  try { await send("PUT", `${app}/requests/${requestId}/cancel`); }
  catch (error) {
    // 400 = already completed; the cancellation is then simply a no-op.
    if (!(error instanceof FalError && error.status === 400)) throw error;
  }
}

export async function getFalGenerationStatus(model: string, requestId: string): Promise<FalGenerationStatus> {
  const app = queueApp(model);
  if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
    throw new FalError(400, "Identificador da geração inválido.");
  }
  // Ignore upstream status_url/response_url: the authorization header must
  // only reach these fixed official paths, including after a provider error.
  const path = `${app}/requests/${requestId}`;
  const data = record(await send("GET", `${path}/status`));
  if (data.status === "IN_QUEUE") return { status: "queued" };
  if (data.status === "IN_PROGRESS") return { status: "processing" };
  if (data.status !== "COMPLETED") throw new FalError(502, "A fal.ai retornou um status desconhecido.");
  if (data.error || data.error_type) {
    return { status: "failed", error: messageFromBody(data, "A fal.ai não conseguiu concluir esta edição.") };
  }

  let result: Record<string, unknown>;
  try { result = record(await send("GET", path)); }
  catch (error) {
    // Validation/inference failures may appear only on the result endpoint.
    // Authentication, rate limits and transport errors are not job failures.
    if (error instanceof FalError && (error.status === 400 || error.status === 422)) {
      return { status: "failed", error: error.message };
    }
    throw error;
  }
  if (result.error) return { status: "failed", error: messageFromBody(result, "A fal.ai não conseguiu concluir esta edição.") };
  const videoUrl = record(result.video).url;
  if (typeof videoUrl !== "string" || redact(videoUrl) !== videoUrl) {
    throw new FalError(502, "A fal.ai concluiu a solicitação sem retornar um vídeo válido.");
  }
  try {
    const url = new URL(videoUrl);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid video URL");
  } catch {
    throw new FalError(502, "A fal.ai retornou um endereço de vídeo inválido.");
  }
  return { status: "completed", videoUrl };
}
