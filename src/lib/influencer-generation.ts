import "server-only";

import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { CHARACTER_TYPES, type CharacterTier } from "@/data/character-types";
import { TRAIT_GROUPS, type Selection } from "@/data/traits";
import { buildBrief, buildInfluencerEditPrompt, buildInfluencerPromptBrief } from "@/lib/prompt";
import { readPublicVideo } from "@/lib/video-media";

export const INFLUENCER_MODEL = "higgsfield/ai-influencer";
export const INFLUENCER_IMAGE_EDIT_MODEL = "fal-ai/nano-banana-pro/edit";
const ORIGIN = "https://api.higgsfield.ai";
const FAL_QUEUE_ORIGIN = "https://queue.fal.run";
const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateInfluencerInput = {
  requestKey: string;
  name: string;
  tier: CharacterTier;
  selection: Selection;
  referenceUrl?: string;
  styleReferenceUrl?: string;
  mode?: "form" | "prompt";
  prompt?: string;
};

export type CreateInfluencerVariantInput = {
  influencerId: string;
  requestKey: string;
  kind: "outfit" | "details";
  prompt: string;
  /** Optional name for this saved version, not a replacement for the family's name. */
  name?: string;
  styleReferenceUrl?: string;
};

export class InfluencerGenerationError extends Error {
  constructor(message: string, readonly uncertain = false) { super(message); }
}

function credentials() {
  const key = process.env.HF_API_KEY?.trim();
  const origin = process.env.HF_API_BASE_URL?.trim().replace(/\/$/, "") ?? ORIGIN;
  if (!key || !/^[^:\s]+:[^:\s]+$/.test(key) || origin !== ORIGIN) throw new InfluencerGenerationError("A geração de influencers não está configurada no servidor.");
  return key;
}

export function checkInfluencerConfiguration(hasReferences: boolean, provider: "higgsfield" | "fal" = "higgsfield") {
  if (provider === "fal") falCredentials(); else credentials();
  if ((hasReferences || provider === "fal") && !process.env.BLOB_READ_WRITE_TOKEN) throw new InfluencerGenerationError("O armazenamento das fotos de referência não está configurado.");
}

function referenceImage(value: string) {
  if (value.length > 450_000) throw new InfluencerGenerationError("A foto de referência é muito grande. Envie novamente pelo formulário.");
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new InfluencerGenerationError("Use uma foto JPEG, PNG ou WebP válida.");
  const bytes = Buffer.from(match[2], "base64");
  const ext = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "jpeg"
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "webp" : undefined;
  if (!ext || ext !== match[1] || bytes.length < 32 || bytes.length > 330_000 || (ext === "png" && bytes.includes(Buffer.from("acTL"))) || (ext === "webp" && bytes.includes(Buffer.from("ANIM")))) {
    throw new InfluencerGenerationError("Use uma foto estática JPEG, PNG ou WebP válida.");
  }
  return { bytes, ext, contentType: `image/${ext}` };
}

export function publicImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname.includes(".") && !url.hostname.endsWith(".local") && !/^\d+(\.\d+){3}$/.test(url.hostname);
  } catch { return false; }
}

