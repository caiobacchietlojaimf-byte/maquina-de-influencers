import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { findUserById, type User } from "./db";

/* Sessão: cookie httpOnly com "userId.expiro.assinatura" (HMAC-SHA256).
   Senhas: scrypt com salt por usuário. Sem dependências externas. */

export const SESSION_COOKIE = "mi_session";
const SESSION_TTL_S = 60 * 60 * 24 * 30;

function secret(): string {
  const env = process.env.AUTH_SECRET?.trim();
  if (env) return env;
  if (process.env.VERCEL) throw new Error("Autenticação indisponível");
  const dataDir =
    process.env.DATA_DIR ||
    (process.env.VERCEL ? "/tmp/maquina-data" : path.join(process.cwd(), "data"));
  const file = path.join(dataDir, ".secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(path.dirname(file), { recursive: true });
  const generated = randomBytes(32).toString("hex");
  writeFileSync(file, generated, "utf8");
  return generated;
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, salt: string, expected: string): boolean {
  const hash = scryptSync(password, salt, 64);
  const want = Buffer.from(expected, "hex");
  return hash.length === want.length && timingSafeEqual(hash, want);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function mintSession(userId: string): string {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token || token.length > 256) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(userId) || !/^\d{1,12}$/.test(expires)) return null;
  const payload = `${userId}.${expires}`;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) * 1000 < Date.now()) return null;
  return userId;
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_S,
};

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  // expires explícito além do maxAge: elimina qualquer chance de o navegador
  // tratar como cookie de sessão (que morre ao fechar o browser).
  jar.set(SESSION_COOKIE, mintSession(userId), {
    ...SESSION_COOKIE_OPTIONS,
    expires: new Date(Date.now() + SESSION_TTL_S * 1000),
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
}

/** Usuário logado ou null. Cacheado por requisição (layout + página = 1 query). */
export const currentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const userId = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await findUserById(userId);
  return user && !user.suspendedAt ? user : null;
});

/** Usuário logado ou lança (para server actions protegidas). */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new Error("Faça login para continuar");
  return user;
}

/** Usuário logado ou redireciona para /login (para páginas do /app). */
export async function requirePageUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
