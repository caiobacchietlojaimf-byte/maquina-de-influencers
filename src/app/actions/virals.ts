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
    return { virals: await listVirals(region) };
  } catch (caught) {
    const cached = await listVirals(region);
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
    return { virals: await listVirals(region) };
  } catch (caught) {
    return {
      virals: await listVirals(region),
      error: caught instanceof Error ? caught.message : "Mineração indisponível agora",
    };
  }
}

/** Importa um vídeo específico (link do TikTok ou .mp4 direto). */
export async function importViralAction(url: string): Promise<MinedState> {
  await requireUser();
  try {
    await mineByUrl(url);
    return { virals: await listVirals() };
  } catch (caught) {
    return {
      virals: await listVirals(),
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
  const influencer = await getInfluencer(user.id, input.influencerId);
  if (!influencer?.imageUrl) return { error: "Escolha um influencer já gerado" };
  const viral = await getViral(input.viralId);
  if (!viral) return { error: "Viral não encontrado — minere de novo" };

  if (user.credits < VIDEO_COST) {
    return { error: `Créditos insuficientes (precisa de ${VIDEO_COST})` };
  }
  await adjustCredits(user.id, -VIDEO_COST);

  const prompt = [
    `Recreate this viral video with the character from the reference image as the protagonist.`,
    `Keep the exact motion, camera movement, timing and energy of the driving video.`,
    viral.title && viral.title !== "Sem legenda" ? `Original video: "${viral.title}".` : "",
    input.extraPrompt?.trim() ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const video = await createVideo({
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
    await updateVideo(video.id, { requestId: "demo" });
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

/** Modelo image-to-video para duplicar cenas dos perfis de IA (sem driving video). */
const I2V_MODEL = "kling-video/v3.0/std/image-to-video";

/** Duplica um reel de perfil de IA: o influencer estrela a mesma cena. */
export async function duplicateProfilePostAction(input: {
  influencerId: string;
  handle: string;
  code: string;
  prompt: string;
}): Promise<{ id: string } | { error: string }> {
  const { getProfile } = await import("@/data/ai-profiles");
  const user = await requireUser();
  const influencer = await getInfluencer(user.id, input.influencerId);
  if (!influencer?.imageUrl) return { error: "Escolha um influencer já gerado" };
  const profile = getProfile(input.handle);
  const postRef = profile?.posts.find((p) => p.code === input.code);
  if (!profile || !postRef) return { error: "Vídeo do perfil não encontrado" };
  const prompt = input.prompt?.trim() || postRef.prompt;

  if (user.credits < VIDEO_COST) {
    return { error: `Créditos insuficientes (precisa de ${VIDEO_COST})` };
  }
  await adjustCredits(user.id, -VIDEO_COST);

  const video = await createVideo({
    userId: user.id,
    influencerId: influencer.id,
    kind: "viral",
    presetId: `profile:${profile.handle}:${postRef.code}`,
    presetName: `@${profile.handle} · ${postRef.scene}`.slice(0, 60),
    prompt,
    status: "processing",
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
