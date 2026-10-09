import { NextResponse, type NextRequest } from "next/server";

import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { upsertSocialAccount } from "@/lib/db";
import { publicBaseUrl, tiktokExchangeCode } from "@/lib/social";
import { oauthCookieName, oauthCookieOptions, verifyOAuthState } from "@/lib/social-oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const back = `${publicBaseUrl()}/app/publicar`;

  const sessionUserId = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const respond = (query: string) => {
    const response = NextResponse.redirect(`${back}?${query}`);
    response.cookies.set(oauthCookieName("tiktok"), "", { ...oauthCookieOptions, maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  if (!code || code.length > 4096 || !sessionUserId || !verifyOAuthState(state, request.cookies.get(oauthCookieName("tiktok"))?.value, sessionUserId, "tiktok")) return respond("erro=oauth");

  try {
    const token = await tiktokExchangeCode(code);
    await upsertSocialAccount({
      userId: sessionUserId,
      platform: "tiktok",
      status: "connected",
      ...token,
    });
    return respond("conectado=tiktok");
  } catch {
    return respond("erro=oauth");
  }
}
