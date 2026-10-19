import "server-only";
import { head } from "@vercel/blob";
import sharp from "sharp";

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const IMPORT_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function validImportPath(path: unknown, userId: string): path is string {
  if (typeof path !== "string") return false;
  const prefix = `influencer-imports/${userId}/`;
  return path.startsWith(prefix) && /^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(path.slice(prefix.length));
}

/** Re-read the stored file: never trust the client's type, size or dimensions. */
export async function verifyImportedImage(path: string): Promise<{ url: string; width: number; height: number }> {
  const blob = await head(path);
  if (blob.size > MAX_IMPORT_BYTES || !IMPORT_CONTENT_TYPES.includes(blob.contentType)) throw new Error("Envie uma imagem PNG, JPG ou WebP de até 15 MB.");
  const response = await fetch(blob.url, { redirect: "error", signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível ler a imagem enviada.");
  const bytes = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000, animated: false }).metadata();
  if (!meta.width || !meta.height || (meta.pages ?? 1) !== 1 || !["png", "jpeg", "webp"].includes(meta.format ?? "")) throw new Error("A imagem está inválida ou é animada.");
  if (Math.min(meta.width, meta.height) < 512) throw new Error("A imagem precisa ter pelo menos 512 px no menor lado para servir de referência.");
  return { url: blob.url, width: meta.width, height: meta.height };
}
