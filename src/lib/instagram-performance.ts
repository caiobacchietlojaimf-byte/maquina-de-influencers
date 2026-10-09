import "server-only";

import { getSocialAccount, listPosts, type SocialAccount } from "./db";
import { freshSocialAccount } from "./social";
import { openSocialToken } from "./social-token";
import type { InstagramPerformance } from "./publication-assistant-types";

const GRAPH = "https://graph.instagram.com/v24.0";
const BASIC = "instagram_business_basic";
const INSIGHTS = "instagram_business_manage_insights";
const MEDIA_FIELDS = "id,caption,permalink,timestamp,like_count,comments_count,media_type,media_product_type";
const INSIGHT_METRICS = ["views", "reach", "saved", "shares"] as const;
const CACHE_MS = 5 * 60_000;
const MAX_CACHE = 100;
const MAX_RESPONSE_BYTES = 1_048_576;
const cache = new Map<string, { until: number; result: InstagramPerformance }>();
const pending = new Map<string, Promise<InstagramPerformance>>();
type PerformancePost = InstagramPerformance["posts"][number];
type ObjectValue = Record<string, unknown>;

class GraphReadError extends Error {
  constructor(readonly code?: number, readonly status?: number) { super("Instagram read unavailable"); }
}
function object(value: unknown): ObjectValue | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : undefined;
}
function numericId(value: unknown): value is string { return typeof value === "string" && /^\d{1,40}$/.test(value); }
function count(value: unknown): number | undefined { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined; }
function safePermalink(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 1024) return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && ["instagram.com", "www.instagram.com"].includes(url.hostname) && !url.username && !url.password && !url.port && /^\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
      url.search = ""; url.hash = "";
      return url.href;
    }
  } catch { /* A missing link does not invalidate its metrics. */ }
}
function mediaPost(value: unknown): PerformancePost | undefined {
  const item = object(value);
  // Feed videos and carousels have different distribution; compare confirmed Reels.
  if (!item || !numericId(item.id) || item.media_product_type !== "REELS") return;
  const likes = count(item.like_count), comments = count(item.comments_count);
  const permalink = safePermalink(item.permalink);
  const time = typeof item.timestamp === "string" ? Date.parse(item.timestamp) : NaN;
  return {
    id: item.id, caption: typeof item.caption === "string" ? item.caption.slice(0, 2200) : "",
    ...(permalink ? { permalink } : {}), ...(Number.isFinite(time) ? { timestamp: new Date(time).toISOString() } : {}),
    ...(likes !== undefined ? { likes } : {}), ...(comments !== undefined ? { comments } : {}),
  };
}

