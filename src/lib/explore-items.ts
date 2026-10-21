/* Item único das três áreas de Explorar virais: vídeo coletado, referência do
   catálogo verificado ou vídeo do YouTube. Mantém a origem e as datas reais de
   cada registro; nada aqui inventa métrica ou data. */

import { AI_PROFILES, type AiProfile, type ProfilePost } from "@/data/ai-profiles";
import { AI_DISCOVERY_PROFILES, isMotionReference } from "./ai-discovery";
import { CHARACTER_VERIFIED, groupCharacters, type CharacterGroup, type CharacterKind } from "./character-discovery";
import type { Viral } from "./db";
import type { ExplorePlatform } from "./explore-format";

export type ExploreOrigin = "catalog" | "collected";

export type ExploreItem = {
  /** "viral:<id>" ou "post:<code>"; único dentro da página. */
  id: string;
  platform: ExplorePlatform;
  title: string;
  authorHandle: string;
  authorName: string;
  pageUrl: string;
  coverUrl: string;
  /** Arquivo reproduzível no player interno. */
  playUrl?: string;
  /** Player oficial da plataforma quando não há arquivo. */
  embed?: { kind: "tiktok" | "youtube"; id: string };
  duration?: number;
  views?: number;
  likes?: number;
  comments?: number;
  /** Quando as métricas foram observadas na origem. */
  metricsAt?: number;
  publishedAt?: number;
  /** Quando a coleta encontrou o vídeo; ausente no catálogo verificado. */
  discoveredAt?: number;
  origin: ExploreOrigin;
  unavailableAt?: number;
  isNew: boolean;
  /** Referência de movimento compatível (arquivo + 3–30 s + disponível). */
  useHref?: string;
  /** Id do registro para renovar o link do arquivo (TikTok). */
  viralId?: string;
  musicTitle?: string;
};

const ALL_TRACKED: readonly string[] = [...new Set<string>([...AI_PROFILES.map((profile) => profile.handle), ...AI_DISCOVERY_PROFILES])];

export function viralItem(viral: Viral, seenAt: number | null): ExploreItem {
  const discoveredAt = viral.discoveredAt ?? (viral.minedAt > 0 ? viral.minedAt : undefined);
  const usable = Boolean(viral.playUrl) && isMotionReference(viral.duration) && !viral.unavailableAt;
  return {
    id: `viral:${viral.id}`,
    platform: viral.source,
    title: viral.title,
    // Feed do YouTube guarda o id do canal (UC…) como identificador; na tela vale o nome do canal.
    authorHandle: viral.source === "youtube" && /^UC[A-Za-z0-9_-]{22}$/.test(viral.authorHandle) ? "" : viral.authorHandle,
    authorName: viral.authorName,
    pageUrl: viral.pageUrl,
    coverUrl: viral.coverUrl,
    ...(viral.playUrl ? { playUrl: viral.playUrl } : {}),
    ...(!viral.playUrl && viral.source === "youtube" && viral.videoId ? { embed: { kind: "youtube" as const, id: viral.videoId } } : {}),
    ...(!viral.playUrl && viral.source === "tiktok" && viral.videoId ? { embed: { kind: "tiktok" as const, id: viral.videoId } } : {}),
    ...(viral.duration > 0 ? { duration: viral.duration } : {}),
    ...(viral.views > 0 ? { views: viral.views } : {}),
    ...(viral.likes > 0 ? { likes: viral.likes } : {}),
    ...(viral.comments > 0 ? { comments: viral.comments } : {}),
    ...(viral.metricsUpdatedAt ? { metricsAt: viral.metricsUpdatedAt } : {}),
    ...(viral.publishedAt ? { publishedAt: viral.publishedAt } : {}),
    ...(discoveredAt ? { discoveredAt } : {}),
    origin: discoveredAt ? "collected" : "catalog",
    ...(viral.unavailableAt ? { unavailableAt: viral.unavailableAt } : {}),
    isNew: seenAt !== null && discoveredAt !== undefined && discoveredAt > seenAt && !viral.unavailableAt,
    ...(usable ? { useHref: `/app/criar-videos?${new URLSearchParams({ viral: viral.id })}` } : {}),
    viralId: viral.id,
    ...(viral.musicTitle ? { musicTitle: viral.musicTitle } : {}),
  };
}

function observedAt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function postItem(profile: AiProfile, post: ProfilePost): ExploreItem {
  const pageUrl = profile.platform === "tiktok" ? `https://www.tiktok.com/@${profile.handle}/video/${post.code}` : `https://www.instagram.com/reel/${post.code}/`;
  const metricsAt = observedAt(post.metrics?.observedAt);
  const usable = Boolean(post.video) && isMotionReference(post.metrics?.duration ?? 0);
  return {
    id: `post:${post.code}`,
    platform: profile.platform,
    title: post.scene,
    authorHandle: profile.handle,
    authorName: profile.name,
    pageUrl,
    coverUrl: post.thumbnail ?? `/reel-thumbs/${post.code}.jpg`,
    ...(post.video ? { playUrl: post.video } : profile.platform === "tiktok" ? { embed: { kind: "tiktok" as const, id: post.code } } : {}),
    ...(post.metrics?.duration ? { duration: post.metrics.duration } : {}),
    ...(post.metrics?.views ? { views: post.metrics.views } : {}),
    ...(post.metrics?.likes ? { likes: post.metrics.likes } : {}),
    ...(post.metrics?.comments ? { comments: post.metrics.comments } : {}),
    ...(metricsAt ? { metricsAt } : {}),
    ...(post.metrics?.postedAt ? { publishedAt: post.metrics.postedAt * 1000 } : {}),
    origin: "catalog",
    isNew: false,
    ...(usable ? { useHref: `/app/criar-videos?${new URLSearchParams({ profile: profile.handle, video: post.code })}` } : {}),
  };
}

