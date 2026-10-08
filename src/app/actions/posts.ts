"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireUser } from "@/lib/auth";
import {
  createPost,
  deletePost,
  deleteSocialAccount,
  getSocialAccount,
  getVideo,
  listPosts,
  listSocialAccounts,
  upsertSocialAccount,
  updatePost,
  type Post,
  type SocialAccount,
  type SocialPlatform,
} from "@/lib/db";
import { publisherTick } from "@/lib/publisher";
import {
  instagramVerify,
  tiktokAuthorizeUrl,
  tiktokOAuthConfigured,
} from "@/lib/social";
import { CAPTION_LIMIT } from "@/lib/publish-caption";

export type AccountsSnapshot = {
  accounts: Array<
    Pick<SocialAccount, "platform" | "status" | "username" | "connectedAt">
  >;
  tiktokOAuth: boolean;
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
  };
}

/** Conecta o TikTok: com app configurado devolve a URL de OAuth; sem, cria
    uma conta demo para o fluxo completo funcionar localmente. */
export async function connectTiktokAction(): Promise<{
  redirect?: string;
  demo?: boolean;
}> {
  const user = await requireUser();
  if (tiktokOAuthConfigured()) {
    return { redirect: tiktokAuthorizeUrl(user.id) };
  }
  await upsertSocialAccount({
    userId: user.id,
    platform: "tiktok",
    status: "demo",
    accessToken: undefined,
    refreshToken: undefined,
    expiresAt: undefined,
    username: `maquina.${user.name.split(" ")[0]?.toLowerCase() || "demo"}`,
  });
  revalidatePath("/app", "layout");
  return { demo: true };
}

/** Conecta com credenciais válidas; demonstração exige uma escolha explícita. */
export async function connectInstagramAction(input: {
  igUserId?: string;
  accessToken?: string;
  demo?: boolean;
}): Promise<{ error?: string }> {
  const user = await requireUser();
  const igUserId = input.igUserId?.trim();
  const accessToken = input.accessToken?.trim();

  if (input.demo) {
    await upsertSocialAccount({
      userId: user.id,
      platform: "instagram",
      status: "demo",
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
      igUserId: undefined,
      username: `maquina.${user.name.split(" ")[0]?.toLowerCase() || "demo"}`,
    });
    revalidatePath("/app", "layout");
    return {};
  }
  if (!igUserId || !accessToken)
    return {
      error: "Preencha o ID da conta e o token para conectar o Instagram.",
    };

  try {
    const username = await instagramVerify(igUserId, accessToken);
    await upsertSocialAccount({
      userId: user.id,
      platform: "instagram",
      status: "connected",
      username,
      igUserId,
      accessToken,
    });
    revalidatePath("/app", "layout");
    return {};
  } catch (caught) {
    return {
      error: caught instanceof Error ? caught.message : "Conexão falhou",
    };
  }
}

export async function disconnectAccountAction(
  platform: SocialPlatform,
): Promise<void> {
  const user = await requireUser();
  await deleteSocialAccount(user.id, platform);
  revalidatePath("/app", "layout");
}

/** Agenda (ou dispara imediatamente) a publicação de um vídeo gerado. */
export async function schedulePostAction(input: {
  videoId: string;
  platform: SocialPlatform;
  caption: string;
  draftId?: string;
  /** Epoch ms; ausente = publicar agora. */
  scheduledAt?: number;
}): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
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
  if (!video) return { error: "Vídeo não encontrado" };
  if (video.status !== "completed" || !video.resultUrl) {
    return { error: "Espere o vídeo terminar de gerar antes de publicar" };
  }
  const account = await getSocialAccount(user.id, input.platform);
  if (!account) {
    return { error: "Conecte a conta dessa rede primeiro (página Publicar)" };
  }

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
    caption:
      input.caption.trim() ||
      video.presetName ||
      "Feito na Máquina de Influencers",
    scheduledAt:
      input.scheduledAt && input.scheduledAt > Date.now()
        ? input.scheduledAt
        : Date.now(),
    status: "scheduled" as const,
    mode: account.status === "demo" ? ("demo" as const) : ("live" as const),
    error: undefined,
  };
  const post = input.draftId
    ? await updatePost(input.draftId, values, "draft")
    : await createPost(values);
  if (!post) return { error: "Não foi possível salvar a publicação." };

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
  if (input.platform !== "instagram" && input.platform !== "tiktok")
    return { error: "Rede inválida" };
  if (input.caption.trim().length > CAPTION_LIMIT)
    return { error: `A legenda deve ter até ${CAPTION_LIMIT} caracteres.` };
  const video = await getVideo(user.id, input.videoId);
  if (!video || video.status !== "completed" || !video.resultUrl)
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
