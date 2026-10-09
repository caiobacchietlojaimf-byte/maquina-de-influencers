import type { VideoMetadata } from "./video-reference";

export const CHARACTER_EDIT_MODEL = "higgsfield/genjutsu/object-swap/v1.0";
export type EditEngine = "fal-kling-pro" | "fal-kling-standard" | "fal-wan" | "higgsfield";
export const EDIT_ENGINES = {
  "fal-kling-pro": { label: "fal.ai · Kling O3 Pro", model: "fal-ai/kling-video/o3/pro/video-to-video/edit", provider: "fal", resolutions: ["auto"], note: "Edição por instrução, com referência do personagem. Vídeos com mais de 15s de imagem usam trechos com uma passagem compartilhada para melhorar a continuidade. Ainda pode haver variação visual." },
  "fal-kling-standard": { label: "fal.ai · Kling O3 Standard", model: "fal-ai/kling-video/o3/standard/video-to-video/edit", provider: "fal", resolutions: ["auto"], note: "Edição por instrução com menor custo que Pro. Vídeos com mais de 15s de imagem usam trechos com uma passagem compartilhada para melhorar a continuidade. Ainda pode haver variação visual." },
  "fal-wan": { label: "fal.ai · Wan 2.2 Replace", model: "fal-ai/wan/v2.2-14b/animate/replace", provider: "fal", resolutions: ["480p", "720p"], note: "Esta integração libera originais 16:9 e 9:16 e confere a proporção ao finalizar. O Wan pode recortar a cena e não escolhe a pessoa por texto. Para vídeos 4:3 ou quadrados, escolha Kling." },
  higgsfield: { label: "Higgsfield · Genjutsu Object Swap", model: CHARACTER_EDIT_MODEL, provider: "higgsfield", resolutions: ["480p", "720p", "1080p"], note: "Troca localizada por instrução. Usa o saldo da Higgsfield." },
} as const;
export function isEditEngine(value: unknown): value is EditEngine { return typeof value === "string" && Object.hasOwn(EDIT_ENGINES, value); }
export function editModelLabel(model: string): string { return Object.values(EDIT_ENGINES).find(e => e.model === model)?.label ?? model; }
// Contract: https://open.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0/api-reference
export const EDIT_PRICE_DATE = "08/10/2026";
export type EditResolution = "480p" | "720p" | "1080p" | "auto";
export type EditTargetMode = "main" | "manual";
export type EditIdentityReferences = {
  strategy: "sheet-panels" | "single-image";
  frontalUrl?: string;
  appearanceUrl: string;
  wanUrl?: string;
};
export type EditProviderInputOptions = { identity?: EditIdentityReferences; continuous?: boolean };
export type EditPromptOptions = { appearanceLabel?: string; continuous?: boolean };
export const MAX_EDIT_TARGET_LENGTH = 500;
// Kling O3 edit's official schema limits the entire prompt, including continuity.
export const MAX_CHARACTER_EDIT_PROMPT_LENGTH = 2500;
export const MAIN_CHARACTER_TARGET = "Identify the main character of the source video: the person who is the sustained focus of the camera and action across the clip. Select exactly one person and track that same identity throughout; do not switch to bystanders, supporting performers or someone briefly crossing the foreground.";
// Official undiscounted input-second rates. Never assume account promotions.
// https://open.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0/playground
export const EDIT_RATES = { "480p": 0.318, "720p": 0.681, "1080p": 1.632 } as const;
export type EditSource = { kind: "profile"; handle: string; id: string } | { kind: "viral" | "preset"; id: string } | { kind: "upload"; token: string };
export type EditQuote = {
  token: string; name: string; sourceUrl: string; metadata: VideoMetadata;
  resolution: EditResolution; estimatedUsd: number; creditCost: number; expiresAt: number;
  engine?: EditEngine; costDetail?: string; segmentCount?: number;
};
export function estimateProviderEdit(engine: EditEngine, media: VideoMetadata, resolution: EditResolution, durations: number[] = [media.duration]): { estimatedUsd: number; costDetail: string } {
  if (engine === "higgsfield" && resolution !== "auto") return { estimatedUsd: estimateEditUsd(media.duration, resolution), costDetail: `${Math.ceil(media.duration)} segundos × US$ ${EDIT_RATES[resolution].toLocaleString("pt-BR", { minimumFractionDigits: 3 })}/s, antes de descontos` };
  if (engine === "fal-wan") {
    if (!media.frameCount || !Number.isSafeInteger(media.frameCount)) throw new Error("Não foi possível contar os quadros deste MP4 para calcular o Wan. Escolha Kling ou envie um MP4 não fragmentado.");
    const cents = resolution === "720p" ? 8 : 4;
    return { estimatedUsd: Math.ceil(media.frameCount * cents / 16) / 100, costDetail: `${media.frameCount} quadros ÷ 16 × US$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. A cobrança do Wan depende dos quadros de entrada.` };
  }
  const mills = engine === "fal-kling-pro" ? 168 : 126;
  const billable = durations.reduce((n, d) => n + Math.ceil(d), 0);
  return { estimatedUsd: Math.ceil(billable * mills / 10) / 100, costDetail: `Até ${billable}s estimados em ${durations.length} trecho(s) × US$ ${(mills / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3 })}/s. Estimativa arredondada por trecho; cobrança final da fal.ai.` };
}
export function validateProviderEdit(engine: EditEngine, media: VideoMetadata, resolution: EditResolution, targetMode: EditTargetMode): string | undefined {
  if (!(EDIT_ENGINES[engine].resolutions as readonly string[]).includes(resolution)) return "A resolução não é compatível com o modelo escolhido.";
  const invalid = validateEditSource(media);
  if (invalid) return invalid;
  if (engine === "fal-wan" && targetMode !== "main") return "Wan Replace não permite indicar uma pessoa. Escolha Kling para usar uma descrição.";
  if (engine === "fal-wan" && ![16 / 9, 9 / 16].some(ratio => Math.abs((media.width / media.height) / ratio - 1) <= 0.02)) return "O Wan pode recortar este formato de vídeo. Esta integração aceita originais 16:9 ou 9:16 e confere o resultado ao finalizar; escolha Kling para editar este original.";
  if (engine.startsWith("fal-kling") && (Math.min(media.width, media.height) < 720 || Math.max(media.width, media.height) > 3840)) return "O Kling exige um original entre 720 e 3840 pixels por lado. Envie o vídeo nessa resolução.";
}
export function buildProviderEditInput(engine: EditEngine, sourceUrl: string, imageUrl: string, target: string, duration: number, resolution: EditResolution, seed: number, options: EditProviderInputOptions = {}): Record<string, unknown> {
  const normalizedTarget = normalizeCharacterEditTarget(target);
  const appearanceUrl = options.identity?.appearanceUrl || imageUrl;
  const frontalUrl = options.identity?.strategy === "sheet-panels" ? options.identity.frontalUrl : undefined;
  // Wan has one image input and no prompt/element input. A prepared single view
  // avoids asking its center crop to choose between two reference-sheet panels.
  if (engine === "fal-wan") return { video_url: sourceUrl, image_url: options.identity?.wanUrl || appearanceUrl, resolution, seed, guidance_scale: 1, num_inference_steps: 20, use_turbo: false, video_quality: "maximum", video_write_mode: "balanced", enable_safety_checker: true, enable_output_safety_checker: true };
  if (engine === "higgsfield") {
    const prompt = buildCharacterEditPrompt(normalizedTarget, duration, "reference image 1", { appearanceLabel: frontalUrl ? "reference image 2" : "reference image 1", continuous: options.continuous });
    return { prompt, video_url: sourceUrl, image_urls: frontalUrl ? [frontalUrl, appearanceUrl] : [appearanceUrl], resolution };
  }
  // Official Kling O3 edit contract: @Element1 identifies a character using a
  // frontal image plus 1–3 additional views; @Image1 is the single-image fallback.
  // https://fal.ai/models/fal-ai/kling-video/o3/pro/video-to-video/edit/api
  const referenceLabel = frontalUrl ? "@Element1" : "@Image1";
  const prompt = checkCharacterEditPromptLength(`Edit @Video1.\n${buildCharacterEditPrompt(normalizedTarget, duration, referenceLabel, { continuous: options.continuous })}`);
  return {
    prompt, video_url: sourceUrl, keep_audio: true,
    ...(frontalUrl ? { elements: [{ frontal_image_url: frontalUrl, reference_image_urls: [appearanceUrl] }] } : { image_urls: [appearanceUrl] }),
  };
}
export function estimateEditUsd(duration: number, resolution: EditResolution): number {
  if (resolution === "auto") throw new Error("Escolha a resolução da Higgsfield.");
  // Rates have three decimal places; calculate in mills to avoid adding a
  // phantom cent from floating point (e.g. 30 × 0.318).
  return Math.ceil(Math.ceil(duration) * Math.round(EDIT_RATES[resolution] * 1000) / 10) / 100;
}
export function validateEditSource(media: VideoMetadata): string | undefined {
  if (!Number.isFinite(media.duration) || media.duration < 4 || media.duration > 30) return "A troca de personagem aceita vídeos de 4 a 30 segundos. Envie um recorte; o sistema não corta o vídeo automaticamente.";
  if (!Number.isFinite(media.width * media.height) || media.width * media.height < 409600) return "O vídeo precisa ter pelo menos 409.600 pixels por quadro (por exemplo, 480 × 854). Envie o original em maior resolução.";
}
export function normalizeCharacterEditTarget(target: string): string {
  if (typeof target !== "string" || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(target)) {
    throw new Error("A descrição da pessoa contém caracteres inválidos. Escreva uma descrição simples.");
  }
  const normalized = target.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!normalized || normalized.length > MAX_EDIT_TARGET_LENGTH) throw new Error(`Descreva a pessoa em até ${MAX_EDIT_TARGET_LENGTH} caracteres.`);
  return normalized;
}
function checkCharacterEditPromptLength(prompt: string): string {
  if (prompt.length > MAX_CHARACTER_EDIT_PROMPT_LENGTH) throw new Error("As instruções excedem o limite do modelo. Encurte a descrição da pessoa e prepare novamente.");
  return prompt;
}
/** Shared by provider payloads and exports; references never define a new scene. */
export function buildCharacterEditPrompt(target: string, duration: number, referenceLabel = "reference image 1", options: EditPromptOptions = {}): string {
  const normalizedTarget = normalizeCharacterEditTarget(target);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("A duração do vídeo é inválida. Prepare novamente.");
  const appearanceLabel = options.appearanceLabel ?? referenceLabel;
  return checkCharacterEditPromptLength([
    "Perform a localized character replacement in the SOURCE VIDEO, the authoritative scene and timeline.",
    `Target exactly ONE person: ${JSON.stringify(normalizedTarget)}. Track that same person throughout. Do not replace any other person.`,
    `Use ${referenceLabel} as the exact facial identity: facial proportions, eye shape/color, nose, mouth, jaw, hairline, skin tone and defining facial hair. Never blend with or retain the source actor's facial identity.`,
    `Use ${appearanceLabel} for the same character's body proportions, clothing, fit, colors and accessories. Never copy reference backgrounds, poses or framing.`,
    "Transfer source expressions, gaze and mouth motion without transferring source facial geometry. Maintain identity through head turns, profiles, blur and occlusions; no face morphing, flicker or substitutions.",
    `Preserve the entire ${duration.toFixed(3)}-second timeline, aspect ratio, composition, cuts, camera motion, gestures, choreography and timing. Match source lighting, perspective and shadows. Do not shorten, loop, retime or insert shots.`,
    "Keep all other people, animals, objects, products, logos, captions, subtitles and backgrounds unchanged. Preserve the source audio. Return the edited video, not a still image.",
    ...(options.continuous ? ["This is a temporally ordered excerpt of the same source video. Preserve any existing cuts. Keep exact screen position, body scale, distance, identity and outfit at both ends. Continue the action without a new entrance, pose, framing reset or ending."] : []),
  ].join("\n"));
}
export function checkEditResult(source: VideoMetadata, result: VideoMetadata): string | undefined {
  if (Math.abs(source.duration - result.duration) > 0.25) return `Duração divergente: original ${source.duration.toFixed(2)}s; resultado ${result.duration.toFixed(2)}s. O resultado precisa de revisão.`;
  const sourcePictures = source.videoDuration ?? source.duration;
  const resultPictures = result.videoDuration ?? result.duration;
  if (!Number.isFinite(resultPictures) || Math.abs(sourcePictures - resultPictures) > 0.25) return `Duração divergente nas imagens: original ${sourcePictures.toFixed(2)}s; resultado ${resultPictures.toFixed(2)}s. Uma faixa de áudio mais longa não substitui os quadros ausentes.`;
  if (!result.width || !result.height || Math.abs((result.width / result.height) / (source.width / source.height) - 1) > 0.02) return "A proporção do vídeo foi alterada pelo provedor. O resultado precisa de revisão.";
}
