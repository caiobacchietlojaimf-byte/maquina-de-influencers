"use server";

import { revalidatePath } from "next/cache";

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
  type Post,
  type SocialAccount,
  type SocialPlatform,
} from "@/lib/db";
import { publisherTick } from "@/lib/publisher";
import { instagramVerify, tiktokAuthorizeUrl, tiktokOAuthConfigured } from "@/lib/social";

export type AccountsSnapshot = {
  accounts: Array<Pick<SocialAccount, "platform" | "status" | "username" | "connectedAt">>;
  tiktokOAuth: boolean;
};

export async function getAccountsAction(): Promise<AccountsSnapshot> {
  const user = await requireUser();
  return {
    accounts: listSocialAccounts(user.id).map((a) => ({
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
export async function connectTiktokAction(): Promise<{ redirect?: string }> {
  const user = await requireUser();
  if (tiktokOAuthConfigured()) {
    return { redirect: tiktokAuthorizeUrl(user.id) };
  }
  upsertSocialAccount({
    userId: user.id,
    platform: "tiktok",
    status: "demo",
    username: `maquina.${user.name.split(" ")[0]?.toLowerCase() || "demo"}`,
  });
  revalidatePath("/app", "layout");
  return {};
}

/** Conecta o Instagram com token do Graph API; campos vazios = conta demo. */
export async function connectInstagramAction(input: {
  igUserId?: string;
  accessToken?: string;
}): Promise<{ error?: string }> {
  const user = await requireUser();
  const igUserId = input.igUserId?.trim();
  const accessToken = input.accessToken?.trim();

  if (!igUserId || !accessToken) {
    upsertSocialAccount({
      userId: user.id,
      platform: "instagram",
      status: "demo",
      username: `maquina.${user.name.split(" ")[0]?.toLowerCase() || "demo"}`,
    });
    revalidatePath("/app", "layout");
    return {};
  }

  try {
    const username = await instagramVerify(igUserId, accessToken);
    upsertSocialAccount({
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
    return { error: caught instanceof Error ? caught.message : "Conexão falhou" };
  }
}

export async function disconnectAccountAction(platform: SocialPlatform): Promise<void> {
  const user = await requireUser();
  deleteSocialAccount(user.id, platform);
  revalidatePath("/app", "layout");
}

/** Agenda (ou dispara imediatamente) a publicação de um vídeo gerado. */
export async function schedulePostAction(input: {
  videoId: string;
  platform: SocialPlatform;
  caption: string;
  /** Epoch ms; ausente ou no passado = publicar agora. */
  scheduledAt?: number;
}): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  const video = getVideo(user.id, input.videoId);
  if (!video) return { error: "Vídeo não encontrado" };
  if (video.status !== "completed" || !video.resultUrl) {
    return { error: "Espere o vídeo terminar de gerar antes de publicar" };
  }
  if (!getSocialAccount(user.id, input.platform)) {
    return { error: "Conecte a conta dessa rede primeiro (página Publicar)" };
  }

  const post = createPost({
    userId: user.id,
    videoId: video.id,
    platform: input.platform,
    caption: input.caption.trim() || video.presetName || "Feito na Máquina de Influencers",
    scheduledAt: input.scheduledAt && input.scheduledAt > Date.now() ? input.scheduledAt : Date.now(),
    status: "scheduled",
  });

  // Dispara o agendador já — publicação imediata não espera o próximo tick.
  void publisherTick();
  revalidatePath("/app", "layout");
  return { id: post.id };
}

/** Snapshot das publicações; processa a fila antes de responder. */
export async function pollPostsAction(): Promise<Post[]> {
  const user = await requireUser();
  await publisherTick().catch(() => undefined);
  return listPosts(user.id);
}

export async function deletePostAction(id: string): Promise<void> {
  const user = await requireUser();
  deletePost(user.id, id);
  revalidatePath("/app", "layout");
}
