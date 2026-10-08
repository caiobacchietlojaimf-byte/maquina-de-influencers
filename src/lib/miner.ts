import "server-only";

import { listVirals, upsertVirals, type Viral } from "./db";
import { AI_DISCOVERY_QUERIES, isAiCharacterVideo, isMotionReference, parseSocialVideoUrl, type DiscoveryCursors } from "./ai-discovery";

const TIKWM = "https://www.tikwm.com/api";
const AI_REGION = "AI";
const FEED_TTL_MS = 30 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const RUN_TIMEOUT_MS = 40_000;
const pending = new Map<string, Promise<MiningResult>>();
let providerUnavailableUntil = 0;
let providerMessage = "";
let nextRequestAt = 0;
let requestQueue: Promise<unknown> = Promise.resolve();

type TikwmItem = {
  video_id?: string; id?: string; aweme_id?: string; title?: string;
  cover?: string; origin_cover?: string; duration?: number;
  play?: string; hdplay?: string; images?: unknown[];
  play_count?: number; digg_count?: number; comment_count?: number; share_count?: number;
  music_info?: { title?: string };
  author?: { unique_id?: string; nickname?: string };
};
type TikwmPage = { videos?: TikwmItem[]; cursor?: string | number; hasMore?: boolean | number };
export type MiningResult = { added: number; cursors: DiscoveryCursors; hasMore: boolean; warning?: string };

class MiningProviderError extends Error {
  constructor(message: string, readonly unavailable = false) { super(message); }
}