export function validateInfluencerInput(value: unknown, userId: string, storedReferences = false): CreateInfluencerInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InfluencerGenerationError("Dados do influencer inválidos.");
  const input = value as CreateInfluencerInput;
  if (typeof input.requestKey !== "string" || !UUID.test(input.requestKey)) throw new InfluencerGenerationError("Atualize a página e tente criar novamente.");
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 80) throw new InfluencerGenerationError("Use um nome de 1 a 80 caracteres.");
  if (input.mode !== undefined && input.mode !== "form" && input.mode !== "prompt") throw new InfluencerGenerationError("Modo de criação inválido.");
  const prompt = validateInstructions(input.prompt, input.mode === "prompt");
  if (input.mode === "prompt" && !input.referenceUrl) throw new InfluencerGenerationError("Adicione uma imagem para criar com imagem e prompt.");
  // Form selections must never silently override the separate image + prompt mode.
  if (input.mode === "prompt") {
    validateReferences([input.referenceUrl, input.styleReferenceUrl], userId, storedReferences);
    return { requestKey: input.requestKey, name: input.name.trim(), tier: "normal", selection: {}, mode: "prompt", prompt, referenceUrl: input.referenceUrl, ...(input.styleReferenceUrl ? { styleReferenceUrl: input.styleReferenceUrl } : {}) };
  }
  if (!CHARACTER_TYPES.some(type => type.id === input.tier)) throw new InfluencerGenerationError("Tipo de personagem inválido.");
  if (!input.selection || typeof input.selection !== "object" || Array.isArray(input.selection) || Object.keys(input.selection).length > 18) throw new InfluencerGenerationError("Seleção de características inválida.");
  const selection: Selection = {};
  for (const key of Object.keys(input.selection).sort()) {
    const group = TRAIT_GROUPS.find(item => item.id === key);
    const ids = input.selection[key];
    if (!group || !Array.isArray(ids) || ids.length > group.max || new Set(ids).size !== ids.length) throw new InfluencerGenerationError("Seleção de características inválida.");
    const slots = new Set<string>();
    for (const id of ids) {
      const option = group.options.find(item => item.id === id && item.tiers.includes(input.tier));
      if (!option || (option.exclusive && ids.length > 1) || (option.slot && slots.has(option.slot))) throw new InfluencerGenerationError("As características selecionadas não são compatíveis. Revise a seleção.");
      if (option.slot) slots.add(option.slot);
    }
    if (ids.length) selection[key] = [...ids].sort();
  }
  validateReferences([input.referenceUrl, input.styleReferenceUrl], userId, storedReferences);
  return { requestKey: input.requestKey, name: input.name.trim(), tier: input.tier, selection, ...(prompt ? { prompt } : {}), ...(input.referenceUrl ? { referenceUrl: input.referenceUrl } : {}), ...(input.styleReferenceUrl ? { styleReferenceUrl: input.styleReferenceUrl } : {}) };
}

function validateReferences(values: Array<string | undefined>, userId: string, storedReferences: boolean) {
  for (const value of values) {
    if (value === undefined) continue;
    if (typeof value !== "string") throw new InfluencerGenerationError("Foto de referência inválida.");
    if (storedReferences && publicImageUrl(value)) {
      const url = new URL(value);
      if (!url.hostname.endsWith(".public.blob.vercel-storage.com") || !url.pathname.startsWith(`/influencer-references/${userId}/`)) throw new InfluencerGenerationError("Foto de referência inválida.");
    } else referenceImage(value);
  }
}

function validateInstructions(value: unknown, required: boolean) {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || value.trim().length > 3000 || (required && !value.trim())) throw new InfluencerGenerationError("Descreva o que deseja em até 3.000 caracteres.");
  return value.trim() || undefined;
}

export function validateInfluencerVariantInput(value: unknown, userId: string, storedReferences = false): CreateInfluencerVariantInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InfluencerGenerationError("Dados da edição inválidos.");
  const input = value as CreateInfluencerVariantInput;
  if (typeof input.influencerId !== "string" || !UUID.test(input.influencerId)) throw new InfluencerGenerationError("Influencer inválido.");
  if (typeof input.requestKey !== "string" || !UUID.test(input.requestKey)) throw new InfluencerGenerationError("Atualize a página e tente criar novamente.");
  if (input.kind !== "outfit" && input.kind !== "details") throw new InfluencerGenerationError("Tipo de edição inválido.");
  const prompt = validateInstructions(input.prompt, true)!;
  if (input.name !== undefined && (typeof input.name !== "string" || input.name.trim().length > 80)) throw new InfluencerGenerationError("Use um nome de até 80 caracteres para a versão.");
  validateReferences([input.styleReferenceUrl], userId, storedReferences);
  return { influencerId: input.influencerId, requestKey: input.requestKey, kind: input.kind, prompt, ...(input.name?.trim() ? { name: input.name.trim() } : {}), ...(input.styleReferenceUrl ? { styleReferenceUrl: input.styleReferenceUrl } : {}) };
}

export function influencerRequestIdentity(userId: string, input: CreateInfluencerInput | CreateInfluencerVariantInput) {
  const hash = createHash("sha256").update(`${userId}:${input.requestKey}`).digest("hex");
  const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const { requestKey: _, ...payload } = input;
  const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { id, fingerprint };
}

export async function storeInfluencerReference(value: string | undefined, userId: string, id: string, role: "identity" | "style") {
  if (!value || publicImageUrl(value)) return value;
  const image = referenceImage(value);
  const result = await put(`influencer-references/${userId}/${id}/${role}.${image.ext}`, image.bytes, {
    access: "public", contentType: image.contentType, addRandomSuffix: false, allowOverwrite: false, abortSignal: AbortSignal.timeout(25_000),
  });
  return result.url;
}

