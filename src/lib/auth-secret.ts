import "server-only";

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/* Segredo HMAC compartilhado por sessões e fluxos de login (Google).
   Obrigatório via AUTH_SECRET na Vercel; no dev local cai num arquivo gerado. */

let generatedSecret: string | null = null;

export function authSecret(): string {
  const env = process.env.AUTH_SECRET?.trim();
  if (env) return env;
  if (process.env.VERCEL) throw new Error("Autenticação indisponível");
  if (generatedSecret) return generatedSecret;
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const file = path.join(dataDir, ".secret");
  if (existsSync(file)) return (generatedSecret = readFileSync(file, "utf8").trim());
  mkdirSync(path.dirname(file), { recursive: true });
  generatedSecret = randomBytes(32).toString("hex");
  writeFileSync(file, generatedSecret, "utf8");
  return generatedSecret;
}