async function responseJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES || !response.body) {
    await response.body?.cancel(); throw new GraphReadError();
  }
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new GraphReadError();
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Credentials never enter URLs, cache keys, diagnostics or client-facing errors. */
async function graphRead(path: string, query: Record<string, string>, bearer: string, signal: AbortSignal): Promise<ObjectValue> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  requestSignal.throwIfAborted();
  const response = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${bearer}` }, redirect: "error", cache: "no-store", signal: requestSignal });
  const data = object(await responseJson(response, requestSignal));
  requestSignal.throwIfAborted();
  const error = object(data?.error);
  if (!response.ok || !data || error) throw new GraphReadError(typeof error?.code === "number" ? error.code : undefined, response.status);
  return data;
}

async function ownedFallback(account: SocialAccount, bearer: string, signal: AbortSignal): Promise<unknown[]> {
  const posts = await listPosts(account.userId);
  const ids = [...new Set(posts.filter(post => post.userId === account.userId && post.platform === "instagram"
    && post.status === "posted" && !post.deletedAt && post.mode === "live" && post.accountId === account.id
    && post.accountUserId === (account.providerUserId ?? account.igUserId))
    // providerId is a publishing CONTAINER, never the published media ID.
    .map(post => (post as typeof post & { publishedMediaId?: string }).publishedMediaId).filter(numericId))].slice(0, 5);
  const results = await Promise.allSettled(ids.map(id => graphRead(id, { fields: MEDIA_FIELDS }, bearer, signal)));
  return results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
}

function empty(status: InstagramPerformance["status"], summary: string, username?: string): InstagramPerformance {
  return { status, ...(username ? { username } : {}), checkedAt: Date.now(), sampleSize: 0, posts: [], summary, recommendations: [], metricsAvailable: [] };
}
function score(post: PerformancePost): number | undefined {
  return post.likes !== undefined && post.comments !== undefined ? post.likes + post.comments : undefined;
}
function summarize(posts: PerformancePost[], username: string, hasInsights: boolean, fallback: boolean): InstagramPerformance {
  const ranked = [...posts].sort((a, b) => {
    const left = score(a), right = score(b);
    if (left !== undefined && right !== undefined) return right - left;
    if (left !== undefined) return -1;
    if (right !== undefined) return 1;
    return (b.timestamp ?? "").localeCompare(a.timestamp ?? "");
  });
  const comparable = ranked.filter(post => score(post) !== undefined);
  const metricsAvailable = ["likes", "comments", ...INSIGHT_METRICS].filter(metric => posts.some(post => count(post[metric as keyof PerformancePost]) !== undefined));
  const insightsAvailable = INSIGHT_METRICS.some(metric => metricsAvailable.includes(metric));
  const scopeNote = hasInsights
    ? insightsAvailable ? "Insights disponíveis em até 5 Reels recentes; os dados podem levar até 48 horas para atualizar." : "Os insights não foram disponibilizados nesta consulta; os números ausentes ficam em branco."
    : "A conexão atual permite curtidas e comentários. Visualizações, alcance, salvamentos e compartilhamentos precisam da permissão de insights.";
  const coverage = fallback ? "Amostra das publicações deste sistema confirmadas pela conta." : "Amostra de Reels entre as 20 mídias mais recentes da conta.";
  const recommendations: string[] = [];
  let summary: string;
  if (comparable.length < 3) {
    summary = `${posts.length} Reel(s) encontrado(s), ${comparable.length} com curtidas e comentários disponíveis. A amostra é insuficiente para concluir o que teve melhor desempenho. ${coverage} ${scopeNote}`;
    recommendations.push("Compare pelo menos 3 Reels com métricas disponíveis antes de escolher um padrão para repetir.");
  } else {
    const leader = comparable[0];
    summary = `${posts.length} Reel(s) encontrado(s). Ranking por curtidas + comentários: o primeiro tem ${leader.likes!.toLocaleString("pt-BR")} curtida(s) e ${leader.comments!.toLocaleString("pt-BR")} comentário(s). Esses totais não demonstram a causa do desempenho. ${coverage} ${scopeNote}`;
    recommendations.push("Compare as aberturas e os temas dos primeiros Reels e teste uma mudança por vez; a legenda sozinha não explica o resultado.");
    const oldest = comparable.reduce((value, post) => post.timestamp && (!value || post.timestamp < value) ? post.timestamp : value, "");
    const newest = comparable.reduce((value, post) => post.timestamp && post.timestamp > value ? post.timestamp : value, "");
    if (oldest && newest && Date.parse(newest) - Date.parse(oldest) > 86400000) recommendations.push("Os Reels têm idades diferentes. Compare novamente após janelas semelhantes de publicação antes de tomar decisões.");
    const top = comparable.slice(0, 3), questions = top.filter(post => post.caption.includes("?")).length;
    recommendations.push(`${questions} dos 3 Reels com maior soma usam pergunta na legenda. Isso descreve a amostra; não prova que a pergunta causou mais interações.`);
  }
  if (posts.some(post => post.likes === undefined || post.comments === undefined)) recommendations.push("Contagens ocultas ou indisponíveis não entram como zero no ranking.");
  return { status: "ready", username, checkedAt: Date.now(), sampleSize: posts.length, posts: ranked, summary, recommendations, metricsAvailable };
}

async function readPerformance(stored: SocialAccount): Promise<InstagramPerformance> {
  const account = await freshSocialAccount(stored);
  if (account.userId !== stored.userId || account.id !== stored.id || account.oauthProvider !== "instagram" || account.status !== "connected"
    || account.providerUserId !== stored.providerUserId || account.connectedAt !== stored.connectedAt) throw new GraphReadError();
  const userId = account.igUserId ?? account.providerUserId;
  if (!numericId(userId) || !account.scopes?.includes(BASIC)) throw new GraphReadError();
  const bearer = openSocialToken(account.accessToken, `${account.userId}:instagram`);
  const signal = AbortSignal.timeout(10_000);
  const me = await graphRead("me", { fields: "user_id,username" }, bearer, signal);
  if (String(me.user_id ?? "") !== userId) throw new GraphReadError();
  const username = typeof me.username === "string" ? me.username.slice(0, 100) : account.username.slice(0, 100);
  let media: unknown[], fallback = false;
  try {
    const response = await graphRead(`${userId}/media`, { fields: MEDIA_FIELDS, limit: "20" }, bearer, signal);
    if (!Array.isArray(response.data)) throw new GraphReadError();
    media = response.data.slice(0, 20);
  } catch (error) {
    if (!(error instanceof GraphReadError) || (error.code !== 100 && error.status !== 404)) throw error;
    fallback = true;
    media = await ownedFallback(account, bearer, signal);
    if (!media.length) throw new GraphReadError();
  }
  const seen = new Set<string>();
  const posts = media.flatMap(value => {
    const post = mediaPost(value);
    if (!post || seen.has(post.id)) return [];
    seen.add(post.id); return [post];
  });
  const hasInsights = account.scopes.includes(INSIGHTS);
  if (hasInsights) {
    // Optional analytics never blocks basic counts or changes the OAuth scopes.
    // https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/
    await Promise.allSettled(posts.slice(0, 5).map(async post => {
      const response = await graphRead(`${post.id}/insights`, { metric: INSIGHT_METRICS.join(","), period: "lifetime" }, bearer, signal);
      if (!Array.isArray(response.data)) return;
      for (const raw of response.data) {
        const metric = object(raw);
        if (!metric || !INSIGHT_METRICS.includes(metric.name as typeof INSIGHT_METRICS[number])) continue;
        const values = Array.isArray(metric.values) ? metric.values : [];
        const value = count(object(metric.total_value)?.value ?? object(values[0])?.value);
        if (value !== undefined) post[metric.name as typeof INSIGHT_METRICS[number]] = value;
      }
    }));
  }
  return summarize(posts, username, hasInsights, fallback);
}

/** Read-only analytics for an authenticated caller's own connected Instagram. */
export async function getInstagramPerformance(userId: string): Promise<InstagramPerformance> {
  let stored: SocialAccount | undefined;
  try { stored = await getSocialAccount(userId, "instagram"); }
  catch { return empty("unavailable", "Não foi possível consultar a conexão do Instagram agora. Tente novamente mais tarde."); }
  if (!stored || stored.userId !== userId || stored.platform !== "instagram" || stored.status !== "connected") return empty("disconnected", "Conecte seu Instagram profissional para consultar o desempenho dos seus Reels.");
  if (stored.oauthProvider !== "instagram") return empty("unavailable", "Esta análise está disponível para a conexão pelo Login do Instagram.", stored.username);
  const key = JSON.stringify([userId, stored.id, stored.providerUserId ?? stored.igUserId, stored.connectedAt, [...stored.scopes ?? []].sort()]);
  const now = Date.now();
  for (const [cachedKey, value] of cache) if (value.until <= now) cache.delete(cachedKey);
  const cached = cache.get(key);
  if (cached) return structuredClone(cached.result);
  const inflight = pending.get(key);
  if (inflight) return structuredClone(await inflight);
  const work = readPerformance(stored).catch(() => empty("unavailable", "O Instagram não disponibilizou as métricas agora. Confira a conexão e tente novamente mais tarde.", stored!.username));
  if (pending.size < MAX_CACHE) pending.set(key, work);
  try {
    const result = await work;
    while (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + (result.status === "ready" ? CACHE_MS : 30_000), result });
    return structuredClone(result);
  } finally { if (pending.get(key) === work) pending.delete(key); }
}
