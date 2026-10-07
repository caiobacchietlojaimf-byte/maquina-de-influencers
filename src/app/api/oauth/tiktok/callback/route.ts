import { NextResponse, type NextRequest } from "next/server";

import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { upsertSocialAccount } from "@/lib/db";
import { publicBaseUrl, tiktokExchangeCode } from "@/lib/social";

/* Callback do OAuth do TikTok (Content Posting API). O `state` carrega o id
   do usuário que iniciou o fluxo; a sessão do cookie precisa bater com ele. */

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const back = `${publicBaseUrl()}/app/publicar`;

  const sessionUserId = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!code || !state || !sessionUserId || sessionUserId !== state) {
    return NextResponse.redirect(`${back}?erro=oauth`);
  }

  try {
    const token = await tiktokExchangeCode(code);
    upsertSocialAccount({
      userId: sessionUserId,
      platform: "tiktok",
      status: "connected",
      username: token.openId || "tiktok",
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
    });
    return NextResponse.redirect(`${back}?conectado=tiktok`);
  } catch {
    return NextResponse.redirect(`${back}?erro=oauth`);
  }
}
