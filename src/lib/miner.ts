import "server-only";

import { lastMinedAt, upsertVirals, type Viral } from "./db";

/* Mineração de vídeos virais.
   TikTok: feed de tendências por região + resolução de URL via tikwm.com
   (API pública usada pelo ecossistema de downloaders, sem chave).
   Instagram: sem API pública de tendências — entra por import de URL direta
   de vídeo (.mp4) ou permanece com a galeria curada de efeitos. */

const TIKWM = "https://www.tikwm.com/api";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

/** Cache do feed por região: só minera de novo depois desse intervalo. */
const FEED_TTL_MS = 30 * 60_000;

export const MINING_REGIONS = [
  { id: "BR", label: "Brasil" },
  { id: "US", label: "EUA" },
  { id: "ES", label: "Espanha" },
  { id: "JP", label: "Japão" },
] as const;

type TikwmItem = {
  video_id?: string;
  id?: string;
  title?: string;
  cover?: string;
  origin_cover?: string;
  duration?: number;
  play?: string;
  play_count?: number;
  digg_count?: number;
  comment_count?: number;
  share_count?: number;
  region?: string;
  music_info?: { title?: string };
  author?: { unique_id?: string; nickname?: string };
};

async function tikwm(pathAndQuery: string): Promise<unknown> {
  const response = await fetch(`${TIKWM}${pathAndQuery}`, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Mineração falhou (HTTP ${response.status})`);
  const payload = (await response.json()) as { code?: number; msg?: string; data?: unknown };
  if (payload.code !== 0) throw new Error(payload.msg || "Mineração falhou");
  return payload.data;
}

function toViral(item: TikwmItem, region: string): Omit<Viral, "id"> | null {
  const videoId = item.video_id ?? item.id;
  const play = item.play;
  if (!videoId || !play) return null;
  const handle = item.author?.unique_id ?? "";
  return {
    source: "tiktok",
    videoId,
    pageUrl: handle
      ? `https://www.tiktok.com/@${handle}/video/${videoId}`
      : `https://www.tiktok.com/video/${videoId}`,
    playUrl: play.startsWith("http") ? play : `https://www.tikwm.com${play}`,
    coverUrl: item.origin_cover || item.cover || "",
    title: (item.title || "").trim() || "Sem legenda",
    authorName: item.author?.nickname ?? handle ?? "Desconhecido",
    authorHandle: handle,
    duration: item.duration ?? 0,
    views: item.play_count ?? 0,
    likes: item.digg_count ?? 0,
    comments: item.comment_count ?? 0,
    shares: item.share_count ?? 0,
    ...(item.music_info?.title ? { musicTitle: item.music_info.title } : {}),
    region: item.region && item.region.length === 2 ? region : region,
    minedAt: Date.now(),
  };
}

/** Minera o feed de tendências de uma região. Respeita o TTL salvo no banco,
    a menos que `force`. Devolve quantos vídeos novos entraram. */
export async function mineTrending(region: string, options?: { force?: boolean }): Promise<number> {
  if (!options?.force && Date.now() - lastMinedAt(region) < FEED_TTL_MS) return 0;
  const data = (await tikwm(`/feed/list?region=${encodeURIComponent(region)}&count=18`)) as
    | TikwmItem[]
    | null;
  if (!Array.isArray(data)) throw new Error("Feed de tendências vazio");
  const virals = data
    .map((item) => toViral(item, region))
    .filter((v): v is Omit<Viral, "id"> => v !== null);
  return upsertVirals(virals);
}

const TIKTOK_URL = /tiktok\.com\//i;
const DIRECT_VIDEO = /^https?:\/\/\S+\.(mp4|mov|webm)(\?\S*)?$/i;
const INSTAGRAM_URL = /instagram\.com\/(reel|reels|p)\//i;

/** Importa um vídeo específico por URL (TikTok resolvido via tikwm; mp4 direto
    aceito de qualquer origem, inclusive links de CDN do Instagram). */
export async function mineByUrl(url: string): Promise<{ added: boolean; title: string }> {
  const clean = url.trim();
  if (TIKTOK_URL.test(clean)) {
    const data = (await tikwm(`/?url=${encodeURIComponent(clean)}`)) as TikwmItem | null;
    const viral = data ? toViral(data, "BR") : null;
    if (!viral) throw new Error("Não consegui ler esse vídeo do TikTok");
    viral.pageUrl = clean;
    upsertVirals([viral]);
    return { added: true, title: viral.title };
  }
  if (DIRECT_VIDEO.test(clean)) {
    const title = decodeURIComponent(clean.split("/").pop()?.split("?")[0] ?? "Vídeo importado");
    upsertVirals([
      {
        source: "url",
        pageUrl: clean,
        playUrl: clean,
        coverUrl: "",
        title,
        authorName: "Importado por URL",
        authorHandle: "",
        duration: 0,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        region: "BR",
        minedAt: Date.now(),
      },
    ]);
    return { added: true, title };
  }
  if (INSTAGRAM_URL.test(clean)) {
    throw new Error(
      "O Instagram não expõe o arquivo do Reel publicamente. Abra o Reel, copie o link direto do vídeo (.mp4) e cole aqui — ou use uma tendência do TikTok.",
    );
  }
  throw new Error("Cole um link do TikTok ou uma URL direta de vídeo (.mp4)");
}
