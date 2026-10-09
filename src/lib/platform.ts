import "server-only";

/* Cliente da Higgsfield Platform API — mesma API usada pelo open-higgsfield.
   Submit é POST /{model}; status é GET /requests/{id}/status; auth é
   "Authorization: Key id:secret". A chave vive no servidor (HF_API_KEY). */

const MODEL_ID = /^[a-z0-9][a-z0-9._/-]*$/i;
const API_ORIGIN = "https://api.higgsfield.ai";

export class PlatformError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(messageFromBody(status, body));
    this.name = "PlatformError";
    this.status = status;
    this.body = body;
  }
}

export type QueuedGeneration = {
  status: string;
  requestId: string;
};

export type GenerationStatus = {
  status: string;
  requestId: string;
  images?: Array<{ url: string }>;
  video?: { url: string };
  error?: unknown;
};

export function isConfigured(): boolean {
  try { credentials(); return true; } catch { return false; }
}

function credentials(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.HF_API_KEY?.trim();
  const baseUrl = process.env.HF_API_BASE_URL?.trim()?.replace(/\/$/, "");
  if (!apiKey || !/^[^:\s]+:[^:\s]+$/.test(apiKey)) {
    throw new Error("HF_API_KEY ausente ou inválida (formato id:secret) no .env.local");
  }
  if (!baseUrl) throw new Error("HF_API_BASE_URL ausente no .env.local");
  // Credentials must never follow a configurable URL to another service.
  if (baseUrl !== API_ORIGIN) throw new Error("Endereço da API de geração inválido");
  return { apiKey, baseUrl };
}

async function send(method: "GET" | "POST", pathName: string, body?: Record<string, unknown>) {
  const { apiKey, baseUrl } = credentials();
  const url = `${baseUrl}${pathName}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Key ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  }).catch(() => {
    // Network errors can include request details; expose only a safe message.
    throw new PlatformError(502, { detail: "Não foi possível conectar à plataforma de geração. Tente novamente." });
  });
  const payload = await readJson(response);
  if (!response.ok) throw new PlatformError(response.status, payload);
  return payload;
}

export async function submitGeneration(model: string, input: Record<string, unknown>): Promise<QueuedGeneration> {
  if (!MODEL_ID.test(model) || model.includes("..")) {
    throw new PlatformError(400, { detail: "Modelo inválido" });
  }
  const data = asRecord(await send("POST", `/${model}`, input));
  const requestId = stringField(data, "request_id");
  if (!requestId) throw new PlatformError(502, { detail: "Resposta sem request_id" });
  return { status: stringField(data, "status") ?? "queued", requestId };
}

export async function getStatus(requestId: string): Promise<GenerationStatus> {
  if (!requestId) throw new PlatformError(400, { detail: "request_id ausente" });
  const data = asRecord(await send("GET", `/requests/${encodeURIComponent(requestId)}/status`));
  const images = Array.isArray(data.images)
    ? data.images.flatMap((item) => {
        const url = asRecord(item).url;
        return typeof url === "string" ? [{ url }] : [];
      })
    : undefined;
  const videoUrl = asRecord(data.video).url;
  return {
    status: stringField(data, "status") ?? "unknown",
    requestId: stringField(data, "request_id") ?? requestId,
    ...(images?.length ? { images } : {}),
    ...(typeof videoUrl === "string" ? { video: { url: videoUrl } } : {}),
    ...(data.error !== undefined ? { error: data.error } : {}),
  };
}

/** Statuses dos quais a plataforma nunca sai. */
export const TERMINAL_STATUSES = new Set(["completed", "failed", "nsfw", "canceled"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

async function readJson(response: Response): Promise<unknown> {
  // Redact upstream echoes before they can reach actions, stored errors or UI.
  let text = await response.text();
  const key = process.env.HF_API_KEY?.trim();
  if (key) {
    for (const secret of [key, ...key.split(":")].filter(value => value.length >= 8)) {
      text = text.replaceAll(secret, "[redacted]");
    }
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function messageFromBody(status: number, body: unknown): string {
  const detail = asRecord(body).detail;
  if (typeof detail === "string" && detail) return detail;
  return `Falha na plataforma de geração (${status})`;
}
