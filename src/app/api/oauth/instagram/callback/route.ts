import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { upsertSocialAccount } from "@/lib/db";
import { instagramExchangeCode, publicBaseUrl } from "@/lib/social";
import { oauthCookieName, oauthCookieOptions, verifyOAuthState } from "@/lib/social-oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const back = `${publicBaseUrl()}/app/publicar`;
  const respond = (query: string) => {
    const response = NextResponse.redirect(`${back}?${query}`);
    response.cookies.set(oauthCookieName("instagram"), "", { ...oauthCookieOptions, maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const userId = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096 || !userId || !verifyOAuthState(url.searchParams.get("state"), request.cookies.get(oauthCookieName("instagram"))?.value, userId, "instagram")) return respond("erro=oauth");
  try {
    const connection = await instagramExchangeCode(code);
    await upsertSocialAccount({ userId, platform: "instagram", status: "connected", ...connection });
    return respond("conectado=instagram");
  } catch { return respond("erro=oauth"); }
}
