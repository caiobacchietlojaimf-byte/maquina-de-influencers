import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { StudioReference } from "./video-reference";

type Payload = StudioReference & { userId: string; expires: number };
function signature(payload: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Armazenamento de referências não configurado.");
  return createHmac("sha256", secret).update(`video-reference:${payload}`).digest("base64url");
}
export function signUploadedReference(reference: StudioReference, userId: string): string {
  const payload = Buffer.from(JSON.stringify({ ...reference, userId, expires: Date.now() + 24 * 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readUploadedReference(token: string, userId: string): StudioReference {
  try {
    const [payload, sig, extra] = token.split(".");
    if (extra || !payload || !sig) throw new Error();
    const expected = Buffer.from(signature(payload)); const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error();
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as Payload;
    if (data.kind !== "upload" || data.userId !== userId || data.expires < Date.now()) throw new Error();
    return data;
  } catch { throw new Error("Referência inválida ou expirada. Envie o vídeo novamente."); }
}
