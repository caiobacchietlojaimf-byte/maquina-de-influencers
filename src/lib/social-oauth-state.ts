import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SocialPlatform } from "./db";

export const OAUTH_TTL = 600;
export const oauthCookieName = (platform: SocialPlatform) => `mi_oauth_${platform}`;
export const oauthCookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const,
  path: "/api/oauth", maxAge: OAUTH_TTL,
};
function signature(payload: string): string {
  const secret = process.env.SOCIAL_TOKEN_SECRET;
  if (!secret) throw new Error("OAuth ainda não configurado.");
  return createHmac("sha256", secret).update(`social-oauth:${payload}`).digest("base64url");
}
export function createOAuthState(userId: string, platform: SocialPlatform): string {
  const payload = Buffer.from(JSON.stringify({ userId, platform, nonce: randomBytes(32).toString("base64url"), expires: Date.now() + OAUTH_TTL * 1000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
function equal(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function verifyOAuthState(state: string | null, cookie: string | undefined, userId: string | null, platform: SocialPlatform): boolean {
  if (!state || !cookie || !userId || state.length > 1500 || !equal(state, cookie)) return false;
  try {
    const [payload, supplied, extra] = state.split(".");
    if (!payload || !supplied || extra || !equal(signature(payload), supplied)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.userId === userId && data.platform === platform && typeof data.nonce === "string" && data.nonce.length >= 40 && data.expires > Date.now() && data.expires <= Date.now() + OAUTH_TTL * 1000;
  } catch { return false; }
}
