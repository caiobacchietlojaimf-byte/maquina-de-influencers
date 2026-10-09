"use server";

import { requireUser } from "@/lib/auth";
import { preparePublication, improvePublication, type PreparationInput, type ImprovementInput } from "@/lib/publication-assistant";
import { getInstagramPerformance, getInstagramPostInsights } from "@/lib/instagram-performance";
import type { InstagramPerformance, InstagramPostInsights, PublicationSuggestion } from "@/lib/publication-assistant-types";

export async function preparePublicationAction(input: PreparationInput): Promise<{ suggestion: PublicationSuggestion } | { error: string }> {
  const user = await requireUser();
  try { return await preparePublication(user.id, input); }
  catch { return { error: "Não foi possível preparar a legenda agora. O texto que você escreveu foi preservado." }; }
}

export async function getInstagramPerformanceAction(): Promise<InstagramPerformance> {
  const user = await requireUser();
  return getInstagramPerformance(user.id);
}

export async function getInstagramPostInsightsAction(postId: string): Promise<InstagramPostInsights> {
  const user = await requireUser();
  return getInstagramPostInsights(user.id, postId);
}

export async function improvePublicationAction(input: ImprovementInput): Promise<{ suggestion: PublicationSuggestion } | { error: string }> {
  const user = await requireUser();
  try { return await improvePublication(user.id, input); }
  catch { return { error: "Não foi possível melhorar o post agora. Sua legenda foi preservada." }; }
}
