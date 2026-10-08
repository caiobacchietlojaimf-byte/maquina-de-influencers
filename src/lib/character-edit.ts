import type { VideoMetadata } from "./video-reference";

export const CHARACTER_EDIT_MODEL = "higgsfield/genjutsu/object-swap/v1.0";
// Contract: https://open.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0/api-reference
export const EDIT_PRICE_DATE = "08/10/2026";
export type EditResolution = "720p" | "1080p";
// Official undiscounted input-second rates. Never assume account promotions.
// https://open.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0/playground
export const EDIT_RATES = { "720p": 0.681, "1080p": 1.632 } as const;
export type EditSource = { kind: "profile"; handle: string; id: string } | { kind: "viral" | "preset"; id: string } | { kind: "upload"; token: string };
export type EditQuote = {
  token: string; name: string; sourceUrl: string; metadata: VideoMetadata;
  resolution: EditResolution; estimatedUsd: number; expiresAt: number;
};
export function estimateEditUsd(duration: number, resolution: EditResolution): number {
  return Math.ceil(Math.ceil(duration) * EDIT_RATES[resolution] * 100) / 100;
}
export function validateEditSource(media: VideoMetadata): string | undefined {
  if (!Number.isFinite(media.duration) || media.duration < 4 || media.duration > 30) return "A troca de personagem aceita vídeos de 4 a 30 segundos. Envie um recorte; o sistema não corta o vídeo automaticamente.";
  if (!Number.isFinite(media.width * media.height) || media.width * media.height < 409600) return "O vídeo precisa ter pelo menos 409.600 pixels por quadro (por exemplo, 480 × 854). Envie o original em maior resolução.";
}
export function buildCharacterEditPrompt(target: string, duration: number): string {
  return [
    "Perform a localized character replacement in the SOURCE VIDEO. The source video is the authoritative scene and timeline, not a loose motion reference.",
    `Target exactly ONE source character, identified by this user description: ${JSON.stringify(target)}. Track that same person throughout every shot, including occlusions. Do not replace any other person.`,
    "Replace only that person's identity, body appearance and outfit with the character in reference image 1. Use the image ONLY for the replacement character, never its background, pose, camera or framing. Blend the replacement into the source lighting, shadows, perspective and occlusions.",
    `Preserve the entire ${duration.toFixed(3)}-second source timeline, original aspect ratio, frame composition, cuts, camera movement, gestures, expressions, choreography and timing. Do not shorten, loop, slow down, summarize or insert shots.`,
    "Keep all untargeted people, animals, objects, products, logos, captions, subtitles, background, lighting and interactions unchanged. Do not invent musicians, props, people, scenery or actions. Preserve the source audio. Return the edited video, not a still image.",
  ].join("\n");
}
export function checkEditResult(source: VideoMetadata, result: VideoMetadata): string | undefined {
  if (Math.abs(source.duration - result.duration) > 0.25) return `Duração divergente: original ${source.duration.toFixed(2)}s; resultado ${result.duration.toFixed(2)}s. O resultado precisa de revisão.`;
  if (!result.width || !result.height || Math.abs((result.width / result.height) / (source.width / source.height) - 1) > 0.02) return "A proporção do vídeo foi alterada pelo provedor. O resultado precisa de revisão.";
}
