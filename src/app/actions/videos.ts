"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getViralEffect } from "@/data/viral-effects";
import { requireUser } from "@/lib/auth";
import {
  adjustCredits,
  reserveVideoCredits,
  claimVideoFinalization,
  createVideoOnce,
  deleteVideo,
  getInfluencer,
  getVideo,
  listVideos,
  updateVideo,
  type Video,
} from "@/lib/db";
import { buildViralPrompt } from "@/lib/prompt";
import { getStatus, isConfigured, submitGeneration, PlatformError, TERMINAL_STATUSES } from "@/lib/platform";

import { VIDEO_COST } from "@/lib/costs";
import { CREDIT_PRICING_VERSION } from "@/lib/credit-pricing";
import { finalizeCharacterEdit } from "@/lib/finalize-edit";
import { reconcileFalVideo } from "@/lib/reconcile-fal-video";

/** Vídeo a partir da imagem do influencer + prompt (tendências virais). */
const I2V_MODEL = "kling-video/v3.0/std/image-to-video";

type Result = { id: string } | { error: string; retryable?: boolean };

async function charge(userId: string, credits: number): Promise<string | null> {
  if (credits < VIDEO_COST) return `Créditos insuficientes (precisa de ${VIDEO_COST})`;
  if (!await reserveVideoCredits(userId, VIDEO_COST)) return `Créditos insuficientes (precisa de ${VIDEO_COST})`;
  return null;
}

/** Older clients must go through the costed, signed character-edit preparation. */
export async function createMotionVideoAction(_input: { influencerId: string; presetId?: string; uploadToken?: string; prompt?: string }): Promise<Result> {
  await requireUser();
  return { error: "Atualize Criar Vídeos e prepare a troca de personagem antes de gerar." };
}

/** Duplica uma tendência viral com o influencer como protagonista. */
export async function createViralVideoAction(input: {
  requestKey: string;
  influencerId: string;
  effectId: string;
  extraPrompt?: string;
}): Promise<Result> {
  const user = await requireUser();
  if (!input || typeof input.requestKey !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.requestKey)
    || typeof input.influencerId !== "string" || !input.influencerId || input.influencerId.length > 100
    || typeof input.effectId !== "string" || !input.effectId || input.effectId.length > 100
    || (input.extraPrompt !== undefined && (typeof input.extraPrompt !== "string" || input.extraPrompt.length > 2000))) return { error: "Atualize a página e confira os dados antes de gerar.", retryable: false };
  const hash = createHash("sha256").update(`viral:${user.id}:${input.requestKey}`).digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  const fingerprint = createHash("sha256").update(JSON.stringify([input.influencerId, input.effectId, input.extraPrompt?.trim() ?? ""])).digest("hex");
  const existing = await getVideo(user.id, id);
  if (existing) {
    if (existing.deletedAt || existing.requestFingerprint !== fingerprint) return { error: "Este pedido já foi utilizado. Inicie uma nova criação.", retryable: false };
    return existing.status === "failed" ? { error: existing.error ?? "Este pedido falhou. Inicie uma nova tentativa.", retryable: true } : { id };
  }
  const influencer = await getInfluencer(user.id, input.influencerId);
  if (!influencer?.imageUrl || influencer.deletedAt || influencer.status !== "completed") return { error: "Escolha um influencer já gerado" };
  const effect = getViralEffect(input.effectId);
  if (!effect) return { error: "Tendência não encontrada" };
  if (!isConfigured()) return { error: "A API de geração ainda não está configurada. Nenhum crédito foi cobrado." };

  const prompt = buildViralPrompt(effect.name, effect.description, input.extraPrompt);

  const video: Video = {
    id, createdAt: Date.now(), requestFingerprint: fingerprint,
    userId: user.id,
    influencerId: influencer.id,
    kind: "viral",
    presetId: effect.id,
    presetName: effect.name,
    prompt,
    status: "queued",
    thumbnailUrl: effect.thumbnail,
    creditCost: VIDEO_COST,
    creditPricingVersion: CREDIT_PRICING_VERSION,
  };
  if (!await createVideoOnce(video)) return { id };
  const chargeError = await charge(user.id, user.credits);
  if (chargeError) { await updateVideo(id, { status: "failed", error: chargeError }); return { error: chargeError, retryable: true }; }
  let acceptedRequestId: string | undefined;
  try {
    const queued = await submitGeneration(I2V_MODEL, {
      prompt,
      image_url: influencer.imageUrl,
      sound: "on",
      duration: 5,
      cfg_scale: 0.5,
      multi_shots: false,
    });
    acceptedRequestId = queued.requestId;
    await updateVideo(video.id, { status: "processing", requestId: queued.requestId });
    revalidatePath("/app", "layout");
    return { id: video.id };
  } catch (caught) {
    const uncertain = Boolean(acceptedRequestId) || !(caught instanceof PlatformError) || caught.status >= 500 || caught.status === 408;
    const message = uncertain ? "A confirmação da geração está pendente. Confira este pedido antes de tentar novamente; ele não será reenviado automaticamente." : caught.message;
    await updateVideo(video.id, { status: uncertain ? (acceptedRequestId ? "processing" : "review") : "failed", ...(acceptedRequestId ? { requestId: acceptedRequestId } : {}), error: message });
    if (!uncertain) await adjustCredits(user.id, VIDEO_COST);
    revalidatePath("/app", "layout");
    return uncertain ? { id } : { error: message, retryable: true };
  }
}

/** Snapshot dos vídeos do usuário; resolve os pendentes em uma passada. */
export async function pollVideosAction(): Promise<Video[]> {
  const user = await requireUser();
  const pending = (await listVideos(user.id)).filter((v) => v.status === "processing" || v.status === "queued");

  await Promise.all(
    pending.map(async (video) => {
      if (video.requestId === "demo") {
        await updateVideo(video.id, { status: "failed", error: "Este pedido antigo era uma demonstração e não foi enviado à IA. Inicie uma criação real." });
        return;
      }
      if (video.edit?.provider === "fal") {
        await reconcileFalVideo(video);
        return;
      }
      if (!video.requestId) {
        if (Date.now() - video.createdAt > 300_000) await updateVideo(video.id, { status: "review", error: "O envio deste pedido não foi confirmado. Confira o provedor antes de iniciar outro; nenhum vídeo foi reenviado." });
        return;
      }
      try {
        const status = await getStatus(video.requestId);
        if (!TERMINAL_STATUSES.has(status.status)) return;
        if (status.status === "completed" && status.video?.url) {
          if (video.edit) {
            if (await claimVideoFinalization(video)) {
              await updateVideo(video.id, { resultUrl: status.video.url });
              const finalized = await finalizeCharacterEdit(video, status.video.url);
              await updateVideo(video.id, { ...finalized, finalizationStartedAt: undefined, ...(finalized.status === "completed" ? { error: undefined } : {}) });
            }
          } else await updateVideo(video.id, { status: "completed", resultUrl: status.video.url });
        } else {
          await updateVideo(video.id, {
            status: "failed",
            error: typeof status.error === "string" ? status.error : `Geração ${status.status}`,
          });
        }
      } catch {
        /* Falha transitória: tenta na próxima rodada. */
      }
    }),
  );

  return listVideos(user.id);
}

export async function deleteVideoAction(id: string): Promise<void> {
  const user = await requireUser();
  if (!await deleteVideo(user.id, id)) throw new Error("Não foi possível excluir este vídeo. Aguarde a confirmação do pedido e tente novamente.");
  revalidatePath("/app", "layout");
}
