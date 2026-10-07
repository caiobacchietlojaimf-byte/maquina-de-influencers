"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  adjustCredits,
  createVideo,
  getInfluencer,
  getViral,
  listVirals,
  updateVideo,
  type Viral,
} from "@/lib/db";
import { VIDEO_COST } from "@/lib/costs";
import { mineByUrl, mineTrending } from "@/lib/miner";
import { isConfigured, submitGeneration } from "@/lib/platform";

/** Transferência de movimento com o viral minerado como driving video. */
const MOTION_MODEL = "kling-video/v3/motion-control/std";

export type MinedState = { virals: Viral[]; error?: string };

/** Lista os virais minerados da região; minera se o cache estiver velho. */
export async function getMinedViralsAction(region: string): Promise<MinedState> {
  await requireUser();
  try {
    await mineTrending(region);
    return { virals: listVirals(region) };
  } catch (caught) {
    const cached = listVirals(region);
    return {
      virals: cached,
      ...(cached.length
        ? {}
        : { error: caught instanceof Error ? caught.message : "Mineração indisponível agora" }),
    };
  }
}

/** Força uma nova mineração do feed de tendências. */
export async function refreshViralsAction(region: string): Promise<MinedState> {
  await requireUser();
  try {
    await mineTrending(region, { force: true });
    return { virals: listVirals(region) };
  } catch (caught) {
    return {
      virals: listVirals(region),
      error: caught instanceof Error ? caught.message : "Mineração indisponível agora",
    };
  }
}

/** Importa um vídeo específico (link do TikTok ou .mp4 direto). */
export async function importViralAction(url: string): Promise<MinedState> {
  await requireUser();
  try {
    await mineByUrl(url);
    return { virals: listVirals() };
  } catch (caught) {
    return {
      virals: listVirals(),
      error: caught instanceof Error ? caught.message : "Import falhou",
    };
  }
}

/** Duplica um viral minerado: o influencer performa o movimento do vídeo. */
export async function duplicateMinedViralAction(input: {
  viralId: string;
  influencerId: string;
  extraPrompt?: string;
}): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const influencer = getInfluencer(user.id, input.influencerId);
  if (!influencer?.imageUrl) return { error: "Escolha um influencer já gerado" };
  const viral = getViral(input.viralId);
  if (!viral) return { error: "Viral não encontrado — minere de novo" };

  if (user.credits < VIDEO_COST) {
    return { error: `Créditos insuficientes (precisa de ${VIDEO_COST})` };
  }
  adjustCredits(user.id, -VIDEO_COST);

  const prompt = [
    `Recreate this viral video with the character from the reference image as the protagonist.`,
    `Keep the exact motion, camera movement, timing and energy of the driving video.`,
    viral.title && viral.title !== "Sem legenda" ? `Original video: "${viral.title}".` : "",
    input.extraPrompt?.trim() ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const video = createVideo({
    userId: user.id,
    influencerId: influencer.id,
    kind: "viral",
    presetId: viral.id,
    presetName: viral.title.slice(0, 60),
    prompt,
    status: "processing",
    ...(viral.coverUrl ? { thumbnailUrl: viral.coverUrl } : {}),
  });

  if (!isConfigured()) {
    updateVideo(video.id, { requestId: "demo" });
    revalidatePath("/app", "layout");
    return { id: video.id };
  }

  try {
    const queued = await submitGeneration(MOTION_MODEL, {
      prompt,
      image_url: influencer.imageUrl,
      video_url: viral.playUrl,
      keep_original_sound: "yes",
      character_orientation: "video",
    });
    updateVideo(video.id, { requestId: queued.requestId });
    revalidatePath("/app", "layout");
    return { id: video.id };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    updateVideo(video.id, { status: "failed", error: message });
    adjustCredits(user.id, VIDEO_COST);
    return { error: message };
  }
}
