import "server-only";

import type { Viral } from "./db";
import { isAiCharacterVideo } from "./ai-discovery";

/* Descoberta no YouTube pela API oficial (YouTube Data API v3). Complemento
   desligado por padrão (ver youtubeDiscoveryEnabled em viral-collector).
   Cota, conforme a documentação oficial consultada em 2026-10-20
   (developers.google.com/youtube/v3/determine_quota_cost e /getting-started):
   - search.list tem bucket próprio: 100 chamadas por dia, 1 por chamada;
   - os demais métodos (videos.list = 1 unidade) dividem 10.000 unidades/dia;
   - toda requisição, inclusive inválida, custa pelo menos 1 unidade;
   - as cotas reiniciam à meia-noite no horário do Pacífico;
   - ao estourar, a API responde HTTP 403 com reason "quotaExceeded"
     (developers.google.com/youtube/v3/docs/errors).
   O coletor faz no máximo 2 buscas por hora (48 search.list + 48 videos.list
   por dia), bem abaixo dos dois limites. Não há arquivo de vídeo: a
   reprodução é pelo player oficial (embed) e o vídeo não serve como
   referência de movimento. */

const API = "https://www.googleapis.com/youtube/v3";
const REQUEST_TIMEOUT_MS = 10_000;

export const YOUTUBE_QUERIES = ["AI influencer character", "personagem de IA influencer", "AI virtual influencer shorts", "influencer virtual IA"] as const;
/** Custos oficiais: search.list conta no bucket próprio (1 chamada); videos.list = 1 unidade. */
export const YOUTUBE_SEARCH_CALLS_PER_DAY = 100;
export const YOUTUBE_SEARCH_COST = 1;
export const YOUTUBE_LIST_COST = 1;

export class YoutubeProviderError extends Error {
  constructor(message: string, readonly quotaExceeded = false) { super(message); }
}

export function youtubeConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY?.trim());
}

type SearchItem = { id?: { videoId?: string } };
type VideoItem = {
  id?: string;
  snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

/** ISO 8601 (PT1M5S) → segundos inteiros; inválido vira 0. */
export function parseIsoDuration(value: string | undefined): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value ?? "");
  if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function count(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

export function toYoutubeViral(item: VideoItem, now = Date.now()): Omit<Viral, "id"> | null {
  const videoId = item.id;
  if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
  const snippet = item.snippet ?? {};
  const title = (snippet.title ?? "").trim();
  const thumbs = snippet.thumbnails ?? {};
  const cover = thumbs.maxres?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || "";
  const published = snippet.publishedAt ? Date.parse(snippet.publishedAt) : NaN;
  return {
    source: "youtube", videoId,
    pageUrl: `https://www.youtube.com/shorts/${videoId}`,
    playUrl: "", coverUrl: /^https:\/\//.test(cover) ? cover : "",
    title: title || "Sem título",
    ...(title ? { sourceCaption: title.slice(0, 2200), sourceCaptionOrigin: "provider-title" as const } : {}),
    authorName: snippet.channelTitle || "Canal", authorHandle: snippet.channelId || "",
    duration: parseIsoDuration(item.contentDetails?.duration),
    views: count(item.statistics?.viewCount), likes: count(item.statistics?.likeCount), comments: count(item.statistics?.commentCount), shares: 0,
    ...(Number.isFinite(published) ? { publishedAt: published } : {}),
    region: "AI", minedAt: now, metricsUpdatedAt: now,
  };
}

async function request(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new YoutubeProviderError("YouTube não configurado (YOUTUBE_API_KEY).");
  const query = new URLSearchParams({ ...params, key });
  let response: Response;
  try {
    response = await fetch(`${API}/${path}?${query}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new YoutubeProviderError("O YouTube demorou para responder.");
  }
  if (response.status === 403) {
    let reason = "";
    try { const body = await response.json() as { error?: { errors?: Array<{ reason?: string }> } }; reason = body.error?.errors?.[0]?.reason ?? ""; } catch { /* sem detalhe */ }
    throw new YoutubeProviderError(reason === "quotaExceeded" ? "A cota diária da API do YouTube acabou; a coleta continua amanhã." : "O YouTube recusou a consulta (chave ou permissão).", reason === "quotaExceeded");
  }
  if (!response.ok) { await response.body?.cancel(); throw new YoutubeProviderError(`YouTube indisponível (HTTP ${response.status}).`); }
  try { return await response.json() as Record<string, unknown>; } catch { throw new YoutubeProviderError("O YouTube devolveu uma resposta inválida."); }
}

/** Uma consulta: busca Shorts recentes pelo termo e completa duração e métricas. */
export async function searchYoutubeShorts(query: string, now = Date.now()): Promise<{ virals: Omit<Viral, "id">[]; units: number }> {
  const search = await request("search", { part: "snippet", type: "video", videoDuration: "short", maxResults: "20", order: "date", q: query, safeSearch: "none" });
  const ids = (Array.isArray(search.items) ? search.items as SearchItem[] : []).flatMap((item) => item.id?.videoId ? [item.id.videoId] : []);
  if (!ids.length) return { virals: [], units: YOUTUBE_SEARCH_COST };
  const videos = await request("videos", { part: "snippet,contentDetails,statistics", id: ids.join(","), maxResults: "50" });
  const virals = (Array.isArray(videos.items) ? videos.items as VideoItem[] : [])
    .map((item) => toYoutubeViral(item, now))
    .filter((viral): viral is Omit<Viral, "id"> => viral !== null && viral.duration > 0 && isAiCharacterVideo(viral));
  return { virals, units: YOUTUBE_SEARCH_COST + YOUTUBE_LIST_COST };
}
