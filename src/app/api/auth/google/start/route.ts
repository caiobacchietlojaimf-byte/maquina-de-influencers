import { NextResponse, type NextRequest } from "next/server";

import { createGoogleFlow, GOOGLE_FLOW_COOKIE, googleFlowCookieOptions, googleLoginConfigured } from "@/lib/google-auth";
import { getPlan } from "@/lib/plans";
import { rateLimit, requestIdentity } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Início do login com Google. É um POST de formulário (não um link) para que
   nenhum site externo consiga abrir o fluxo no navegador do usuário. */

function back(query: string): NextResponse {
  const response = NextResponse.redirect(new URL(`/login?${query}`, process.env.PUBLIC_BASE_URL || "http://localhost:3000"), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  let planId: string | undefined;
  try {
    const form = await request.formData();
    planId = getPlan(form.get("planId"))?.id;
  } catch {
    planId = undefined;
  }
  const planQuery = planId ? `&plano=${planId}` : "";

  if (!googleLoginConfigured()) return back(`erro=indisponivel${planQuery}`);
  if (!await rateLimit("google-start", await requestIdentity(), 30)) return back(`erro=limite${planQuery}`);

  try {
    const { cookie, url } = createGoogleFlow(planId);
    const response = NextResponse.redirect(url, 303);
    response.cookies.set(GOOGLE_FLOW_COOKIE, cookie, googleFlowCookieOptions);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return back(`erro=indisponivel${planQuery}`);
  }
}