export function buildInfluencerPayload(input: Pick<CreateInfluencerInput, "tier" | "selection" | "referenceUrl" | "styleReferenceUrl" | "prompt">, seed: number) {
  if (!Number.isInteger(seed) || seed < 1 || seed > 1_000_000) throw new InfluencerGenerationError("Seed inválida.");
  return {
    tier: input.tier, selection: input.selection, seed, variation_index: 0,
    brief: buildBrief(input.tier, input.selection, { identity: Boolean(input.referenceUrl), style: Boolean(input.styleReferenceUrl), prompt: input.prompt }),
    ...(input.referenceUrl ? { image_url: input.referenceUrl } : {}),
    ...(input.styleReferenceUrl ? { item_image_urls: [input.styleReferenceUrl] } : {}),
  };
}

async function request(method: "GET" | "POST", path: string, payload?: unknown, requestKey?: string) {
  const key = credentials();
  let response: Response;
  try {
    response = await fetch(`${ORIGIN}${path}`, {
      method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(method === "POST" ? 30_000 : 12_000),
      headers: { Authorization: `Key ${key}`, ...(payload ? { "Content-Type": "application/json" } : {}), ...(requestKey ? { "Idempotency-Key": requestKey } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new InfluencerGenerationError(response.status === 402 ? "O provedor está sem saldo para gerar o influencer." : response.status === 422 ? "O provedor recusou as características ou fotos. Revise a seleção." : "A plataforma de geração não conseguiu receber o pedido.", method === "POST" && (response.status >= 500 || response.status === 408));
    }
    return await response.json() as Record<string, unknown>;
  } catch (error) {
    if (error instanceof InfluencerGenerationError) throw error;
    throw new InfluencerGenerationError("Não foi possível confirmar a resposta da plataforma. Não reenvie até conferir o pedido no provedor.", method === "POST");
  }
}

export async function submitInfluencerGeneration(payload: ReturnType<typeof buildInfluencerPayload>, requestKey: string) {
  const result = await request("POST", `/${INFLUENCER_MODEL}`, payload, requestKey);
  if (typeof result.request_id !== "string" || !result.request_id || result.request_id.length > 200) throw new InfluencerGenerationError("A plataforma não confirmou o identificador da geração. Não reenvie o pedido.", true);
  return { requestId: result.request_id };
}

export async function getInfluencerGenerationStatus(requestId: string) {
  const result = await request("GET", `/requests/${encodeURIComponent(requestId)}/status`);
  const images = Array.isArray(result.images) ? result.images.flatMap(item => item && typeof item === "object" && publicImageUrl(item.url) ? [item.url as string] : []) : [];
  return { status: typeof result.status === "string" ? result.status : "unknown", images };
}

export function buildInfluencerImageEditPayload(input: Pick<CreateInfluencerInput, "referenceUrl" | "styleReferenceUrl" | "prompt">, kind?: "outfit" | "details") {
  if (!input.referenceUrl || !publicImageUrl(input.referenceUrl) || !input.prompt?.trim()) throw new InfluencerGenerationError("A edição precisa de uma imagem e instruções.");
  return {
    prompt: kind ? buildInfluencerEditPrompt(input.prompt, kind, Boolean(input.styleReferenceUrl)) : buildInfluencerPromptBrief(input.prompt, Boolean(input.styleReferenceUrl)),
    image_urls: [input.referenceUrl, ...(input.styleReferenceUrl ? [input.styleReferenceUrl] : [])],
    num_images: 1,
    resolution: "2K",
    aspect_ratio: kind ? "auto" : "3:2",
    output_format: "png",
    limit_generations: true,
    enable_web_search: false,
  };
}

function falCredentials() {
  const key = process.env.FAL_KEY?.trim();
  if (!key || key.length < 16 || /\s/.test(key)) throw new InfluencerGenerationError("A edição de influencers não está configurada no servidor.");
  return key;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

class FalImageRequestError extends InfluencerGenerationError {
  constructor(message: string, uncertain: boolean, readonly httpStatus: number) { super(message, uncertain); }
}

async function falImageRequest(method: "GET" | "POST", path: string, payload?: ReturnType<typeof buildInfluencerImageEditPayload>) {
  const key = falCredentials();
  try {
    const response = await fetch(`${FAL_QUEUE_ORIGIN}/${path}`, {
      method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(method === "POST" ? 30_000 : 12_000),
      headers: { Authorization: `Key ${key}`, ...(payload ? { "Content-Type": "application/json" } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new FalImageRequestError(response.status === 402 ? "O provedor está sem saldo para editar o influencer." : response.status === 422 || response.status === 400 ? "O provedor recusou a imagem ou as instruções. Revise a edição." : "Não foi possível consultar a plataforma de edição.", method === "POST" && (response.status >= 500 || response.status === 408 || response.status === 409), response.status);
    }
    return object(await response.json());
  } catch (error) {
    if (error instanceof InfluencerGenerationError) throw error;
    throw new InfluencerGenerationError("Não foi possível confirmar a resposta da plataforma de edição. O pedido não foi reenviado.", method === "POST");
  }
}

export async function submitInfluencerImageEdit(payload: ReturnType<typeof buildInfluencerImageEditPayload>) {
  // fal has no documented submit idempotency contract. The database owns the one
  // submission claim; timeouts remain uncertain and are never automatically retried.
  const result = await falImageRequest("POST", INFLUENCER_IMAGE_EDIT_MODEL, payload);
  if (typeof result.request_id !== "string" || !REQUEST_ID.test(result.request_id) || result.request_id.includes(falCredentials())) throw new InfluencerGenerationError("A plataforma não confirmou o identificador da edição. Não reenvie o pedido.", true);
  return { requestId: result.request_id };
}

export async function getInfluencerImageEditStatus(requestId: string, model: string) {
  if (model !== INFLUENCER_IMAGE_EDIT_MODEL || !REQUEST_ID.test(requestId)) throw new InfluencerGenerationError("Pedido de edição inválido.");
  // Only official fixed paths receive the key. Never follow returned status URLs.
  const path = `fal-ai/nano-banana-pro/requests/${requestId}`;
  const status = await falImageRequest("GET", `${path}/status`);
  if (status.status === "IN_QUEUE") return { status: "queued", images: [] as string[] };
  if (status.status === "IN_PROGRESS") return { status: "processing", images: [] as string[] };
  if (status.status !== "COMPLETED") throw new InfluencerGenerationError("A plataforma ainda não confirmou o resultado da edição.");
  if (status.error || status.error_type) return { status: "failed", images: [] as string[] };
  let result: Record<string, unknown>;
  try { result = await falImageRequest("GET", path); }
  catch (error) {
    if (error instanceof FalImageRequestError && [400, 422].includes(error.httpStatus)) return { status: "failed", images: [] as string[] };
    throw error;
  }
  const images = Array.isArray(result.images) ? result.images.flatMap(item => {
    const url = object(item).url;
    return publicImageUrl(url) && allowedFalImageUrl(url) ? [url] : [];
  }).slice(0, 1) : [];
  return { status: result.error ? "failed" : "completed", images };
}

function allowedFalImageUrl(value: string) {
  if (!publicImageUrl(value)) return false;
  const host = new URL(value).hostname;
  return host === "fal.media" || host.endsWith(".fal.media");
}

/** Persist temporary fal output before exposing a finished wardrobe version. */
export async function storeInfluencerEditResult(value: string, userId: string, id: string) {
  if (!allowedFalImageUrl(value)) throw new InfluencerGenerationError("A plataforma retornou uma imagem inválida.");
  // The reader independently checks DNS/private addresses on every redirect and
  // enforces the byte/deadline limits. It never forwards provider credentials.
  const bytes = await readPublicVideo(value, 20 * 1024 * 1024, AbortSignal.timeout(25_000));
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!png || bytes.length < 33 || bytes.toString("ascii", 12, 16) !== "IHDR") throw new InfluencerGenerationError("A edição não entregou uma imagem PNG válida.");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 32_000_000) throw new InfluencerGenerationError("As dimensões da imagem gerada são inválidas.");
  const result = await put(`influencer-images/${userId}/${id}/result.png`, bytes, {
    access: "public", contentType: "image/png", addRandomSuffix: false,
    // Concurrent completion polls can only write the same provider request's
    // output into this new version's isolated path; the original is untouched.
    allowOverwrite: true, abortSignal: AbortSignal.timeout(25_000),
  });
  return result.url;
}
