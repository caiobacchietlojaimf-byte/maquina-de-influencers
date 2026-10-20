import { NextResponse, type NextRequest } from "next/server";

import { mintSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth";
import { getSystemSettings } from "@/lib/commerce";
import { createUser, findUserByEmail, findUserByGoogleId, type User } from "@/lib/db";
import {
  exchangeGoogleCode,
  GOOGLE_FLOW_COOKIE,
  GOOGLE_LINK_COOKIE,
  googleCredentials,
  googleFlowCookieOptions,
  googleLinkCookieOptions,
  openGoogleFlow,
  sealGoogleLink,
  verifyGoogleIdToken,
} from "@/lib/google-auth";
import { getPlan } from "@/lib/plans";
import { rateLimit, requestIdentity } from "@/lib/rate-limit";
import { initialCredits } from "@/lib/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/* Retorno do Google. Ordem das decisões:
   1. state/PKCE do cookie precisam bater com a resposta (anti-CSRF).
   2. ID token verificado por assinatura e claims; e-mail precisa estar verificado.
   3. Conta já vinculada (googleId) → entra, salvo se suspensa.
   4. Conta com o mesmo e-mail → NÃO vincula sozinho: pede a senha na tela de login.
   5. Ninguém com esse e-mail → cria conta, respeitando cadastros pausados e limite por IP. */

const SESSION_TTL_MS = SESSION_COOKIE_OPTIONS.maxAge * 1000;

function base(): string {
  return process.env.PUBLIC_BASE_URL || "http://localhost:3000";
}

function finish(response: NextResponse): NextResponse {
  response.cookies.set(GOOGLE_FLOW_COOKIE, "", { ...googleFlowCookieOptions, maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function toLogin(query: string): NextResponse {
  return finish(NextResponse.redirect(new URL(`/login?${query}`, base()), 303));
}

function signIn(user: User, planId: string | undefined): NextResponse {
  const plan = getPlan(planId);
  const response = NextResponse.redirect(new URL(plan ? `/app/planos?plano=${plan.id}` : "/app", base()), 303);
  response.cookies.set(SESSION_COOKIE, mintSession(user.id), { ...SESSION_COOKIE_OPTIONS, expires: new Date(Date.now() + SESSION_TTL_MS) });
  response.cookies.set(GOOGLE_LINK_COOKIE, "", { ...googleLinkCookieOptions, maxAge: 0 });
  return finish(response);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const flow = openGoogleFlow(request.cookies.get(GOOGLE_FLOW_COOKIE)?.value, url.searchParams.get("state"));
  const planQuery = flow?.planId && getPlan(flow.planId) ? `&plano=${flow.planId}` : "";

  const denied = url.searchParams.get("error");
  if (denied) return toLogin(`erro=${denied === "access_denied" ? "cancelado" : "falhou"}${planQuery}`);

  const credentials = googleCredentials();
  const code = url.searchParams.get("code");
  if (!credentials || !flow || !code || code.length > 2048) return toLogin(`erro=falhou${planQuery}`);
  if (!await rateLimit("google-callback", await requestIdentity(), 30)) return toLogin(`erro=limite${planQuery}`);

  let profile;
  try {
    const idToken = await exchangeGoogleCode(code, flow.verifier);
    profile = await verifyGoogleIdToken(idToken, { clientId: credentials.clientId, nonce: flow.nonce });
  } catch {
    return toLogin(`erro=falhou${planQuery}`);
  }
  if (!profile) return toLogin(`erro=email${planQuery}`);

  try {
    const linked = await findUserByGoogleId(profile.sub);
    if (linked) return linked.suspendedAt ? toLogin(`erro=suspensa${planQuery}`) : signIn(linked, flow.planId);

    const existing = await findUserByEmail(profile.email);
    if (existing) {
      if (existing.suspendedAt) return toLogin(`erro=suspensa${planQuery}`);
      const response = toLogin(`vincular=1${planQuery}`);
      response.cookies.set(GOOGLE_LINK_COOKIE, sealGoogleLink({ sub: profile.sub, email: profile.email, name: profile.name, planId: flow.planId }), googleLinkCookieOptions);
      return response;
    }

    if (!(await getSystemSettings()).registrationsOpen) return toLogin(`erro=cadastros${planQuery}`);
    if (!await rateLimit("register", await requestIdentity(), 5, 3600000)) return toLogin(`erro=limite${planQuery}`);
    const now = Date.now();
    try {
      const created = await createUser({ name: profile.name, email: profile.email, passwordHash: "", salt: "", credits: initialCredits(), googleId: profile.sub, googleLinkedAt: now });
      return signIn(created, flow.planId);
    } catch (error) {
      // Duas abas concluindo ao mesmo tempo: o índice único deixa só uma criar.
      const winner = await findUserByGoogleId(profile.sub);
      if (winner && !winner.suspendedAt) return signIn(winner, flow.planId);
      throw error;
    }
  } catch {
    return toLogin(`erro=falhou${planQuery}`);
  }
}
