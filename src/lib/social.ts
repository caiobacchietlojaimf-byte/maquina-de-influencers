import "server-only";

import type { SocialAccount } from "./db";

/* Conectores de publicação.

   TikTok — Content Posting API oficial:
   - OAuth: https://www.tiktok.com/v2/auth/authorize (client key/secret do app
     em developers.tiktok.com, escopo video.publish). Callback em
     /api/oauth/tiktok/callback.
   - Publicação: POST /v2/post/publish/video/init/ com PULL_FROM_URL — o TikTok
     baixa o vídeo da URL do resultado da geração.

   Instagram — Graph API (conta profissional):
   - O usuário cola o access token de longa duração + IG User ID na página
     Publicar (gerados no Meta for Developers).
   - Publicação: POST /{ig-user-id}/media (REELS) → poll status → media_publish.

   Sem credenciais configuradas, a conta fica em modo demo e o agendador
   simula a publicação. */

export function tiktokOAuthConfigured(): boolean {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function tiktokAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
    response_type: "code",
    scope: "user.info.basic,video.publish",
    redirect_uri: `${publicBaseUrl()}/api/oauth/tiktok/callback`,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

export async function tiktokExchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  openId: string;
}> {
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
      client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: `${publicBaseUrl()}/api/oauth/tiktok/callback`,
    }),
    cache: "no-store",
  });
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Troca de código do TikTok falhou");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: Date.now() + (data.expires_in ?? 86400) * 1000,
    openId: data.open_id ?? "",
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Publica no TikTok via PULL_FROM_URL. Retorna o publish_id. */
export async function tiktokPublish(
  account: SocialAccount,
  input: { videoUrl: string; caption: string },
): Promise<string> {
  const response = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: input.caption.slice(0, 2200),
        privacy_level: "SELF_ONLY",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: input.videoUrl,
      },
    }),
    cache: "no-store",
  });
  const data = await readJson(response);
  const publishId = (data.data as { publish_id?: string } | undefined)?.publish_id;
  if (!response.ok || !publishId) {
    const error = (data.error as { message?: string } | undefined)?.message;
    throw new Error(error || `Publicação no TikTok falhou (HTTP ${response.status})`);
  }
  return publishId;
}

const GRAPH = "https://graph.facebook.com/v21.0";

/** Valida um token do Instagram Graph e devolve o username da conta. */
export async function instagramVerify(igUserId: string, accessToken: string): Promise<string> {
  const response = await fetch(
    `${GRAPH}/${encodeURIComponent(igUserId)}?fields=username&access_token=${encodeURIComponent(accessToken)}`,
    { cache: "no-store" },
  );
  const data = await readJson(response);
  if (!response.ok || typeof data.username !== "string") {
    const error = (data.error as { message?: string } | undefined)?.message;
    throw new Error(error || "Token ou IG User ID inválidos");
  }
  return data.username;
}

/** Publica um Reel no Instagram: cria o container, espera processar, publica. */
export async function instagramPublish(
  account: SocialAccount,
  input: { videoUrl: string; caption: string },
): Promise<string> {
  if (!account.igUserId || !account.accessToken) throw new Error("Conta do Instagram incompleta");

  const create = await fetch(`${GRAPH}/${account.igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: input.videoUrl,
      caption: input.caption.slice(0, 2200),
      access_token: account.accessToken,
    }),
    cache: "no-store",
  });
  const created = await readJson(create);
  const containerId = created.id;
  if (!create.ok || typeof containerId !== "string") {
    const error = (created.error as { message?: string } | undefined)?.message;
    throw new Error(error || "Criação do container do Reel falhou");
  }

  // O Instagram processa o vídeo de forma assíncrona antes de permitir publicar.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await fetch(
      `${GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(account.accessToken)}`,
      { cache: "no-store" },
    );
    const payload = await readJson(status);
    if (payload.status_code === "FINISHED") break;
    if (payload.status_code === "ERROR") throw new Error("O Instagram rejeitou o vídeo");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const publish = await fetch(`${GRAPH}/${account.igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: account.accessToken }),
    cache: "no-store",
  });
  const published = await readJson(publish);
  if (!publish.ok || typeof published.id !== "string") {
    const error = (published.error as { message?: string } | undefined)?.message;
    throw new Error(error || "Publicação do Reel falhou");
  }
  return published.id;
}
