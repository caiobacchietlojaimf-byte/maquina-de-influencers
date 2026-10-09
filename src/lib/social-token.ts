import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
function key(): Buffer {
  const value = process.env.SOCIAL_TOKEN_SECRET?.trim() ?? "";
  const bytes = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (bytes.length !== 32) throw new Error("A conexão social ainda não foi configurada no servidor.");
  return bytes;
}
export function socialTokenConfigured(): boolean {
  try { key(); return true; } catch { return false; }
}
/** Tokens are authenticated against their owner/platform, not just encrypted. */
export function sealSocialToken(token: string | undefined, owner: string): string | undefined {
  if (!token) return undefined;
  if (token.startsWith(PREFIX)) { openSocialToken(token, owner); return token; }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(owner));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}
export function openSocialToken(token: string | undefined, owner: string): string {
  if (!token?.startsWith(PREFIX)) throw new Error("Reconecte a conta para renovar a autorização com segurança.");
  try {
    const bytes = Buffer.from(token.slice(PREFIX.length), "base64url");
    if (bytes.length < 29) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(owner));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
  } catch { throw new Error("Reconecte a conta para renovar a autorização com segurança."); }
}
