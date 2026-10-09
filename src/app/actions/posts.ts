"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";

import { requireUser } from "@/lib/auth";
import {
  createPost,
  createPostOnce,
  deletePost,
  deleteSocialAccount,
  getSocialAccount,
  getVideo,
  listPosts,
  listSocialAccounts,
  updatePost,
  type Post,
  type SocialAccount,
  type SocialPlatform,
  type TikTokPostOptions,
} from "@/lib/db";
import { publisherTick } from "@/lib/publisher";
import {
  instagramAuthorizeUrl,
  instagramOAuthConfigured,
  tiktokAuthorizeUrl,
  tiktokOAuthConfigured,
  freshSocialAccount,
  tiktokCreatorInfo,
  validateTikTokOptions,
  validateTikTokMediaUrl,
  type TikTokCreator,
} from "@/lib/social";
import { createOAuthState, oauthCookieName, oauthCookieOptions } from "@/lib/social-oauth-state";
import { CAPTION_LIMIT } from "@/lib/publish-caption";

export type AccountsSnapshot = {
  accounts: Array<
    Pick<SocialAccount, "platform" | "status" | "username" | "connectedAt">
  >;
  tiktokOAuth: boolean;
  instagramOAuth: boolean;
};

export async function getAccountsAction(): Promise<AccountsSnapshot> {
  const user = await requireUser();
  return {
    accounts: (await listSocialAccounts(user.id)).map((a) => ({
      platform: a.platform,
      status: a.status,
      username: a.username,
      connectedAt: a.connectedAt,
    })),
    tiktokOAuth: tiktokOAuthConfigured(),
    instagramOAuth: instagramOAuthConfigured(),
  };
}

export async function connectTiktokAction(): Promise<{
  redirect?: string;
  error?: string;
}> {
  const user = await requireUser();
  if (!tiktokOAuthConfigured()) return { error: "A conexão oficial com o TikTok ainda não está configurada." };
  const state = createOAuthState(user.id, "tiktok");
  const redirect = tiktokAuthorizeUrl(state);
  (await cookies()).set(oauthCookieName("tiktok"), state, oauthCookieOptions);
  return { redirect };
}

export async function connectInstagramAction(): Promise<{ redirect?: string; error?: string }> {
  const user = await requireUser();
  if (!instagramOAuthConfigured()) return { error: "A conexão oficial com o Instagram ainda não está configurada." };
  const state = createOAuthState(user.id, "instagram");
  const redirect = instagramAuthorizeUrl(state);
  (await cookies()).set(oauthCookieName("instagram"), state, oauthCookieOptions);
  return { redirect };
}

