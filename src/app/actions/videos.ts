"use server";

import { revalidatePath } from "next/cache";

import { getMotionPreset } from "@/data/motion-presets";
import { getViralEffect } from "@/data/viral-effects";
import { VIDEO_PRESETS } from "@/data/video-presets";
import { requireUser } from "@/lib/auth";
import {
  adjustCredits,
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

/** Transferência de movimento (Genjutsu ≈ Kling Motion Control na Platform API). */
const MOTION_MODEL = "kling-video/v3/motion-control/std";
/** Vídeo a partir da imagem do influencer + prompt (tendências virais). */
const I2V_MODEL = "kling-video/v3.0/std/image-to-video";
const DEMO_DELAY_MS = 10000;

type Result = { id: string } | { error: string };

async function charge(userId: string, credits: number): Promise<string | null> {
  if (credits < VIDEO_COST) return `Créditos insuficientes (precisa de ${VIDEO_COST})`;
  await adjustCredits(userId, -VIDEO_COST);
  return null;
}

/** Vídeo de movimento: aplica um preset Genjutsu ao influencer. */
export async function createMotionVideoAction(input: {
  influencerId: string;
  presetId: string;
  prompt?: string;
}): Promise<Result> {
  const user = await requireUser();
  const influencer = await getInfluencer(user.id, input.influencerId);
  if (!influencer?.imageUrl) return { error: "Escolha um influencer já gerado" };
  const preset = getMotionPreset(input.presetId);
  if (!preset) return { error: "Preset de movimento não encontrado" };

  const chargeError = await charge(user.id, user.credits);
  if (chargeError) return { error: chargeError };

  const prompt =
    input.prompt?.trim() ||
    `The character from the reference image performs the exact motion of the driving video "${preset.name}". Preserve identity, outfit and styling; match the camera movement and timing.`;

  const video = await createVideo({
    userId: user.id,
    influencerId: influencer.id,
    kind: "motion",
    presetId: preset.id,
    presetName: preset.name,
    prompt,
    status: "processing",
    thumbnailUrl: preset.thumbnail,
  });

  if (!isConfigured()) {
    await updateVideo(video.id, { requestId: "demo" });
    revalidatePath("/app", "layout");
    return { id: video.id };
  }

  try {
    const queued = await submitGeneration(MOTION_MODEL, {
      prompt,
      image_url: influencer.imageUrl,
      video_url: preset.drivingVideo,
      keep_original_sound: "yes",
      character_orientation: "video",
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
      if (!video.requestId) return;
      try {
        const status = await getStatus(video.requestId);
        if (!TERMINAL_STATUSES.has(status.status)) return;
        if (status.status === "completed" && status.video?.url) {
          await updateVideo(video.id, { status: "completed", resultUrl: status.video.url });
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
