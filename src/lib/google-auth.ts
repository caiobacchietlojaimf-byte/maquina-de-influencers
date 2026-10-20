import "server-only";

import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature,
  type JsonWebKey,
  type KeyObject,
} from "node:crypto";

import { authSecret } from "./auth-secret";

/* Login com Google: OpenID Connect (Authorization Code + PKCE) inteiro no
   servidor. O segredo do cliente nunca chega ao navegador; o que o navegador
   guarda é um cookie assinado com state, nonce e code_verifier do fluxo.
   O ID token é verificado por assinatura (JWKS do Google) e pelas claims
   iss/aud/exp/nonce antes de qualquer conta ser criada ou vinculada. */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const JWKS_TTL_MS = 60 * 60 * 1000;
const JWKS_RETRY_MS = 60 * 1000;

export const GOOGLE_FLOW_TTL_S = 600;
/** Cookie do fluxo em andamento (só viaja para /api/auth/google/*). */
export const GOOGLE_FLOW_COOKIE = "mi_google_oauth";
/** Cookie de vinculação pendente: conta com o mesmo e-mail precisa provar a senha. */
export const GOOGLE_LINK_COOKIE = "mi_google_link";

const secure = process.env.NODE_ENV === "production";
export const googleFlowCookieOptions = { httpOnly: true, secure, sameSite: "lax" as const, path: "/api/auth/google", maxAge: GOOGLE_FLOW_TTL_S };
export const googleLinkCookieOptions = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: GOOGLE_FLOW_TTL_S };

export type GoogleProfile = { sub: string; email: string; name: string };
export type GoogleFlow = { state: string; nonce: string; verifier: string; planId?: string; expires: number };
export type GoogleLink = { sub: string; email: string; name: string; planId?: string; expires: number };

export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function googleLoginConfigured(): boolean {
  return googleCredentials() !== null;
}

/** Mesmas regras de PUBLIC_BASE_URL dos callbacks sociais: HTTPS fixo, exceto localhost no dev. */
export function googleRedirectUri(): string {
  const url = new URL(process.env.PUBLIC_BASE_URL || "http://localhost:3000");
  const localDev = process.env.NODE_ENV !== "production" && url.hostname === "localhost";
  if (url.username || url.password || (url.protocol !== "https:" && !localDev)) {
    throw new Error("Configure PUBLIC_BASE_URL com HTTPS para o login com Google.");
  }
  return `${url.origin}/api/auth/google/callback`;
}

/* ---------- payloads assinados (cookies) ---------- */