export async function getTikTokCreatorAction(): Promise<{ creator: TikTokCreator } | { error: string }> {
  const user = await requireUser();
  const stored = await getSocialAccount(user.id, "tiktok");
  if (!stored || stored.status !== "connected") return { error: "Conecte sua conta do TikTok." };
  try { return { creator: await tiktokCreatorInfo(await freshSocialAccount(stored)) }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível consultar a conta." }; }
}

export async function disconnectAccountAction(
  platform: SocialPlatform,
): Promise<void> {
  const user = await requireUser();
  if (platform !== "instagram" && platform !== "tiktok") throw new Error("Rede inválida.");
  await deleteSocialAccount(user.id, platform);
  revalidatePath("/app", "layout");
}

/** Agenda (ou dispara imediatamente) a publicação de um vídeo gerado. */
export async function schedulePostAction(input: {
  videoId: string;
  platform: SocialPlatform;
  caption: string;
  requestKey?: string;
  tiktok?: TikTokPostOptions;
  draftId?: string;
  /** Epoch ms; ausente = publicar agora. */
  scheduledAt?: number;
}): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  if (!input || typeof input.caption !== "string" || typeof input.videoId !== "string") return { error: "Dados da publicação inválidos." };
  if (!input.requestKey || !/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestKey)) return { error: "Reabra a publicação para confirmar o envio." };
  if (input.platform !== "instagram" && input.platform !== "tiktok")
    return { error: "Rede inválida" };
  if (input.caption.trim().length > CAPTION_LIMIT)
    return { error: `A legenda deve ter até ${CAPTION_LIMIT} caracteres.` };
  if (
    input.scheduledAt !== undefined &&
    (!Number.isFinite(input.scheduledAt) || input.scheduledAt <= Date.now())
  ) {
    return { error: "Escolha uma data futura ou selecione Publicar agora." };
  }
  const video = await getVideo(user.id, input.videoId);
  if (!video || video.deletedAt) return { error: "Vídeo não encontrado" };
  if (video.status !== "completed" || !video.resultUrl) {
    return { error: "Espere o vídeo terminar de gerar antes de publicar" };
  }
  const stored = await getSocialAccount(user.id, input.platform);
  if (!stored || stored.status !== "connected") {
    return { error: "Conecte a conta dessa rede primeiro (página Publicar)" };
  }
  let account: SocialAccount;
  let tiktok: TikTokPostOptions | undefined;
  let videoDuration = video.edit?.result?.duration;
  try {
    account = await freshSocialAccount(stored);
    if (input.platform === "tiktok") {
      if (!input.tiktok || !Number.isFinite(input.tiktok.consentAt) || input.tiktok.consentAt < Date.now() - 30 * 60_000 || input.tiktok.consentAt > Date.now() + 60_000) return { error: "Revise as opções e confirme os termos do TikTok." };
      tiktok = { privacyLevel: input.tiktok.privacyLevel, allowComment: input.tiktok.allowComment === true, allowDuet: input.tiktok.allowDuet === true, allowStitch: input.tiktok.allowStitch === true, brandOrganic: input.tiktok.brandOrganic === true, brandedContent: input.tiktok.brandedContent === true, consentAt: input.tiktok.consentAt };
      if (!videoDuration) {
        const { readPublicVideo } = await import("@/lib/video-media");
        const { mp4Metadata } = await import("@/lib/video-reference");
        videoDuration = mp4Metadata(await readPublicVideo(video.resultUrl, 200 * 1024 * 1024, AbortSignal.timeout(20_000))).duration;
      }
      validateTikTokOptions(tiktok, await tiktokCreatorInfo(account), videoDuration);
      validateTikTokMediaUrl(video.resultUrl);
    }
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível verificar a conta." }; }
  if (!account.providerUserId && !account.igUserId) return { error: "Reconecte a conta para confirmar o destino da publicação." };
  if (input.platform === "instagram" && input.scheduledAt && account.expiresAt && input.scheduledAt >= account.expiresAt) return { error: "A autorização do Instagram vence antes dessa data. Reconecte a conta ou escolha uma data anterior." };
  const identity = { videoId: video.id, videoUrl: video.resultUrl, platform: input.platform, caption: input.caption.trim(), scheduledAt: input.scheduledAt ?? null, accountId: account.id, accountUserId: account.providerUserId ?? account.igUserId, tiktok: tiktok ? { ...tiktok, consentAt: undefined } : undefined };
  const requestFingerprint = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  const hash = createHash("sha256").update(`post:${user.id}:${input.requestKey}`).digest("hex");
  const postId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const previous = (await listPosts(user.id)).find((p) => p.id === postId || (input.draftId && p.id === input.draftId && p.requestKey === input.requestKey));
  if (previous) return previous.requestFingerprint === requestFingerprint ? { id: previous.id } : { error: "O conteúdo mudou. Reabra a publicação antes de enviá-la." };

  if (input.draftId) {
    const draft = (await listPosts(user.id)).find(
      (post) => post.id === input.draftId,
    );
    if (!draft || draft.status !== "draft")
      return { error: "Este rascunho não está mais disponível." };
  }
  const values = {
    userId: user.id,
    videoId: video.id,
    platform: input.platform,
    caption: input.caption.trim(),
    scheduledAt:
      input.scheduledAt && input.scheduledAt > Date.now()
        ? input.scheduledAt
        : Date.now(),
    status: "scheduled" as const,
    mode: "live" as const,
    accountId: account.id,
    accountUserId: account.providerUserId ?? account.igUserId,
    requestKey: input.requestKey,
    requestFingerprint,
    tiktok,
    videoUrl: video.resultUrl,
    videoDuration,
    error: undefined,
  };
  const post = input.draftId
    ? await updatePost(input.draftId, values, "draft")
    : await createPostOnce({ ...values, id: postId });
  if (!post) return { error: "Não foi possível salvar a publicação." };
  if (post.deletedAt) return { error: "Este envio foi cancelado. Abra uma nova publicação se quiser enviar novamente." };
  if (post.requestFingerprint !== requestFingerprint) return { error: "O conteúdo mudou. Reabra a publicação antes de enviá-la." };

  // Dispara o agendador já — publicação imediata não espera o próximo tick.
  after(() => publisherTick());
  revalidatePath("/app", "layout");
  return { id: post.id };
}

/** Saves editorial work without connecting an account or touching a social API. */
export async function savePostDraftAction(input: {
  id?: string;
  videoId: string;
  platform: SocialPlatform;
  caption: string;
}): Promise<{ post: Post } | { error: string }> {
  const user = await requireUser();
  if (!input || typeof input.caption !== "string" || typeof input.videoId !== "string") return { error: "Dados da publicação inválidos." };
  if (input.platform !== "instagram" && input.platform !== "tiktok")
    return { error: "Rede inválida" };
  if (input.caption.trim().length > CAPTION_LIMIT)
    return { error: `A legenda deve ter até ${CAPTION_LIMIT} caracteres.` };
  const video = await getVideo(user.id, input.videoId);
  if (!video || video.deletedAt || video.status !== "completed" || !video.resultUrl)
    return { error: "Escolha um vídeo pronto para salvar o rascunho." };
  if (input.id) {
    const previous = (await listPosts(user.id)).find(
      (post) => post.id === input.id,
    );
    if (!previous || previous.status !== "draft")
      return { error: "Rascunho não encontrado." };
  }
  const values = {
    userId: user.id,
    videoId: input.videoId,
    platform: input.platform,
    caption: input.caption.trim(),
    status: "draft" as const,
    scheduledAt: Date.now(),
  };
  const post = input.id
    ? await updatePost(input.id, values, "draft")
    : await createPost(values);
  if (!post) return { error: "Não foi possível salvar o rascunho." };
  revalidatePath("/app/publicar");
  return { post };
}

/** Snapshot das publicações; processa a fila antes de responder. */
export async function pollPostsAction(): Promise<Post[]> {
  const user = await requireUser();
  await publisherTick().catch(() => undefined);
  return listPosts(user.id);
}

export async function deletePostAction(id: string): Promise<void> {
  const user = await requireUser();
  const post = (await listPosts(user.id)).find((item) => item.id === id);
  if (post?.status === "posting")
    throw new Error(
      "Aguarde a rede concluir o processamento antes de remover este registro.",
    );
  if (post && !(await deletePost(user.id, id)))
    throw new Error(
      "A publicação começou a ser processada e não pode mais ser cancelada por aqui.",
    );
  revalidatePath("/app", "layout");
}