export type CharacterSection = {
  key: string;
  handle: string;
  name: string;
  kind: CharacterKind;
  /** Só perfis acompanhados são verificados; os demais são indícios. */
  verified: boolean;
  evidence: string;
  platforms: ExplorePlatform[];
  avatar?: string;
  profileUrl?: string;
  followers?: string;
  bio?: string;
  items: ExploreItem[];
  /** Quantos vêm do catálogo verificado e quantos da coleta. */
  catalogCount: number;
  collectedCount: number;
  newCount: number;
  firstSeenAt?: number;
  lastSeenAt?: number;
};

function postKey(platform: string, code: string): string {
  return `${platform}:${code}`;
}

function viralPostKey(viral: Viral): string | undefined {
  if (viral.source === "tiktok" && viral.videoId) return postKey("tiktok", viral.videoId);
  const reel = /instagram\.com\/(?:reel|reels|p)\/([a-z0-9_-]+)/i.exec(viral.pageUrl)?.[1];
  return reel ? postKey("instagram", reel) : undefined;
}

/** Perfis acompanhados (catálogo + coleta), perfis descobertos e candidatos a revisar,
 *  sem repetir um vídeo que esteja no catálogo e na coleta ao mesmo tempo. */
export function buildCharacterSections(virals: Viral[], seenAt: number | null): CharacterSection[] {
  const groups = groupCharacters(virals, ALL_TRACKED);
  const byHandle = new Map<string, CharacterGroup>();
  for (const group of groups) if (group.kind === "tracked") byHandle.set(group.handle, group);

  const sections: CharacterSection[] = [];
  const handled = new Set<string>();

  // 1) Perfis do catálogo: posts verificados + vídeos coletados do mesmo personagem.
  for (const profile of AI_PROFILES) {
    if (handled.has(profile.handle)) continue;
    handled.add(profile.handle);
    const group = byHandle.get(profile.handle);
    const items = new Map<string, ExploreItem>();
    for (const viral of group?.videos ?? []) {
      const key = viralPostKey(viral) ?? `viral:${viral.id}`;
      items.set(key, viralItem(viral, seenAt));
    }
    for (const post of profile.posts) {
      const key = postKey(profile.platform, post.code);
      const existing = items.get(key);
      if (existing) {
        // O catálogo completa o que a coleta não traz (arquivo local, capa, cena).
        if (!existing.playUrl && post.video) { existing.playUrl = post.video; delete existing.embed; }
        if (!existing.coverUrl) existing.coverUrl = post.thumbnail ?? `/reel-thumbs/${post.code}.jpg`;
        continue;
      }
      items.set(key, postItem(profile, post));
    }
    sections.push(section(profile.handle, `@${profile.handle}`, "tracked", `Perfil acompanhado @${profile.handle}`, [...items.values()], group, profile));
  }

  // 2) Perfis acompanhados só pela coleta (sem catálogo) e descobertas.
  for (const group of groups) {
    if (group.kind === "tracked" && handled.has(group.handle)) continue;
    handled.add(group.handle);
    sections.push(section(group.handle, group.name, group.kind, group.evidence, group.videos.map((viral) => viralItem(viral, seenAt)), group));
  }

  const rank: Record<CharacterKind, number> = { tracked: 0, discovered: 1, candidate: 2 };
  return sections.sort((a, b) => rank[a.kind] - rank[b.kind] || (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0) || b.items.length - a.items.length);
}

function section(handle: string, name: string, kind: CharacterKind, evidence: string, items: ExploreItem[], group?: CharacterGroup, profile?: AiProfile): CharacterSection {
  const sorted = items.sort((a, b) => (b.discoveredAt ?? 0) - (a.discoveredAt ?? 0) || (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || (b.likes ?? 0) - (a.likes ?? 0));
  const platforms: ExplorePlatform[] = [];
  for (const item of sorted) if (!platforms.includes(item.platform)) platforms.push(item.platform);
  if (profile && !platforms.includes(profile.platform)) platforms.unshift(profile.platform);
  const collected = sorted.filter((item) => item.origin === "collected");
  return {
    key: `${kind}:${handle}`, handle, name, kind, verified: CHARACTER_VERIFIED[kind], evidence, platforms,
    ...(profile ? { avatar: profile.avatar, profileUrl: profile.url, followers: profile.followers, bio: profile.bio } : {}),
    items: sorted,
    catalogCount: sorted.length - collected.length,
    collectedCount: collected.length,
    newCount: sorted.filter((item) => item.isNew).length,
    ...(group && group.firstSeenAt > 0 ? { firstSeenAt: group.firstSeenAt } : {}),
    ...(group && group.lastSeenAt > 0 ? { lastSeenAt: group.lastSeenAt } : {}),
  };
}
