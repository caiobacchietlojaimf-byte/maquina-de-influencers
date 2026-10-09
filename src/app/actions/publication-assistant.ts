"use server";

import { requireUser } from "@/lib/auth";
import { preparePublication, type PreparationInput } from "@/lib/publication-assistant";
import { getInstagramPerformance } from "@/lib/instagram-performance";
import type { InstagramPerformance, PublicationSuggestion } from "@/lib/publication-assistant-types";

export async function preparePublicationAction(input: PreparationInput): Promise<{ suggestion: PublicationSuggestion } | { error: string }> {
  const user = await requireUser();
  try { return await preparePublication(user.id, input); }
  catch { return { error: "Não foi possível preparar a legenda agora. O texto que você escreveu foi preservado." }; }
}

export async function getInstagramPerformanceAction(): Promise<InstagramPerformance> {
  const user = await requireUser();
  return getInstagramPerformance(user.id);
}
