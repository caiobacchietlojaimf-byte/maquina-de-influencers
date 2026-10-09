"use server";

import { revalidatePath } from "next/cache";

import { getViralEffect } from "@/data/viral-effects";
import { VIDEO_PRESETS } from "@/data/video-presets";
import { requireUser } from "@/lib/auth";
import {
  adjustCredits,
  claimVideoFinalization,
  createVideo,
  deleteVideo,
  getInfluencer,
  listVideos,
  updateVideo,
  type Video,
} from "@/lib/db";
import { buildViralPrompt } from "@/lib/prompt";
import { getStatus, isConfigured, submitGeneration, TERMINAL_STATUSES } from "@/lib/platform";

import { VIDEO_COST } from "@/lib/costs";
import { finalizeCharacterEdit } from "@/lib/finalize-edit";
import { getFalGenerationStatus } from "@/lib/fal";
import { finalizeSegmentedEdit } from "@/lib/finalize-segmented-edit";

/** Vídeo a partir da imagem do influencer + prompt (tendências virais). */
const I2V_MODEL = "kling-video/v3.0/std/image-to-video";
const DEMO_DELAY_MS = 10000;

type Result = { id: string } | { error: string };

async function charge(userId: string, credits: number): Promise<string | null> {
  if (credits < VIDEO_COST) return `Créditos insuficientes (precisa de ${VIDEO_COST})`;
  await adjustCredits(userId, -VIDEO_COST);
  return null;
}

/** Older clients must go through the costed, signed character-edit preparation. */
export async function createMotionVideoAction(_input: { influencerId: string; presetId?: string; uploadToken?: string; prompt?: string }): Promise<Result> {
  await requireUser();
  return { error: "Atualize Criar Vídeos e prepare a troca de personagem antes de gerar." };
}

/** Duplica uma tendência viral com o influencer como protagonista. */
export async function createViralVideoAction(input: {
  influencerId: string;
  effectId: string;
  extraPrompt?: string;
}): Promise<Result> {
  const user = await requireUser();
  const influencer = await getInfluencer(user.id, input.influencerId);
  if (!influencer?.imageUrl) return { error: "Escolha um influencer já gerado" };
  const effect = getViralEffect(input.effectId);
  if (!effect) return { error: "Tendência não encontrada" };

  const chargeError = await charge(user.id, user.credits);
  if (chargeError) return { error: chargeError };

  const prompt = buildViralPrompt(effect.name, effect.description, input.extraPrompt);

  const video = await createVideo({
    userId: user.id,
    influencerId: influencer.id,
    kind: "viral",
    presetId: effect.id,
    presetName: effect.name,
    prompt,
    status: "processing",
    thumbnailUrl: effect.thumbnail,
  });

  if (!isConfigured()) {
    await updateVideo(video.id, { requestId: "demo" });
    revalidatePath("/app", "layout");
    return { id: video.id };
  }

  try {
    const queued = await submitGeneration(I2V_MODEL, {
      prompt,
      image_url: influencer.imageUrl,
      sound: "on",
      duration: 5,
      cfg_scale: 0.5,
      multi_shots: false,
    });
    await updateVideo(video.id, { requestId: queued.requestId });
    revalidatePath("/app", "layout");
    return { id: video.id };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    await updateVideo(video.id, { status: "failed", error: message });
    await adjustCredits(user.id, VIDEO_COST);
    return { error: message };
  }
}

/** Snapshot dos vídeos do usuário; resolve os pendentes em uma passada. */
export async function pollVideosAction(): Promise<Video[]> {
  const user = await requireUser();
  const pending = (await listVideos(user.id)).filter((v) => v.status === "processing" || v.status === "queued");

  await Promise.all(
    pending.map(async (video) => {
      if (video.requestId === "demo") {
        if (Date.now() - video.createdAt >= DEMO_DELAY_MS) {
          const pick = VIDEO_PRESETS[Math.floor(Math.random() * VIDEO_PRESETS.length)];
          await updateVideo(video.id, { status: "completed", resultUrl: pick.video, thumbnailUrl: pick.poster });
        }
        return;
      }
      if (video.edit?.provider === "fal" && video.status === "queued" && Date.now() - video.createdAt > 300000) {
        const allSubmitted = video.edit.segments?.length && video.edit.segments.every(p => p.requestId);
        await updateVideo(video.id, allSubmitted ? { status: "processing" } : { status: "review", error: "O envio dos trechos foi interrompido. Confira os pedidos registrados no provedor; nenhum trecho será reenviado automaticamente." });
        return;
      }
      if (!video.requestId) return;
      try {
        if (video.edit?.provider === "fal") {
          // Submissions are persisted one by one; queued means not all were sent yet.
          if (video.status !== "processing") return;
          const parts = video.edit.segments ?? [{ sourceUrl: video.edit.sourceUrl, start: 0, source: video.edit.source, requestId: video.requestId }];
          if (parts.some(p => !p.requestId)) return;
          const statuses = await Promise.all(parts.map(p => getFalGenerationStatus(video.edit!.model, p.requestId!)));
          const failed = statuses.find(s => s.status === "failed");
          if (failed) { await updateVideo(video.id, { status: "review", error: `A fal.ai não concluiu a edição: ${failed.error ?? "falha no processamento"}. Nenhuma nova geração foi solicitada.` }); return; }
          if (statuses.some(s => s.status !== "completed" || !s.videoUrl)) return;
          if (await claimVideoFinalization(video)) {
            const urls = statuses.map(s => s.videoUrl!);
            const edit = { ...video.edit, segments: parts.map((p, i) => ({ ...p, resultUrl: urls[i] })) };
            const complete = { ...video, edit };
            // Persist paid results before CPU/network work so an interrupted assembly can be retried for free.
            await updateVideo(video.id, { edit });
            const finalized = parts.length > 1 ? await finalizeSegmentedEdit(complete, urls) : await finalizeCharacterEdit(complete, urls[0]);
            await updateVideo(video.id, { ...finalized, finalizationStartedAt: undefined, ...(finalized.status === "completed" ? { error: undefined } : {}) });
          }
          return;
        }
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
  await deleteVideo(user.id, id);
  revalidatePath("/app", "layout");
}
