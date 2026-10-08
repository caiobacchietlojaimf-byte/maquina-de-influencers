"use server";


import { requireUser } from "@/lib/auth";
import {
  getViral,
  type Viral,
} from "@/lib/db";
import { listAiVirals, mineByUrl, mineTrending, refreshViralMedia } from "@/lib/miner";
import { isAiCharacterVideo, type DiscoveryCursors } from "@/lib/ai-discovery";


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

/** Compatibility guards: an old tab must not submit the former Kling recreation. */
export async function duplicateMinedViralAction(_input: { viralId: string; influencerId: string; extraPrompt?: string }): Promise<{ id: string } | { error: string }> {
  await requireUser();
  return { error: "Abra esta referência em Criar Vídeos e prepare a troca de personagem." };
}
export async function duplicateProfilePostAction(_input: { influencerId: string; handle: string; code: string; prompt: string; mode?: "scene" | "motion" }): Promise<{ id: string } | { error: string }> {
  await requireUser();
  return { error: "Abra esta referência em Criar Vídeos e prepare a troca de personagem." };
}
