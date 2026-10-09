import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { serverDb } from "./server-db";
const memory = new Map<string, { count: number; expires: number }>();
export async function rateLimit(scope: string, identity: string, limit: number, windowMs = 600000) {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const id = createHmac("sha256", process.env.AUTH_SECRET || "local-limits").update(`${scope}:${identity}:${bucket}`).digest("hex");
  const expires = (bucket + 1) * windowMs;
  const db = serverDb();
  if (db) {
    const result = await db.rpc("mi_consume_rate_limit", { p_id: id, p_limit: limit, p_expires: expires, p_now: now });
    if (result.error) throw new Error("Controle de acesso indisponível. Tente novamente em instantes.");
    return result.data === true;
  }
  for (const [key, value] of memory) if (value.expires < now) memory.delete(key);
  const entry = memory.get(id) ?? { count: 0, expires }; entry.count++; memory.set(id, entry);
  return entry.count <= limit;
}
export async function requestIdentity() {
  const h = await headers();
  // Vercel replaces this header, unlike arbitrary client X-Forwarded-For.
  return process.env.VERCEL ? (h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown") : "local";
}
