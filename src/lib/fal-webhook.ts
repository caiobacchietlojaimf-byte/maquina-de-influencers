import "server-only";
import { createHash, createPublicKey, verify } from "node:crypto";

const JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
let cachedKeys: Array<{ x: string }> = [];
let cachedAt = 0;

async function keys(refresh = false) {
  if (cachedKeys.length && Date.now() - cachedAt < (refresh ? 60_000 : 3600_000)) return cachedKeys;
  const response = await fetch(JWKS_URL, { redirect: "error", signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!response.ok) throw new Error("Fal signing keys unavailable");
  const body = await response.json();
  const found = Array.isArray(body?.keys) ? body.keys.filter((key: Record<string, unknown>) => key && typeof key.x === "string" && /^[A-Za-z0-9_-]{43}$/.test(key.x) && (!key.crv || key.crv === "Ed25519")) : [];
  if (!found.length) throw new Error("Fal signing keys unavailable");
  cachedKeys = found;
  cachedAt = Date.now();
  return cachedKeys;
}

/** Official Ed25519 signature over headers and SHA256(raw body), with a five-minute replay window. */
export async function verifyFalWebhook(headers: Headers, body: Buffer): Promise<boolean> {
  const requestId = headers.get("x-fal-webhook-request-id"), userId = headers.get("x-fal-webhook-user-id");
  const timestamp = headers.get("x-fal-webhook-timestamp"), signature = headers.get("x-fal-webhook-signature");
  if (!requestId || !userId || !timestamp || !signature || body.length > 64 * 1024) return false;
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(requestId) || !/^[A-Za-z0-9_-]{1,200}$/.test(userId) || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const message = Buffer.from([requestId, userId, timestamp, createHash("sha256").update(body).digest("hex")].join("\n"));
  const valid = (candidates: Array<{ x: string }>) => candidates.some(key => {
    try { return verify(null, message, createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: key.x }, format: "jwk" }), Buffer.from(signature, "hex")); }
    catch { return false; }
  });
  return valid(await keys()) || valid(await keys(true));
}
