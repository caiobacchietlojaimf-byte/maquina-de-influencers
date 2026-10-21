import "server-only";

import { AI_PROFILES } from "@/data/ai-profiles";
import { isAiCharacterVideo } from "./ai-discovery";
import { getSocialAccount, upsertVirals, type SocialAccount, type Viral } from "./db";
import { freshSocialAccount } from "./social";
import { openSocialToken } from "./social-token";

/* Atualização do Instagram pela API oficial, sem serviço pago.
   Tenta a aresta business_discovery do nó IG User com a conexão já existente
   (Instagram API with Instagram Login, escopo instagram_business_basic).
   RESULTADO REAL em 2026-10-20 (conta administradora, produção): a Meta
   respondeu "Tried accessing nonexisting field (business_discovery)" para
   todos os perfis. Ou seja, business_discovery não existe no login do
   Instagram; só na Instagram API with Facebook Login (graph.facebook.com,
   conta profissional ligada a uma Página do Facebook, escopos instagram_basic
   + instagram_manage_insights + pages_read_engagement). A conexão atual não
   serve, e a fonte fica em modo catálogo até existir essa outra conexão.
   Cobertura real: só os perfis acompanhados do catálogo, e só se forem contas
   profissionais; não há busca por termo nem ranking. Chamadas: uma por perfil
   por rodada (5 perfis a cada 15 min = 20/h), dentro do limite de plataforma
   (200 chamadas por hora por usuário). Nada aqui gera cobrança: a API é
   gratuita e não há provedor terceiro. */

const GRAPH = "https://graph.instagram.com/v24.0";
const MEDIA_LIMIT = 15;
const REQUEST_TIMEOUT_MS = 12_000;
const USERNAME = /^[a-z0-9._]{1,30}$/i;

/** Perfis do Instagram acompanhados pelo catálogo verificado. */
export const INSTAGRAM_TRACKED_PROFILES: readonly string[] = [...new Set(AI_PROFILES.filter((profile) => profile.platform === "instagram").map((profile) => profile.handle))];

export class InstagramDiscoveryError extends Error {
  constructor(message: string, readonly kind: "auth" | "rate" | "unavailable" | "profile") { super(message); }
}

type Media = {
  id?: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string;
  timestamp?: string; like_count?: number; comments_count?: number; view_count?: number;
};
type Discovery = { username?: string; name?: string; followers_count?: number; media_count?: number; media?: { data?: Media[] } };

function adminUserIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

/** Conta administradora com Instagram conectado pela API oficial; null = sem leitura possível. */
export async function instagramDiscoveryAccount(): Promise<SocialAccount | null> {
  for (const userId of adminUserIds()) {
    let account: SocialAccount | undefined;
    try { account = await getSocialAccount(userId, "instagram"); } catch { continue; }
    if (account?.status === "connected" && account.oauthProvider === "instagram" && account.scopes?.includes("instagram_business_basic") && /^\d+$/.test(account.igUserId ?? "")) return account;
  }
  return null;
}

function safeUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/** Converte uma mídia pública em vídeo do acervo; fotos e mídias sem link são ignoradas. */
export function toInstagramViral(username: string, displayName: string | undefined, media: Media, now = Date.now()): Omit<Viral, "id"> | null {
  if (media.media_type !== "VIDEO") return null;
  const code = /instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(media.permalink ?? "")?.[1];
  if (!code) return null;
  const caption = (media.caption ?? "").trim();
  const firstLine = caption.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  const title = firstLine.replace(/\s+/g, " ").slice(0, 140) || `Reel de @${username}`;
  const published = media.timestamp ? Date.parse(media.timestamp) : NaN;
  return {
    source: "instagram",
    pageUrl: `https://www.instagram.com/reel/${code}/`,
    playUrl: safeUrl(media.media_url),
    coverUrl: safeUrl(media.thumbnail_url),
    title,
    ...(caption ? { sourceCaption: caption.slice(0, 2200), sourceCaptionOrigin: "provider-title" as const } : {}),
    authorName: displayName?.trim() || username,
    authorHandle: username,
    duration: 0,
    views: count(media.view_count), likes: count(media.like_count), comments: count(media.comments_count), shares: 0,
    ...(Number.isFinite(published) ? { publishedAt: published } : {}),
    region: "AI", minedAt: now, metricsUpdatedAt: now,
  };
}

