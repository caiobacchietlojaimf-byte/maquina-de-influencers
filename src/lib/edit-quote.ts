import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { EditResolution } from "./character-edit";
import type { VideoMetadata } from "./video-reference";
export type EditReceipt = {
  id: string; userId: string; influencerId: string; imageUrl: string; sourceUrl: string;
  name: string; target: string; metadata: VideoMetadata; resolution: EditResolution;
  estimatedUsd: number; expiresAt: number;
};
function signature(value: string) {
  if (!process.env.AUTH_SECRET) throw new Error("Configuração da edição indisponível.");
  return createHmac("sha256", process.env.AUTH_SECRET).update(`character-edit-v1:${value}`).digest("base64url");
}
export function signEditQuote(receipt: EditReceipt) {
  const payload = Buffer.from(JSON.stringify(receipt)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function readEditQuote(token: string, userId: string): EditReceipt {
  try {
    const [payload, sig, extra] = token.split(".");
    if (!payload || !sig || extra) throw new Error();
    const expected = Buffer.from(signature(payload)), actual = Buffer.from(sig);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const receipt = JSON.parse(Buffer.from(payload, "base64url").toString()) as EditReceipt;
    if (receipt.userId !== userId || receipt.expiresAt <= Date.now()) throw new Error();
    return receipt;
  } catch { throw new Error("Preparação expirada ou inválida. Prepare a troca novamente."); }
}
