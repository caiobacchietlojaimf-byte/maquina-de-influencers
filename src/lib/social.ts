import "server-only";
import { getSocialAccount, refreshSocialAccountTokens, type SocialAccount, type TikTokPostOptions } from "./db";
import { openSocialToken, socialTokenConfigured } from "./social-token";
import { instagramCredentials } from "./instagram-config";

const TT = "https://open.tiktokapis.com/v2";
const VERSION = "v24.0";
const IG_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
export class SocialApiError extends Error {
  constructor(message: string, public readonly uncertain = false, public readonly retryable = false) { super(message); }
}
export function publicBaseUrl(): string {
  const url = new URL(process.env.PUBLIC_BASE_URL || "http://localhost:3000");
  if (url.username || url.password || (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost"))) throw new Error("Configure uma URL pública HTTPS para conectar as redes.");
  return url.origin;
}
export function instagramOAuthConfigured(): boolean {
  return Boolean(instagramCredentials() && socialTokenConfigured());
}
export function tiktokOAuthConfigured(): boolean {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && socialTokenConfigured());
}
export function instagramAuthorizeUrl(state: string): string {
  const credentials = instagramCredentials();
  if (!credentials || !socialTokenConfigured()) throw new Error("A conexão oficial com o Instagram ainda não está configurada.");
  return `https://www.instagram.com/oauth/authorize?${new URLSearchParams({ client_id: credentials.appId, redirect_uri: `${publicBaseUrl()}/api/oauth/instagram/callback`, response_type: "code", scope: IG_SCOPES.join(","), state, enable_fb_login: "0", force_authentication: "1" })}`;
}
export function tiktokAuthorizeUrl(state: string): string {
  if (!tiktokOAuthConfigured()) throw new Error("A conexão oficial com o TikTok ainda não está configurada.");
  return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, response_type: "code", scope: "user.info.basic,video.publish", redirect_uri: `${publicBaseUrl()}/api/oauth/tiktok/callback`, state })}`;
}

async function api(url: string, init: RequestInit = {}, mutation = false): Promise<Record<string, unknown>> {
  let response: Response;
  try { response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000) }); }
  catch { throw new SocialApiError(mutation ? "A rede não confirmou o envio. Confira o status antes de tentar outra publicação." : "A rede está temporariamente indisponível.", mutation, !mutation); }
  let data: Record<string, unknown>;
  try { data = await response.json(); } catch { throw new SocialApiError("A rede retornou uma resposta incompleta.", mutation, !mutation); }
  const error = data.error;
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : error;
  if (!response.ok || (code && code !== "ok")) {
    const auth = response.status === 401 || code === 190 || code === "access_token_invalid" || code === "scope_not_authorized";
    const temporary = response.status === 429 || response.status >= 500 || code === "rate_limit_exceeded";
    throw new SocialApiError(auth ? "A autorização da conta expirou ou não permite publicar. Reconecte a conta." : temporary ? "A rede está ocupada. A consulta será retomada automaticamente." : "A rede recusou a operação. Confira as permissões da conta, os limites e o formato do vídeo.", mutation && response.status >= 500, temporary);
  }
  return data;
}
function token(account: SocialAccount, refresh = false): string {
  return openSocialToken(refresh ? account.refreshToken : account.accessToken, `${account.userId}:${account.platform}`);
}
function headers(account: SocialAccount): Record<string, string> {
  return { Authorization: `Bearer ${token(account)}`, "Content-Type": "application/json" };
}
function graph(account: SocialAccount): string {
  return `https://${account.oauthProvider === "instagram" ? "graph.instagram.com" : "graph.facebook.com"}/${VERSION}`;
}
function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value) throw new SocialApiError("A rede não confirmou os dados da conta.");
  return value;
}
type Connection = Pick<SocialAccount, "accessToken" | "refreshToken" | "expiresAt" | "refreshExpiresAt" | "providerUserId" | "scopes" | "username" | "igUserId" | "oauthProvider">;
export async function instagramExchangeCode(code: string): Promise<Connection> {
  const credentials = instagramCredentials();
  if (!credentials || !socialTokenConfigured()) throw new Error("Instagram ainda não configurado.");
  const short = await api("https://api.instagram.com/oauth/access_token", { method: "POST", body: new URLSearchParams({ client_id: credentials.appId, client_secret: credentials.appSecret, grant_type: "authorization_code", redirect_uri: `${publicBaseUrl()}/api/oauth/instagram/callback`, code }) });
  const shortToken = requiredString(short.access_token);
  let granted = Array.isArray(short.permissions) ? short.permissions.filter((p): p is string => typeof p === "string") : [];
  if (!granted.length) {
    const permissions = await api(`https://graph.instagram.com/${VERSION}/me/permissions`, { headers: { Authorization: `Bearer ${shortToken}` } });
    granted = Array.isArray(permissions.data) ? permissions.data.filter((p: unknown): p is { permission: string; status: string } => Boolean(p && typeof p === "object" && typeof (p as { permission?: unknown }).permission === "string" && (p as { status?: unknown }).status === "granted")).map((p) => p.permission) : [];
  }
  if (!IG_SCOPES.every((scope) => granted.includes(scope))) throw new Error("Autorize o acesso ao perfil e a publicação para conectar sua conta.");
  const long = await api(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: credentials.appSecret, access_token: shortToken })}`);
  const accessToken = requiredString(long.access_token);
  const profile = await api(`https://graph.instagram.com/${VERSION}/me?fields=user_id,username`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const igUserId = String(profile.user_id || short.user_id || "");
  if (!/^\d+$/.test(igUserId)) throw new Error("Não foi possível identificar a conta profissional.");
  return { oauthProvider: "instagram", accessToken, refreshToken: undefined, expiresAt: Date.now() + Number(long.expires_in || 5184000) * 1000, scopes: granted, providerUserId: igUserId, igUserId, username: requiredString(profile.username) };
}
async function tiktokToken(body: URLSearchParams): Promise<Connection> {
  const data = await api(`${TT}/oauth/token/`, { method: "POST", body });
  const scopes = String(data.scope ?? "").split(",");
  if (!scopes.includes("video.publish")) throw new Error("Autorize a publicação de vídeos para conectar o TikTok.");
  return { oauthProvider: "tiktok", accessToken: requiredString(data.access_token), refreshToken: requiredString(data.refresh_token), expiresAt: Date.now() + Number(data.expires_in || 86400) * 1000, refreshExpiresAt: Date.now() + Number(data.refresh_expires_in || 31536000) * 1000, providerUserId: requiredString(data.open_id), scopes, username: "" };
}
export async function tiktokExchangeCode(code: string): Promise<Connection> {
  const connection = await tiktokToken(new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY ?? "", client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "", code, grant_type: "authorization_code", redirect_uri: `${publicBaseUrl()}/api/oauth/tiktok/callback` }));
  const profile = await api(`${TT}/post/publish/creator_info/query/`, { method: "POST", headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "application/json" } });
  connection.username = requiredString((profile.data as Record<string, unknown> | undefined)?.creator_username);
  return connection;
}
export async function freshSocialAccount(account: SocialAccount): Promise<SocialAccount> {
  if (account.status !== "connected") throw new Error("Conecte uma conta real antes de publicar.");
  token(account);
  if (!account.expiresAt || account.expiresAt > Date.now() + (account.platform === "instagram" ? 7 * 86400000 : 300000)) return account;
  let patch: Connection;
  if (account.oauthProvider === "instagram") {
    if (account.expiresAt <= Date.now()) throw new Error("A autorização expirou. Reconecte o Instagram.");
    const data = await api(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token(account) })}`);
    patch = { ...account, accessToken: requiredString(data.access_token), expiresAt: Date.now() + Number(data.expires_in || 5184000) * 1000 };
  } else if (account.platform === "tiktok" && account.refreshToken && (!account.refreshExpiresAt || account.refreshExpiresAt > Date.now())) {
    patch = await tiktokToken(new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY ?? "", client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "", grant_type: "refresh_token", refresh_token: token(account, true) }));
    if (patch.providerUserId !== account.providerUserId) throw new Error("Reconecte a conta para confirmar sua identidade.");
  } else throw new Error("A autorização expirou. Reconecte a conta.");
  const updated = await refreshSocialAccountTokens(account, patch);
  if (updated) return updated;
  const current = await getSocialAccount(account.userId, account.platform);
  if (!current || current.id !== account.id || current.providerUserId !== account.providerUserId || (current.expiresAt ?? 0) <= Date.now()) throw new Error("A conexão mudou. Confira a conta antes de publicar.");
  return current;
}
export type TikTokCreator = { username: string; nickname: string; privacyOptions: string[]; commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean; maxDuration: number };
export async function tiktokCreatorInfo(account: SocialAccount): Promise<TikTokCreator> {
  const result = await api(`${TT}/post/publish/creator_info/query/`, { method: "POST", headers: headers(account) });
  const data = result.data as Record<string, unknown> | undefined;
  if (!data || !Array.isArray(data.privacy_level_options) || typeof data.max_video_post_duration_sec !== "number") throw new SocialApiError("Não foi possível consultar as opções atuais da conta.");
  return { username: requiredString(data.creator_username), nickname: requiredString(data.creator_nickname), privacyOptions: data.privacy_level_options.filter((v): v is string => typeof v === "string"), commentDisabled: data.comment_disabled === true, duetDisabled: data.duet_disabled === true, stitchDisabled: data.stitch_disabled === true, maxDuration: data.max_video_post_duration_sec };
}
export function validateTikTokOptions(options: TikTokPostOptions | undefined, creator: TikTokCreator, duration: number): void {
  if (!options || !options.consentAt || !creator.privacyOptions.includes(options.privacyLevel)) throw new Error("Escolha a visibilidade e confirme os termos do TikTok.");
  if (!Number.isFinite(duration) || duration <= 0 || duration > creator.maxDuration) throw new Error("A duração do vídeo não foi confirmada ou excede o limite desta conta.");
  if ((options.allowComment && creator.commentDisabled) || (options.allowDuet && creator.duetDisabled) || (options.allowStitch && creator.stitchDisabled)) throw new Error("As permissões de interação da conta mudaram. Revise a publicação.");
  if (options.brandedContent && options.privacyLevel === "SELF_ONLY") throw new Error("Parceria paga não pode usar visibilidade Somente eu.");
}
export function validateTikTokMediaUrl(value: string): void {
  const url = new URL(value);
  const prefixes = (process.env.TIKTOK_VERIFIED_MEDIA_PREFIXES ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  if (url.protocol !== "https:" || url.username || url.password || !prefixes.some((prefix) => { try { const allowed = new URL(prefix); return allowed.protocol === "https:" && url.origin === allowed.origin && (url.pathname === allowed.pathname || url.pathname.startsWith(allowed.pathname.endsWith("/") ? allowed.pathname : `${allowed.pathname}/`)); } catch { return false; } })) throw new Error("O domínio dos vídeos ainda precisa ser verificado no aplicativo do TikTok.");
}
export async function tiktokPublish(account: SocialAccount, input: { videoUrl: string; caption: string; options: TikTokPostOptions }): Promise<string> {
  validateTikTokMediaUrl(input.videoUrl);
  const o = input.options;
  const result = await api(`${TT}/post/publish/video/init/`, { method: "POST", headers: headers(account), body: JSON.stringify({ post_info: { title: input.caption, privacy_level: o.privacyLevel, disable_comment: !o.allowComment, disable_duet: !o.allowDuet, disable_stitch: !o.allowStitch, brand_organic_toggle: o.brandOrganic, brand_content_toggle: o.brandedContent, is_aigc: true }, source_info: { source: "PULL_FROM_URL", video_url: input.videoUrl } }) }, true);
  const id = (result.data as { publish_id?: unknown } | undefined)?.publish_id;
  if (typeof id !== "string" || !id) throw new SocialApiError("O TikTok não confirmou o identificador do envio.", true);
  return id;
}
export type PublishResult = { status: "pending" | "ready" | "posted" | "failed"; postedUrl?: string; error?: string };
export async function tiktokPostStatus(account: SocialAccount, publishId: string): Promise<PublishResult> {
  const result = await api(`${TT}/post/publish/status/fetch/`, { method: "POST", headers: headers(account), body: JSON.stringify({ publish_id: publishId }) });
  const data = result.data as { status?: string; publicaly_available_post_id?: Array<string | number> } | undefined;
  if (data?.status === "FAILED") return { status: "failed", error: "O TikTok rejeitou a publicação. Confira a conta e o vídeo antes de preparar um novo envio." };
  if (data?.status !== "PUBLISH_COMPLETE") return { status: "pending" };
  const id = data.publicaly_available_post_id?.[0];
  return { status: "posted", ...(id ? { postedUrl: `https://www.tiktok.com/@${encodeURIComponent(account.username)}/video/${encodeURIComponent(String(id))}` } : {}) };
}
export async function instagramCreateContainer(account: SocialAccount, input: { videoUrl: string; caption: string }): Promise<string> {
  if (!account.igUserId) throw new Error("Reconecte o Instagram.");
  const data = await api(`${graph(account)}/${encodeURIComponent(account.igUserId)}/media`, { method: "POST", headers: headers(account), body: JSON.stringify({ media_type: "REELS", video_url: input.videoUrl, caption: input.caption, share_to_feed: true }) }, true);
  if (typeof data.id !== "string" || !data.id) throw new SocialApiError("O Instagram não confirmou o identificador do vídeo.", true);
  return data.id;
}
export async function instagramContainerStatus(account: SocialAccount, containerId: string): Promise<PublishResult> {
  const data = await api(`${graph(account)}/${encodeURIComponent(containerId)}?fields=status_code`, { headers: headers(account) });
  if (data.status_code === "ERROR" || data.status_code === "EXPIRED") return { status: "failed", error: "O Instagram rejeitou o vídeo ou o envio expirou." };
  if (data.status_code === "PUBLISHED") return { status: "posted" };
  return { status: data.status_code === "FINISHED" ? "ready" : "pending" };
}
/** Caller persists publishStartedAt before this non-idempotent request. */
export async function instagramPublishContainer(account: SocialAccount, containerId: string): Promise<PublishResult> {
  const data = await api(`${graph(account)}/${encodeURIComponent(account.igUserId ?? "")}/media_publish`, { method: "POST", headers: headers(account), body: JSON.stringify({ creation_id: containerId }) }, true);
  if (typeof data.id !== "string") throw new SocialApiError("O Instagram não confirmou a publicação.", true);
  const permalink = await api(`${graph(account)}/${encodeURIComponent(data.id)}?fields=permalink`, { headers: headers(account) }).catch(() => ({}));
  const url = "permalink" in permalink ? permalink.permalink : undefined;
  return { status: "posted", ...(typeof url === "string" && /^https:\/\/(www\.)?instagram\.com\//.test(url) ? { postedUrl: url } : {}) };
}