async function graphGet(path: string, params: Record<string, string>, token: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${GRAPH}/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new InstagramDiscoveryError("O Instagram demorou para responder.", "unavailable");
  }
  let data: Record<string, unknown>;
  try { data = await response.json() as Record<string, unknown>; } catch { throw new InstagramDiscoveryError("O Instagram devolveu uma resposta inválida.", "unavailable"); }
  const error = data.error && typeof data.error === "object" ? data.error as { code?: number; message?: string; error_subcode?: number } : undefined;
  if (response.ok && !error) return data;
  const code = error?.code;
  if (response.status === 401 || code === 190 || code === 10 || code === 200) throw new InstagramDiscoveryError("A autorização do Instagram expirou ou não permite leitura. Reconecte a conta em Publicar.", "auth");
  if (response.status === 429 || code === 4 || code === 17 || code === 32 || code === 613) throw new InstagramDiscoveryError("O Instagram limitou as consultas por agora.", "rate");
  if (response.status >= 500) throw new InstagramDiscoveryError(`Instagram indisponível (HTTP ${response.status}).`, "unavailable");
  throw new InstagramDiscoveryError(error?.message ? `O Instagram recusou a consulta: ${error.message}` : `O Instagram recusou a consulta (HTTP ${response.status}).`, "profile");
}

export type ProfileResult = { username: string; ok: boolean; videos: number; error?: string; followers?: number };
export type InstagramRound = { account: string; added: number; profiles: ProfileResult[]; errors: string[]; failure?: "auth" | "rate" | "unavailable" };

/** Lê a mídia pública de um perfil profissional pelo business_discovery. */
export async function discoverInstagramProfile(account: SocialAccount, username: string, now = Date.now()): Promise<{ virals: Omit<Viral, "id">[]; followers?: number; name?: string }> {
  if (!USERNAME.test(username)) throw new InstagramDiscoveryError("Nome de perfil inválido.", "profile");
  const token = openSocialToken(account.accessToken, `${account.userId}:${account.platform}`);
  const fields = `business_discovery.username(${username}){username,name,followers_count,media_count,media.limit(${MEDIA_LIMIT}){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,view_count}}`;
  const data = await graphGet(account.igUserId!, { fields }, token);
  const discovery = data.business_discovery as Discovery | undefined;
  if (!discovery || typeof discovery !== "object") throw new InstagramDiscoveryError("O Instagram não devolveu os dados do perfil.", "profile");
  const items = Array.isArray(discovery.media?.data) ? discovery.media!.data! : [];
  const virals = items.map((media) => toInstagramViral(username, discovery.name, media, now)).filter((viral): viral is Omit<Viral, "id"> => viral !== null && isAiCharacterVideo(viral));
  return { virals, ...(typeof discovery.followers_count === "number" ? { followers: discovery.followers_count } : {}), ...(discovery.name ? { name: discovery.name } : {}) };
}

/** Uma rodada completa nos perfis acompanhados: grava, deduplica (pelo link do Reel) e preserva o catálogo. */
export async function runInstagramDiscovery(options: { now?: number; profiles?: readonly string[] } = {}): Promise<InstagramRound | null> {
  const now = options.now ?? Date.now();
  const connected = await instagramDiscoveryAccount();
  if (!connected) return null;
  let account: SocialAccount;
  try { account = await freshSocialAccount(connected); }
  catch (error) {
    const message = error instanceof Error ? error.message : "A autorização do Instagram expirou.";
    return { account: connected.username, added: 0, profiles: [], errors: [message], failure: "auth" };
  }
  const round: InstagramRound = { account: account.username, added: 0, profiles: [], errors: [] };
  const collected: Omit<Viral, "id">[] = [];
  for (const username of options.profiles ?? INSTAGRAM_TRACKED_PROFILES) {
    try {
      const result = await discoverInstagramProfile(account, username, now);
      collected.push(...result.virals);
      round.profiles.push({ username, ok: true, videos: result.virals.length, ...(result.followers !== undefined ? { followers: result.followers } : {}) });
    } catch (error) {
      const kind = error instanceof InstagramDiscoveryError ? error.kind : "unavailable";
      const message = error instanceof Error ? error.message : "Falha ao consultar o perfil.";
      round.profiles.push({ username, ok: false, videos: 0, error: message });
      round.errors.push(`@${username}: ${message}`);
      if (kind !== "profile") { round.failure = kind; break; }
    }
  }
  if (collected.length) round.added = await upsertVirals(collected);
  return round;
}