/** The provider is rate limited. Serialize calls instead of launching a search burst. */
async function tikwm(pathAndQuery: string): Promise<unknown> {
  const task = requestQueue.catch(() => undefined).then(async () => {
    if (Date.now() < providerUnavailableUntil) throw new MiningProviderError(providerMessage, true);
    const delay = nextRequestAt - Date.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 1_100;
    let response: Response;
    try {
      response = await fetch(`${TIKWM}${pathAndQuery}`, {
        headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new MiningProviderError("A busca do TikTok demorou para responder. Seus vídeos salvos continuam disponíveis.");
    }
    if ([403, 429].includes(response.status)) {
      providerMessage = response.status === 429
        ? "O provedor do TikTok atingiu o limite de consultas. Tente atualizar em alguns minutos."
        : "O provedor do TikTok está bloqueando a consulta automática. Os vídeos já captados continuam disponíveis.";
      providerUnavailableUntil = Date.now() + 60_000;
      throw new MiningProviderError(providerMessage, true);
    }
    if (!response.ok) throw new MiningProviderError(`Busca do TikTok indisponível (HTTP ${response.status}).`);
    let payload: { code?: number; msg?: string; data?: unknown };
    try { payload = await response.json(); } catch { throw new MiningProviderError("O provedor do TikTok devolveu uma resposta inválida."); }
    if (payload.code !== 0) throw new MiningProviderError("O provedor não conseguiu consultar este vídeo ou pesquisa agora.");
    return payload.data;
  });
  requestQueue = task;
  return task;
}

function mediaUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value, "https://www.tikwm.com");
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function toViral(item: TikwmItem): Omit<Viral, "id"> | null {
  const videoId = item.video_id ?? item.aweme_id ?? item.id;
  const playUrl = mediaUrl(item.play || item.hdplay);
  const handle = item.author?.unique_id ?? "";
  if (!videoId || !/^\d+$/.test(videoId) || !playUrl || item.images?.length || count(item.duration) === 0) return null;
  return {
    source: "tiktok", videoId,
    pageUrl: `https://www.tiktok.com/@${encodeURIComponent(handle || "_")}/video/${videoId}`,
    playUrl, coverUrl: mediaUrl(item.origin_cover || item.cover),
    title: (item.title || "").trim() || "Sem legenda", authorName: item.author?.nickname || handle || "Criador",
    authorHandle: handle, duration: count(item.duration), views: count(item.play_count), likes: count(item.digg_count),
    comments: count(item.comment_count), shares: count(item.share_count),
    ...(item.music_info?.title ? { musicTitle: item.music_info.title } : {}),
    region: AI_REGION, minedAt: Date.now(),
  };
}

export function isDuplicable(viral: Pick<Viral, "duration" | "title" | "authorHandle" | "authorName">): boolean {
  return isAiCharacterVideo(viral) && isMotionReference(viral.duration);
}

/** Keep the former generic feed out of the UI, including during SSR/cache fallback. */
export async function listAiVirals(): Promise<Viral[]> {
  return (await listVirals(AI_REGION)).filter(isAiCharacterVideo);
}

function cleanCursors(input?: DiscoveryCursors): DiscoveryCursors {
  const result: DiscoveryCursors = {};
  for (const query of AI_DISCOVERY_QUERIES) {
    const cursor = input ? input[query] : "0";
    if (typeof cursor === "string" && /^[a-z0-9_.-]{1,100}$/i.test(cursor)) result[query] = cursor;
  }
  return result;
}

/** Search actual character names and explicit AI-character terms, one page per query.
 * Cursors make subsequent pages reachable; #viral/regional popularity never qualifies. */
export async function mineTrending(_region = AI_REGION, options?: { force?: boolean; cursors?: DiscoveryCursors }): Promise<MiningResult> {
  const cursors = cleanCursors(options?.cursors);
  const key = JSON.stringify(cursors);
  const running = pending.get(key);
  if (running) return running;
  const task = (async (): Promise<MiningResult> => {
    const cached = await listAiVirals();
    if (!options?.force && !options?.cursors && cached.length && Date.now() - Math.max(...cached.map((v) => v.minedAt)) < FEED_TTL_MS) {
      return { added: 0, cursors, hasMore: true };
    }
    const deadline = Date.now() + RUN_TIMEOUT_MS;
    const collected = new Map<string, Omit<Viral, "id">>();
    const next: DiscoveryCursors = { ...cursors };
    let warning: string | undefined;
    let completed = 0;
    for (const [query, cursor] of Object.entries(cursors)) {
      if (Date.now() > deadline) { warning = "A busca parcial foi salva. Use Buscar mais para continuar."; break; }
      try {
        const data = await tikwm(`/feed/search?${new URLSearchParams({ keywords: query, count: "20", cursor })}`) as TikwmPage | null;
        if (!data || !Array.isArray(data.videos)) throw new MiningProviderError("O provedor do TikTok não retornou uma lista de vídeos válida.");
        completed += 1;
        for (const item of data.videos) {
          const viral = toViral(item);
          if (viral && isAiCharacterVideo(viral)) collected.set(`${viral.source}:${viral.videoId}`, viral);
        }
        const nextCursor = String(data.cursor ?? "");
        if ((data.hasMore === true || data.hasMore === 1) && nextCursor && nextCursor !== cursor && /^[a-z0-9_.-]{1,100}$/i.test(nextCursor)) next[query] = nextCursor;
        else delete next[query];
      } catch (error) {
        warning = error instanceof Error ? error.message : "A busca do TikTok está indisponível agora.";
        if (error instanceof MiningProviderError && error.unavailable) break;
      }
    }
    const added = await upsertVirals([...collected.values()]);
    if (!completed && warning) throw new Error(warning);
    return { added, cursors: next, hasMore: Object.keys(next).length > 0, ...(warning ? { warning } : {}) };
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

export async function refreshViralMedia(viral: Viral): Promise<Viral> {
  if (viral.source !== "tiktok") return viral;
  const parsed = parseSocialVideoUrl(viral.pageUrl);
  if (!parsed || parsed.source !== "tiktok") throw new Error("Link original do vídeo inválido.");
  const item = await tikwm(`/?url=${encodeURIComponent(parsed.url)}`) as TikwmItem | null;
  const refreshed = item ? toViral(item) : null;
  if (!refreshed || refreshed.videoId !== viral.videoId || !isAiCharacterVideo(refreshed)) throw new Error("Não foi possível renovar o vídeo original agora.");
  await upsertVirals([refreshed]);
  return { ...refreshed, id: viral.id };
}

/** Import only supported social URLs whose resolved metadata relates to AI characters. */
export async function mineByUrl(input: string): Promise<{ added: boolean; title: string }> {
  const parsed = parseSocialVideoUrl(input);
  if (!parsed) throw new Error("Cole o link de um vídeo do TikTok ou Reel do Instagram relacionado a personagens de IA.");
  if (parsed.source === "instagram") {
    const { AI_PROFILES } = await import("@/data/ai-profiles");
    const profile = AI_PROFILES.find((p) => p.posts.some((post) => post.code === parsed.code));
    const post = profile?.posts.find((p) => p.code === parsed.code);
    if (!profile || !post) throw new Error("Este Reel ainda não faz parte dos perfis de IA captados. A importação automática de outros Reels precisa de uma fonte de mídia autorizada do Instagram.");
    if (!post.video) throw new Error("Este Reel está na aba Perfis de IA. O Instagram ainda não disponibilizou um arquivo para reprodução direta.");
    const added = await upsertVirals([{
      source: "instagram", pageUrl: parsed.url, playUrl: post.video, coverUrl: `/reel-thumbs/${post.code}.jpg`,
      title: post.scene, authorName: profile.name, authorHandle: profile.handle,
      duration: post.metrics?.duration ?? 0, views: post.metrics?.views ?? 0, likes: post.metrics?.likes ?? 0,
      comments: post.metrics?.comments ?? 0, shares: 0, region: AI_REGION, minedAt: Date.now(),
    }]);
    return { added: added > 0, title: post.scene };
  }
  const item = await tikwm(`/?url=${encodeURIComponent(parsed.url)}`) as TikwmItem | null;
  const viral = item ? toViral(item) : null;
  if (!viral) throw new Error("Este link não retornou um vídeo reproduzível do TikTok.");
  if (!isAiCharacterVideo(viral)) throw new Error("O autor e a legenda não identificam um personagem de IA ou um dos perfis acompanhados. Vídeos genéricos não entram neste catálogo.");
  const added = await upsertVirals([viral]);
  return { added: added > 0, title: viral.title };
}