function equal(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function sign(kind: string, payload: string): string {
  return createHmac("sha256", authSecret()).update(`google-${kind}:${payload}`).digest("base64url");
}

function seal(kind: string, data: object): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(kind, payload)}`;
}

function open(kind: string, value: string | undefined): Record<string, unknown> | null {
  if (!value || value.length > 2000) return null;
  const [payload, supplied, extra] = value.split(".");
  if (!payload || !supplied || extra !== undefined || !equal(sign(kind, payload), supplied)) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function freshExpiry(expires: unknown, now: number): expires is number {
  return typeof expires === "number" && expires > now && expires <= now + GOOGLE_FLOW_TTL_S * 1000;
}

/* ---------- início do fluxo ---------- */

export function createGoogleFlow(planId: string | undefined, now = Date.now()): { cookie: string; url: string } {
  const credentials = googleCredentials();
  if (!credentials) throw new Error("Login com Google não configurado.");
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  // PKCE: verifier de 64 caracteres não reservados; challenge S256.
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  const flow: GoogleFlow = { state, nonce, verifier, expires: now + GOOGLE_FLOW_TTL_S * 1000 };
  if (planId) flow.planId = planId;
  return { cookie: seal("flow", flow), url: `${AUTH_ENDPOINT}?${params}` };
}

/** Lê o cookie do fluxo e exige que o `state` devolvido pelo Google seja o mesmo. */
export function openGoogleFlow(cookie: string | undefined, state: string | null, now = Date.now()): GoogleFlow | null {
  if (!state || state.length > 200) return null;
  const data = open("flow", cookie);
  if (!data) return null;
  const { state: expected, nonce, verifier, planId, expires } = data;
  if (typeof expected !== "string" || typeof nonce !== "string" || typeof verifier !== "string") return null;
  if (!equal(expected, state) || nonce.length < 32 || verifier.length < 43 || !freshExpiry(expires, now)) return null;
  const flow: GoogleFlow = { state: expected, nonce, verifier, expires };
  if (typeof planId === "string") flow.planId = planId;
  return flow;
}

/* ---------- troca do código e verificação do ID token ---------- */

export async function exchangeGoogleCode(code: string, verifier: string): Promise<string> {
  const credentials = googleCredentials();
  if (!credentials) throw new Error("Login com Google não configurado.");
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("O Google recusou o código de autorização.");
  const body = (await response.json()) as { id_token?: unknown };
  if (typeof body.id_token !== "string" || body.id_token.length > 8192) throw new Error("Resposta inesperada do Google.");
  return body.id_token;
}

let jwks: { keys: Map<string, KeyObject>; fetchedAt: number } | null = null;

async function fetchJwks(): Promise<Map<string, KeyObject>> {
  const response = await fetch(JWKS_ENDPOINT, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Chaves do Google indisponíveis.");
  const body = (await response.json()) as { keys?: Array<Record<string, unknown>> };
  const keys = new Map<string, KeyObject>();
  for (const jwk of body.keys ?? []) {
    if (typeof jwk.kid !== "string" || jwk.kty !== "RSA") continue;
    try {
      keys.set(jwk.kid, createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" }));
    } catch {
      /* chave malformada: ignorada */
    }
  }
  return keys;
}

async function googleSigningKey(kid: string, now = Date.now()): Promise<KeyObject | null> {
  const stale = !jwks || now - jwks.fetchedAt > JWKS_TTL_MS;
  const missing = !jwks?.keys.has(kid) && (!jwks || now - jwks.fetchedAt > JWKS_RETRY_MS);
  if (stale || missing) jwks = { keys: await fetchJwks(), fetchedAt: now };
  return jwks?.keys.get(kid) ?? null;
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function displayName(claims: Record<string, unknown>, email: string): string {
  const local = email.split("@")[0].replace(/[._-]+/g, " ");
  const candidates = [claims.name, claims.given_name, local.charAt(0).toUpperCase() + local.slice(1)];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const name = candidate.replace(/\s+/g, " ").trim().slice(0, 100);
    if (name.length >= 2) return name;
  }
  return "Criador";
}

/** Claims obrigatórias de um ID token do Google (guia "Validate an ID token" do OpenID Connect do Google). */
export function validateGoogleClaims(
  claims: Record<string, unknown> | null,
  expected: { clientId: string; nonce: string; now?: number },
): GoogleProfile | null {
  if (!claims) return null;
  const now = expected.now ?? Date.now();
  const { iss, aud, exp, iat, nonce, sub, email, email_verified: verified } = claims;
  if (typeof iss !== "string" || !ISSUERS.has(iss)) return null;
  const audience = Array.isArray(aud) ? aud : [aud];
  if (!audience.includes(expected.clientId)) return null;
  if (typeof exp !== "number" || exp * 1000 <= now) return null;
  if (typeof iat !== "number" || iat * 1000 > now + 5 * 60 * 1000) return null;
  if (typeof nonce !== "string" || !equal(nonce, expected.nonce)) return null;
  if (typeof sub !== "string" || !/^[0-9]{1,255}$/.test(sub)) return null;
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (verified !== true) return null;
  const normalized = email.trim().toLowerCase();
  return { sub, email: normalized, name: displayName(claims, normalized) };
}

export async function verifyGoogleIdToken(
  token: string,
  expected: { clientId: string; nonce: string; now?: number },
  signingKey: (kid: string) => Promise<KeyObject | null> = googleSigningKey,
): Promise<GoogleProfile | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, rawSignature] = parts;
  const header = decodeSegment(rawHeader);
  if (!header || header.alg !== "RS256" || typeof header.kid !== "string") return null;
  const key = await signingKey(header.kid);
  if (!key) return null;
  const valid = verifySignature("RSA-SHA256", Buffer.from(`${rawHeader}.${rawPayload}`), key, Buffer.from(rawSignature, "base64url"));
  if (!valid) return null;
  return validateGoogleClaims(decodeSegment(rawPayload), expected);
}

/* ---------- vinculação pendente (mesmo e-mail, conta com senha) ---------- */

export function sealGoogleLink(link: Omit<GoogleLink, "expires">, now = Date.now()): string {
  const data: GoogleLink = { sub: link.sub, email: link.email, name: link.name, expires: now + GOOGLE_FLOW_TTL_S * 1000 };
  if (link.planId) data.planId = link.planId;
  return seal("link", data);
}

export function openGoogleLink(cookie: string | undefined, now = Date.now()): GoogleLink | null {
  const data = open("link", cookie);
  if (!data) return null;
  const { sub, email, name, planId, expires } = data;
  if (typeof sub !== "string" || typeof email !== "string" || typeof name !== "string" || !freshExpiry(expires, now)) return null;
  const link: GoogleLink = { sub, email, name, expires };
  if (typeof planId === "string") link.planId = planId;
  return link;
}

/* ---------- mensagens da tela de login ---------- */

const ERRORS: Record<string, string> = {
  cancelado: "Login com Google cancelado. Você pode tentar de novo ou entrar com e-mail e senha.",
  indisponivel: "O login com Google ainda não está disponível neste ambiente. Entre com e-mail e senha.",
  falhou: "Não foi possível concluir o login com Google. Tente novamente.",
  email: "Sua conta Google não tem um e-mail verificado. Use outra conta ou entre com e-mail e senha.",
  suspensa: "Esta conta está suspensa. Fale com o suporte para mais informações.",
  cadastros: "Novos cadastros estão temporariamente pausados.",
  limite: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
};

export function googleErrorMessage(code: string | undefined): string | null {
  return code ? ERRORS[code] ?? null : null;
}
