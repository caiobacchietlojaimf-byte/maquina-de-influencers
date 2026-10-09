import "server-only";

import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { CHARACTER_TYPES, type CharacterTier } from "@/data/character-types";
import { TRAIT_GROUPS, type Selection } from "@/data/traits";
import { buildBrief } from "@/lib/prompt";

export const INFLUENCER_MODEL = "higgsfield/ai-influencer";
const ORIGIN = "https://api.higgsfield.ai";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateInfluencerInput = {
  requestKey: string;
  name: string;
  tier: CharacterTier;
  selection: Selection;
  referenceUrl?: string;
  styleReferenceUrl?: string;
};

export class InfluencerGenerationError extends Error {
  constructor(message: string, readonly uncertain = false) { super(message); }
}

function credentials() {
  const key = process.env.HF_API_KEY?.trim();
  const origin = process.env.HF_API_BASE_URL?.trim().replace(/\/$/, "") ?? ORIGIN;
  if (!key?.includes(":") || origin !== ORIGIN) throw new InfluencerGenerationError("A geração de influencers não está configurada no servidor.");
  return key;
}

export function checkInfluencerConfiguration(hasReferences: boolean) {
  credentials();
  if (hasReferences && !process.env.BLOB_READ_WRITE_TOKEN) throw new InfluencerGenerationError("O armazenamento das fotos de referência não está configurado.");
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
  for (const value of [input.referenceUrl, input.styleReferenceUrl]) {
    if (value === undefined) continue;
    if (typeof value !== "string") throw new InfluencerGenerationError("Foto de referência inválida.");
    if (storedReferences && publicImageUrl(value)) {
      const url = new URL(value);
      if (!url.hostname.endsWith(".public.blob.vercel-storage.com") || !url.pathname.startsWith(`/influencer-references/${userId}/`)) throw new InfluencerGenerationError("Foto de referência inválida.");
    } else referenceImage(value);
  }
  return { requestKey: input.requestKey, name: input.name.trim(), tier: input.tier, selection, ...(input.referenceUrl ? { referenceUrl: input.referenceUrl } : {}), ...(input.styleReferenceUrl ? { styleReferenceUrl: input.styleReferenceUrl } : {}) };
}

export function influencerRequestIdentity(userId: string, input: CreateInfluencerInput) {
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

export function buildInfluencerPayload(input: Pick<CreateInfluencerInput, "tier" | "selection" | "referenceUrl" | "styleReferenceUrl">, seed: number) {
  if (!Number.isInteger(seed) || seed < 1 || seed > 1_000_000) throw new InfluencerGenerationError("Seed inválida.");
  return {
    tier: input.tier, selection: input.selection, seed, variation_index: 0,
    brief: buildBrief(input.tier, input.selection, { identity: Boolean(input.referenceUrl), style: Boolean(input.styleReferenceUrl) }),
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
