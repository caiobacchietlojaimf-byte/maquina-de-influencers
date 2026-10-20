/* Agrupamento dos vídeos coletados por personagem/perfil (cliente e servidor).
   Nada aqui classifica alguém como personagem de IA pela aparência. Só o perfil
   acompanhado (catálogo ou lista de descoberta) conta como verificado; termos
   de IA no nome do autor ou no título são indícios e deixam o perfil como
   "não verificado" até alguém confirmar na origem. */

import { AI_DISCOVERY_PROFILES, isAiCharacterVideo, matchesAiProfile } from "./ai-discovery";
import type { Viral } from "./db";

/** tracked = verificado; discovered/candidate = indícios, não verificados. */
export type CharacterKind = "tracked" | "discovered" | "candidate";
export const CHARACTER_VERIFIED: Record<CharacterKind, boolean> = { tracked: true, discovered: false, candidate: false };

export type CharacterGroup = {
  key: string;
  /** Perfil acompanhado (handle) ou autor descoberto. */
  handle: string;
  name: string;
  kind: CharacterKind;
  platforms: Viral["source"][];
  videos: Viral[];
  /** De onde vem a evidência de ser personagem de IA. */
  evidence: string;
  firstSeenAt: number;
  lastSeenAt: number;
  coverUrl: string;
};

const AI_TERMS = /#(?:ai|ia)\b|\bai[ -]+(?:generated|character|influencer|avatar|model)|(?:personagem|influencer|avatar)\s+(?:(?:de|com|por)\s+)?ia\b|artificial\s+intelligence|inteligencia\s+artificial|virtual\s+(?:influencer|character|model)|(?:personagem|influencer|avatar)virtual/i;

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function discovered(viral: Viral): number {
  return viral.discoveredAt ?? viral.minedAt;
}

function trackedProfile(viral: Viral, tracked: readonly string[]): string | undefined {
  // O handle exato do autor vence apelidos e menções: @moroniduarte0 fica no
  // próprio perfil quando ele é acompanhado, não no perfil que o cita.
  const author = normalize(viral.authorHandle.replace(/^@/, ""));
  return tracked.find((handle) => normalize(handle) === author) ?? tracked.find((handle) => matchesAiProfile(viral, handle));
}

/** Agrupa por perfil acompanhado ou, fora deles, por autor na plataforma. */
export function groupCharacters(virals: Viral[], tracked: readonly string[] = AI_DISCOVERY_PROFILES): CharacterGroup[] {
  const groups = new Map<string, CharacterGroup>();
  const seen = new Set<string>();
  for (const viral of virals) {
    if (!isAiCharacterVideo(viral)) continue;
    const identity = viral.videoId ? `${viral.source}:${viral.videoId}` : `${viral.source}:${viral.pageUrl}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const profile = trackedProfile(viral, tracked);
    const handle = profile ?? normalize(viral.authorHandle || viral.authorName || "desconhecido").replace(/^@/, "");
    const key = profile ? `tracked:${profile}` : `author:${viral.source}:${handle}`;
    const authorHasAiTerms = AI_TERMS.test(normalize(`${viral.authorName} ${viral.authorHandle}`));
    const evidence = profile
      ? `Perfil acompanhado @${profile}`
      : authorHasAiTerms
        ? "Indício: nome do autor cita personagem de IA (não confirmado na origem)"
        : "Indício: termos de IA no título do vídeo (não confirmado na origem)";
    const existing = groups.get(key);
    if (existing) {
      existing.videos.push(viral);
      if (!existing.platforms.includes(viral.source)) existing.platforms.push(viral.source);
      existing.firstSeenAt = Math.min(existing.firstSeenAt, discovered(viral) || existing.firstSeenAt);
      existing.lastSeenAt = Math.max(existing.lastSeenAt, discovered(viral));
      if (!existing.coverUrl && viral.coverUrl) existing.coverUrl = viral.coverUrl;
      if (authorHasAiTerms && existing.kind === "candidate") { existing.kind = "discovered"; existing.evidence = evidence; }
      continue;
    }
    groups.set(key, {
      key, handle, name: profile ? `@${profile}` : viral.authorName || `@${handle}`,
      kind: profile ? "tracked" : authorHasAiTerms ? "discovered" : "candidate",
      platforms: [viral.source], videos: [viral], evidence,
      firstSeenAt: discovered(viral), lastSeenAt: discovered(viral), coverUrl: viral.coverUrl,
    });
  }
  for (const group of groups.values()) {
    // Autor desconhecido com vários vídeos de IA deixa de ser só um candidato.
    if (group.kind === "candidate" && group.videos.length >= 2) { group.kind = "discovered"; group.evidence = `Indício: ${group.videos.length} vídeos com termos de IA no título (não confirmado na origem)`; }
    group.videos.sort((a, b) => discovered(b) - discovered(a));
  }
  const rank: Record<CharacterKind, number> = { tracked: 0, discovered: 1, candidate: 2 };
  return [...groups.values()].sort((a, b) => rank[a.kind] - rank[b.kind] || b.lastSeenAt - a.lastSeenAt || b.videos.length - a.videos.length);
}
