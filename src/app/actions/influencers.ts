"use server";

import { revalidatePath } from "next/cache";

import PRESETS from "@/data/influencer-presets.json";
import type { CharacterTier } from "@/data/character-types";
import { pruneSelection, type Selection } from "@/data/traits";
import { requireUser } from "@/lib/auth";
import {
  adjustCredits,
  createInfluencer,
  deleteInfluencer,
  getInfluencer,
  listInfluencers,
  updateInfluencer,
  type Influencer,
} from "@/lib/db";
import { buildBrief } from "@/lib/prompt";
import { getStatus, isConfigured, submitGeneration, TERMINAL_STATUSES } from "@/lib/platform";

import { SHEET_COST } from "@/lib/costs";

/** Modelo de imagem usado para o character sheet (Higgsfield Soul). */
const SHEET_MODEL = "higgsfield-ai/soul/v2/standard";
const DEMO_DELAY_MS = 8000;

export type CreateInfluencerInput = {
  name: string;
  tier: CharacterTier;
  selection: Selection;
  referenceUrl?: string;
};

export async function createInfluencerAction(input: CreateInfluencerInput): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const name = input.name?.trim() || "Influencer sem nome";
  const tier = input.tier;
  const selection = pruneSelection(input.selection ?? {}, tier);
  const brief = buildBrief(tier, selection);
  const seed = Math.floor(Math.random() * 100000);

  if (user.credits < SHEET_COST) {
    return { error: `Créditos insuficientes (precisa de ${SHEET_COST})` };
  }

  const influencer = await createInfluencer({
    userId: user.id,
    name,
    tier,
    selection,
    brief,
    seed,
    status: "processing",
    ...(input.referenceUrl ? { referenceUrl: input.referenceUrl } : {}),
  });

  if (!isConfigured()) {
    // Modo demonstração: sem HF_API_KEY, a geração resolve sozinha com um
    // preset oficial compatível com o tier, para o fluxo inteiro ser navegável.
    await updateInfluencer(influencer.id, { requestId: "demo" });
    await adjustCredits(user.id, -SHEET_COST);
    revalidatePath("/app", "layout");
    return { id: influencer.id };
  }

  try {
    const queued = await submitGeneration(SHEET_MODEL, {
      prompt: brief,
      batch_size: 4,
      resolution: "1080p",
      aspect_ratio: "3:4",
      enhance_prompt: false,
    });
    await updateInfluencer(influencer.id, { requestId: queued.requestId, status: "processing" });
    await adjustCredits(user.id, -SHEET_COST);
    revalidatePath("/app", "layout");
    return { id: influencer.id };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    await updateInfluencer(influencer.id, { status: "failed", error: message });
    return { error: message };
  }
}

/** Snapshot dos influencers do usuário; resolve os pendentes em uma passada. */
export async function pollInfluencersAction(): Promise<Influencer[]> {
  const user = await requireUser();
  const pending = (await listInfluencers(user.id)).filter((i) => i.status === "processing" || i.status === "queued");

  await Promise.all(
    pending.map(async (influencer) => {
      if (influencer.requestId === "demo") {
        if (Date.now() - influencer.createdAt >= DEMO_DELAY_MS) {
          const pool = (PRESETS as Array<{ tier: string; preview: { url: string }; sheet: { url: string } }>).filter(
            (p) => p.tier === influencer.tier,
          );
          const all = pool.length ? pool : (PRESETS as Array<{ preview: { url: string }; sheet: { url: string } }>);
          const pick = all[Math.floor(Math.random() * all.length)];
          await updateInfluencer(influencer.id, {
            status: "completed",
            imageUrl: pick.preview.url,
            gallery: [pick.sheet.url],
          });
        }
        return;
      }
      if (!influencer.requestId) return;
      try {
        const status = await getStatus(influencer.requestId);
        if (!TERMINAL_STATUSES.has(status.status)) return;
        if (status.status === "completed" && status.images?.length) {
          await updateInfluencer(influencer.id, {
            status: "completed",
            imageUrl: status.images[0].url,
            gallery: status.images.slice(1).map((image) => image.url),
          });
        } else {
          await updateInfluencer(influencer.id, {
            status: "failed",
            error: typeof status.error === "string" ? status.error : `Geração ${status.status}`,
          });
        }
      } catch {
        /* Falha transitória de rede: tenta de novo na próxima rodada. */
      }
    }),
  );

  return listInfluencers(user.id);
}

export async function deleteInfluencerAction(id: string): Promise<void> {
  const user = await requireUser();
  await deleteInfluencer(user.id, id);
  revalidatePath("/app", "layout");
}

export async function renameInfluencerAction(id: string, value: string): Promise<{ name: string } | { error: string }> {
  const user = await requireUser();
  if (typeof value !== "string" || typeof id !== "string") return { error: "Nome inválido." };
  const name = value.trim();
  if (!name || name.length > 80) return { error: "Use um nome de 1 a 80 caracteres." };
  try {
    const influencer = await updateInfluencer(id, { name }, user.id);
    if (!influencer) return { error: "Influencer não encontrado." };
    revalidatePath("/app", "layout");
    return { name: influencer.name };
  } catch {
    return { error: "Não foi possível salvar o nome. Tente novamente." };
  }
}

export async function retryInfluencerAction(id: string): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const influencer = await getInfluencer(user.id, id);
  if (!influencer) return { error: "Influencer não encontrado" };
  return createInfluencerAction({
    name: influencer.name,
    tier: influencer.tier as CharacterTier,
    selection: influencer.selection,
    ...(influencer.referenceUrl ? { referenceUrl: influencer.referenceUrl } : {}),
  });
}
