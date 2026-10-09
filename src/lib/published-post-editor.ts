import "server-only";

import {
  getPublishedPost, getSocialAccount, getVideo, savePublishedCaptionDraft, syncPublishedCaption,
  type Post, type PublishedCaptionDraft, type SocialAccount,
} from "./db";
import { getInstagramPublishedCaption } from "./instagram-performance";
import { CAPTION_LIMIT } from "./publish-caption";

export type PublishedPostEditorSnapshot = {
  postId: string;
  videoId: string;
  platform: "instagram";
  /** Last recorded value, not an assertion that an offline read contacted Instagram. */
  currentCaption: string;
  revision: string | null;
  draft?: PublishedCaptionDraft;
  permalink?: string;
  checkedAt?: number;
  canSync: boolean;
  canImprove: boolean;
  connectionMessage?: string;
};
export type PublishedPostEditorResult = { editor: PublishedPostEditorSnapshot } | { error: string; conflict?: boolean };
export type SavePublishedCaptionDraftInput = { postId: string; caption: string; baseRevision: string | null };

const MISSING = "Esta publicação não está disponível para edição.";
const CONFLICT = "A publicação ou o rascunho mudou em outra aba. Reabra os detalhes antes de salvar; seu texto não foi substituído.";
function validId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value); }
function eligible(post: Post | undefined, userId: string): post is Post {
  return Boolean(post && post.userId === userId && post.status === "posted" && post.platform === "instagram" && post.mode === "live" && !post.deletedAt);
}
function connected(post: Post, account: SocialAccount | undefined): account is SocialAccount {
  const identity = account?.providerUserId ?? account?.igUserId;
  return Boolean(account && account.userId === post.userId && account.id === post.accountId && account.platform === "instagram"
    && account.oauthProvider === "instagram" && account.status === "connected" && account.accessToken
    && identity && /^\d{1,40}$/.test(identity) && identity === post.accountUserId && (!account.igUserId || account.igUserId === identity)
    && account.scopes?.includes("instagram_business_basic"));
}
function permalink(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 1024) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname) || url.username || url.password || url.port
      || !/^\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return;
    url.search = ""; url.hash = "";
    return url.href;
  } catch { return; }
}

async function snapshot(post: Post): Promise<PublishedPostEditorSnapshot> {
  const [account, video] = await Promise.all([getSocialAccount(post.userId, "instagram"), getVideo(post.userId, post.videoId)]);
  const canSync = connected(post, account), link = permalink(post.postedUrl);
  return {
    postId: post.id, videoId: post.videoId, platform: "instagram", currentCaption: post.caption, revision: post.revision ?? null,
    ...(post.captionDraft ? { draft: { caption: post.captionDraft.caption, baseCaption: post.captionDraft.baseCaption, updatedAt: post.captionDraft.updatedAt } } : {}),
    ...(link ? { permalink: link } : {}), ...(post.captionSyncedAt ? { checkedAt: post.captionSyncedAt } : {}), canSync,
    canImprove: Boolean(video && video.userId === post.userId && !video.deletedAt && video.status === "completed" && video.resultUrl),
    ...(!canSync ? { connectionMessage: "Reconecte a conta do Instagram usada ao publicar para conferir a legenda. Seu rascunho pode ser salvo aqui." } : {}),
  };
}

/** Opens the local editor without paid generation or an Instagram write/read. */
export async function getPublishedPostEditor(userId: string, postId: string): Promise<PublishedPostEditorResult> {
  if (!validId(postId)) return { error: MISSING };
  const post = await getPublishedPost(userId, postId);
  if (!eligible(post, userId)) return { error: MISSING };
  return { editor: await snapshot(post) };
}

/** Keeps the editorial proposal separate even while the Instagram account is disconnected. */
export async function savePublishedPostCaptionDraft(userId: string, input: SavePublishedCaptionDraftInput): Promise<PublishedPostEditorResult> {
  if (!input || !validId(input.postId) || (input.baseRevision !== null && !validId(input.baseRevision))) return { error: "Reabra a publicação antes de salvar o rascunho." };
  if (typeof input.caption !== "string" || input.caption.length > CAPTION_LIMIT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input.caption)) {
    return { error: `A legenda deve ter até ${CAPTION_LIMIT} caracteres e conter apenas texto válido.` };
  }
  const post = await getPublishedPost(userId, input.postId);
  if (!eligible(post, userId)) return { error: MISSING };
  if ((post.revision ?? null) !== input.baseRevision) return { error: CONFLICT, conflict: true };
  const saved = await savePublishedCaptionDraft(userId, post.id, input.baseRevision, input.caption);
  if (!saved) return { error: CONFLICT, conflict: true };
  return { editor: await snapshot(saved) };
}

/** Sync means GET the actual caption, never send the proposed caption to the platform. */
export async function syncPublishedPostCaption(userId: string, postId: string): Promise<PublishedPostEditorResult> {
  if (!validId(postId)) return { error: MISSING };
  const post = await getPublishedPost(userId, postId);
  if (!eligible(post, userId)) return { error: MISSING };
  const account = await getSocialAccount(userId, "instagram");
  if (!connected(post, account)) return { error: "Conecte a conta do Instagram usada ao publicar para conferir a legenda." };
  const verified = await getInstagramPublishedCaption(userId, post.id);
  if (verified.status !== "ready") return { error: verified.message };
  // Bind a provider response to the exact post and connection selected before the request.
  if (verified.postId !== post.id || verified.accountId !== account.id || verified.accountUserId !== post.accountUserId
    || verified.connectedAt !== account.connectedAt || (post.publishedMediaId && verified.publishedMediaId !== post.publishedMediaId)) {
    return { error: "A publicação ou a conta mudou durante a consulta. Abra os detalhes novamente.", conflict: true };
  }
  const saved = await syncPublishedCaption(userId, post.id, post.revision ?? null, verified);
  if (!saved) return { error: CONFLICT, conflict: true };
  return { editor: await snapshot(saved) };
}
