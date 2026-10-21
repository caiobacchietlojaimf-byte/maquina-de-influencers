/* Efeitos virais: o que é executável e o que é só inspiração (cliente e servidor).
   - Executável: entrada do catálogo fixo VIRAL_EFFECTS. O sistema tem a
     configuração completa: prompt do efeito, modelo Kling (motion control, 5 s)
     e custo VIDEO_COST, cobrados por createViralVideoAction.
   - Tendência descoberta: vídeo coletado das fontes cujo título, legenda ou
     música cita um efeito do catálogo ou vocabulário de efeito visual (ver
     EFFECT_VOCABULARY). Serve de inspiração e, quando tem arquivo e 3–30 s,
     de referência de movimento. Nunca vira "Aplicar efeito" sozinho: isso
     exige validar prompt, modelo e custo. Vídeo coletado sem esse sinal não
     entra na lista. */

import { VIRAL_EFFECTS, type ViralEffect } from "@/data/viral-effects";
import { isMotionReference } from "./ai-discovery";
import { VIDEO_COST } from "./costs";
import type { Viral } from "./db";

/** O alcance ilustrativo do catálogo fica de fora: no app só aparecem métricas reais. */
export type ExecutableEffect = Omit<ViralEffect, "views"> & { executable: true; model: string; cost: number; durationSeconds: number };

export const EFFECT_MODEL = "kling-video/v3/motion-control/std";
export const EFFECT_DURATION_S = 5;

export function listExecutableEffects(): ExecutableEffect[] {
  return VIRAL_EFFECTS.map(({ views: _views, ...effect }) => ({ ...effect, executable: true, model: EFFECT_MODEL, cost: VIDEO_COST, durationSeconds: EFFECT_DURATION_S }));
}

export function isExecutableEffect(id: string): boolean {
  return VIRAL_EFFECTS.some((effect) => effect.id === id);
}

/** Plataformas com pelo menos um efeito, na ordem do catálogo. */
export function effectPlatforms(): ViralEffect["platform"][] {
  const seen: ViralEffect["platform"][] = [];
  for (const effect of VIRAL_EFFECTS) if (!seen.includes(effect.platform)) seen.push(effect.platform);
  return seen;
}

export type DiscoveredTrend = {
  viral: Viral;
  usableAsReference: boolean;
  discoveredAt: number;
  /** Efeitos do catálogo citados pelo vídeo (nome ou tag). */
  relatedEffects: ViralEffect[];
  /** Termos que fizeram o vídeo entrar na lista. */
  matchedTerms: string[];
};

/** Vocabulário de efeito visual (PT/EN) além dos nomes e tags do catálogo. */
export const EFFECT_VOCABULARY: readonly string[] = [
  "efeito", "efeitos", "effect", "vfx", "cgi", "transicao", "transition", "clone", "clones",
  "slow motion", "camera lenta", "slowmo", "flutua", "flutuando", "floating", "levita",
  "desaparece", "sumiu", "vanish", "derrete", "melting", "congela", "congelado", "frozen", "freeze",
  "gigante", "colossus", "giant", "morph", "morphing", "zoom infinito", "loop infinito", "ilusao", "illusion",
  "gravidade", "gravity", "teleporte", "teleport", "glitch", "duplo", "dublê", "clonado", "espelho", "mirror",
];

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function hasTerm(text: string, term: string): boolean {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}(s|es)?($|[^a-z0-9])`).test(text);
}

/** Tags do catálogo genéricas demais para, sozinhas, indicar um efeito. */
const GENERIC_TAGS = new Set(["câmera", "moda", "produto", "ação", "cidade", "rua", "tempo", "ads", "comédia", "narrativa", "estúdio", "lookbook", "viagem", "escala", "drama", "carros", "cinema", "fantasia", "épico", "cenário", "dança", "gancho"]);

/** Por que um vídeo coletado conta como referência de efeito (vazio = não conta). */
export function effectRelevance(viral: Pick<Viral, "title" | "sourceCaption" | "musicTitle">): { relatedEffects: ViralEffect[]; matchedTerms: string[] } {
  const text = normalize(`${viral.title} ${viral.sourceCaption ?? ""} ${viral.musicTitle ?? ""}`);
  const matchedTerms: string[] = [];
  const relatedEffects: ViralEffect[] = [];
  // Um termo por raiz: "Clones", "clones" e "clone" contam uma vez só.
  const add = (term: string) => { const root = normalize(term).replace(/(es|s)$/, ""); if (!matchedTerms.some((known) => normalize(known).replace(/(es|s)$/, "") === root)) matchedTerms.push(term.toLowerCase()); };
  for (const effect of VIRAL_EFFECTS) {
    const hits = [effect.name, ...effect.tags.filter((tag) => !GENERIC_TAGS.has(tag))].filter((term) => term.length >= 4 && hasTerm(text, term));
    if (!hits.length) continue;
    relatedEffects.push(effect);
    hits.forEach(add);
  }
  for (const term of EFFECT_VOCABULARY) if (hasTerm(text, term)) add(term);
  return { relatedEffects, matchedTerms };
}

/** Tendências descobertas pelas fontes (nunca o catálogo local) que citam um efeito: só inspiração. */
export function discoveredTrends(virals: Viral[], limit = 12): DiscoveredTrend[] {
  return virals
    .filter((viral) => (viral.discoveredAt ?? viral.minedAt) > 0 && !viral.unavailableAt)
    .map((viral) => ({ viral, ...effectRelevance(viral) }))
    .filter((entry) => entry.matchedTerms.length > 0)
    .sort((a, b) => (b.viral.discoveredAt ?? b.viral.minedAt) - (a.viral.discoveredAt ?? a.viral.minedAt))
    .slice(0, limit)
    .map(({ viral, relatedEffects, matchedTerms }) => ({ viral, relatedEffects, matchedTerms, usableAsReference: Boolean(viral.playUrl) && isMotionReference(viral.duration), discoveredAt: viral.discoveredAt ?? viral.minedAt }));
}
