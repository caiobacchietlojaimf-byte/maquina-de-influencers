import { NextResponse, type NextRequest } from "next/server";

/* Renovação deslizante da sessão: toda visita a /app* com sessão válida
   re-emite o cookie com mais 30 dias — quem usa o site não desloga nunca.
   Roda no Edge, então o HMAC é WebCrypto e o segredo vem só de AUTH_SECRET
   (sem env, o middleware não mexe em nada e o cookie original segue valendo). */

const COOKIE = "mi_session";
const TTL_S = 60 * 60 * 24 * 30;
/** Renova quando o token já viveu mais que isso (evita re-set em toda request). */
const RENEW_AFTER_S = 60 * 60;

const encoder = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;

function hmacKey(secret: string): Promise<CryptoKey> {
  keyPromise ??= crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return keyPromise;
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return toBase64Url(signature);
}

export async function middleware(request: NextRequest) {
  const secret = process.env.AUTH_SECRET?.trim();
  const token = request.cookies.get(COOKIE)?.value;
  if (!secret || !token) return NextResponse.next();

  const parts = token.split(".");
  if (parts.length !== 3) return NextResponse.next();
  const [userId, expiresRaw, signature] = parts;
  const expires = Number(expiresRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(expires) || expires <= now) return NextResponse.next();

  const expected = await sign(`${userId}.${expiresRaw}`, secret);
  if (expected !== signature) return NextResponse.next();

  // Token válido: renova se já tiver mais de 1h de vida consumida.
  const issuedAt = expires - TTL_S;
  if (now - issuedAt < RENEW_AFTER_S) return NextResponse.next();

  const freshExpires = now + TTL_S;
  const freshToken = `${userId}.${freshExpires}.${await sign(`${userId}.${freshExpires}`, secret)}`;
  const response = NextResponse.next();
  response.cookies.set(COOKIE, freshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_S,
    expires: new Date(freshExpires * 1000),
  });
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/app"],
};
