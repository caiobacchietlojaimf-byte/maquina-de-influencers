"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  adjustCredits,
  createVideo,
  getInfluencer,
  getViral,
  updateVideo,
  type Viral,
} from "@/lib/db";
import { VIDEO_COST } from "@/lib/costs";
import { isDuplicable, listAiVirals, mineByUrl, mineTrending, refreshViralMedia } from "@/lib/miner";
import { isAiCharacterVideo, isMotionReference, type DiscoveryCursors } from "@/lib/ai-discovery";
import { isConfigured, submitGeneration } from "@/lib/platform";

/** Transferência de movimento com o viral minerado como driving video. */
const MOTION_MODEL = "kling-video/v3/motion-control/std";

export type MinedState = { virals: Viral[]; error?: string; notice?: string; cursors?: DiscoveryCursors; hasMore?: boolean };

/** Lista os virais minerados da região; minera se o cache estiver velho. */
export async function getMinedViralsAction(region = "AI"): Promise<MinedState> {
  await requireUser();
  try {
    const result = await mineTrending(region);
    return { virals: await listAiVirals(), cursors: result.cursors, hasMore: result.hasMore, notice: result.warning };
  } catch (caught) {
    return {
      virals: await listAiVirals(),
      error: caught instanceof Error ? caught.message : "Mineração indisponível agora",
    };
  }
}

/** Força uma nova mineração do feed de tendências. */
export async function refreshViralsAction(region = "AI", cursors?: DiscoveryCursors): Promise<MinedState> {
  await requireUser();
  try {
    const result = await mineTrending(region, { force: true, ...(cursors ? { cursors } : {}) });
    return { virals: await listAiVirals(), cursors: result.cursors, hasMore: result.hasMore,
      notice: result.warning ?? (result.added ? `${result.added} novos vídeos de personagens de IA adicionados.` : "Busca concluída. Nenhum vídeo novo relacionado aos personagens nesta página.") };
  } catch (caught) {
    return {
      virals: await listAiVirals(),
      error: caught instanceof Error ? caught.message : "Mineração indisponível agora",
    };
  }
}

/** Importa um vídeo de IA de uma fonte social reconhecida. */
export async function importViralAction(url: string): Promise<MinedState> {
  await requireUser();
  try {
    const result = await mineByUrl(url);
    return { virals: await listAiVirals(), notice: result.added ? "Vídeo de IA importado." : "Vídeo já está no catálogo." };
  } catch (caught) {
    return {
      virals: await listAiVirals(),
      error: caught instanceof Error ? caught.message : "Import falhou",
    };
  }
}

/** Renew an expired media link from its saved, validated social URL. */
export async function refreshViralMediaAction(id: string): Promise<{ viral: Viral } | { error: string }> {
  await requireUser();
  const viral = await getViral(id);
  if (!viral || !isAiCharacterVideo(viral)) return { error: "Vídeo de IA não encontrado." };
  try { return { viral: await refreshViralMedia(viral) }; }
  catch (caught) { return { error: caught instanceof Error ? caught.message : "Não foi possível atualizar o vídeo." }; }
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
  let viral = await getViral(input.viralId);
  if (!viral) return { error: "Viral não encontrado — minere de novo" };
  if (!isDuplicable(viral)) return { error: "Escolha um vídeo de personagem de IA com duração de 3 a 30 segundos para transferir o movimento." };

  // Resolve expiring CDN links before charging credits or submitting generation.
  if (viral.source === "tiktok" && Date.now() - viral.minedAt > 15 * 60_000) {
    try { viral = await refreshViralMedia(viral); }
    catch (caught) { return { error: caught instanceof Error ? caught.message : "Atualize o vídeo original antes de duplicar." }; }
  }
  let drivingUrl: string;
  try { drivingUrl = publicMediaUrl(viral.playUrl); }
  catch (caught) { return { error: caught instanceof Error ? caught.message : "URL pública do vídeo indisponível." }; }

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
      video_url: drivingUrl,
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

function publicMediaUrl(value: string): string {
  const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const base = process.env.PUBLIC_BASE_URL || process.env.APP_URL || (deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000");
  const url = new URL(value, base);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("URL pública do vídeo inválida.");
  if (isConfigured() && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")) {
    throw new Error("Configure a URL pública do sistema para enviar esta referência de vídeo à geração.");
  }
  return url.href;
}

/** Duplica um reel de perfil de IA: o influencer estrela a mesma cena. */
export async function duplicateProfilePostAction(input: {
  influencerId: string;
  handle: string;
  code: string;
  prompt: string;
  mode?: "scene" | "motion";
}): Promise<{ id: string } | { error: string }> {
  const { getProfile } = await import("@/data/ai-profiles");
  const user = await requireUser();
  const influencer = await getInfluencer(user.id, input.influencerId);
  if (!influencer?.imageUrl) return { error: "Escolha um influencer já gerado" };
  const profile = getProfile(input.handle);
  const postRef = profile?.posts.find((p) => p.code === input.code);
  if (!profile || !postRef) return { error: "Vídeo do perfil não encontrado" };
  const prompt = input.prompt?.trim() || postRef.prompt;
  let drivingUrl: string | undefined;
  if (input.mode === "motion") {
    if (!postRef.video || !isMotionReference(postRef.metrics?.duration ?? 0)) {
      return { error: "A transferência de movimento exige um vídeo disponível com duração confirmada entre 3 e 30 segundos. Use a opção de recriar a cena." };
    }
    try { drivingUrl = publicMediaUrl(postRef.video); }
    catch (caught) { return { error: caught instanceof Error ? caught.message : "URL pública do vídeo indisponível." }; }
  }

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
    const queued = await submitGeneration(drivingUrl ? MOTION_MODEL : I2V_MODEL, drivingUrl ? {
      prompt,
      image_url: influencer.imageUrl,
      video_url: drivingUrl,
      keep_original_sound: "yes",
      character_orientation: "video",
    } : {
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
