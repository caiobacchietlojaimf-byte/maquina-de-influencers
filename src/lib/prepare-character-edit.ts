import "server-only";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth";
import { getInfluencer, getViral } from "@/lib/db";
import { getProfile } from "@/data/ai-profiles";
import { getMotionPreset } from "@/data/motion-presets";
import { isAiCharacterVideo } from "@/lib/ai-discovery";
import { readUploadedReference } from "@/lib/uploaded-reference";
import { publicMediaUrl, readPublicVideo } from "@/lib/video-media";
import { mp4Metadata } from "@/lib/video-reference";
import { EDIT_ENGINES, MAIN_CHARACTER_TARGET, normalizeCharacterEditTarget, buildProviderEditInput, validateProviderEdit, estimateProviderEdit, isEditEngine, type EditEngine, type EditResolution, type EditTargetMode, type EditSource, type EditQuote } from "@/lib/character-edit";
import { signEditQuote } from "@/lib/edit-quote";
import { isConfigured } from "@/lib/platform";
import { isFalConfigured } from "@/lib/fal";
import { ensureVideoToolsAvailable } from "@/lib/finalize-edit";
import { splitContinuousEditSource } from "@/lib/edit-continuity";
import { CREDIT_PRICING_VERSION, usdToCredits } from "@/lib/credit-pricing";
import { EDIT_IDENTITY_VERSION, prepareCharacterIdentity } from "@/lib/prepare-character-identity";
import { capturePublicationReference } from "@/lib/publication-context";
export type PrepareOptions = { signal?: AbortSignal; onProgress?: (event: { type: "progress"; stage: string; message: string }) => void };

export async function prepareCharacterEdit(input: { influencerId: string; source: EditSource; target?: string; targetMode?: EditTargetMode; resolution: EditResolution; engine?: EditEngine }, options: PrepareOptions = {}): Promise<{ quote: EditQuote } | { error: string }> {
  let stage = "auth";
  const progress = (next: string, message: string) => { options.signal?.throwIfAborted(); stage = next; options.onProgress?.({ type: "progress", stage, message }); };
  try {
    progress("auth", "Conferindo sua sessão…");
    const user = await requireUser();
    options.signal?.throwIfAborted();
    const engine = input.engine ?? "higgsfield";
    if (!isEditEngine(engine)) return { error: "Modelo de edição inválido." };
    if (!(EDIT_ENGINES[engine].provider === "fal" ? isFalConfigured() : isConfigured())) return { error: "A API escolhida não está configurada no servidor." };
    if (!["480p", "720p", "1080p", "auto"].includes(input.resolution)) return { error: "Resolução inválida." };
    // Older clients supplied a manual description without a mode.
    const targetMode = input.targetMode ?? "manual";
    if (targetMode !== "main" && targetMode !== "manual") return { error: "Seleção de personagem inválida." };
    if (targetMode === "manual" && (typeof input.target !== "string" || input.target.trim().length < 8 || input.target.length > 500)) return { error: "Descreva quem será substituído (8 a 500 caracteres), incluindo roupa e posição no vídeo." };
    const target = normalizeCharacterEditTarget(targetMode === "main" ? MAIN_CHARACTER_TARGET : input.target!);
    progress("reference", "Conferindo o influencer e a referência…");
    const inf = await getInfluencer(user.id, input.influencerId);
    options.signal?.throwIfAborted();
    if (!inf?.imageUrl || inf.status !== "completed") return { error: "Selecione um influencer pronto da sua conta." };
    let url: string | undefined, name: string | undefined;
    const source = input.source;
    if (source.kind === "profile") {
      const profile = getProfile(source.handle), post = profile?.posts.find(p => p.code === source.id);
      url = post?.video; name = profile && post ? `@${profile.handle} · ${post.scene}` : undefined;
    } else if (source.kind === "viral") {
      const viral = await getViral(source.id);
      if (viral && isAiCharacterVideo(viral)) { url = viral.playUrl; name = viral.title; }
    } else if (source.kind === "preset") {
      const preset = getMotionPreset(source.id); url = preset?.drivingVideo; name = preset?.name;
    } else if (source.kind === "upload") {
      const uploaded = readUploadedReference(source.token, user.id); url = uploaded.videoUrl; name = uploaded.name;
    }
    if (!url || !name) return { error: "Vídeo original não encontrado. Selecione ou envie outra referência." };
    // Retain editorial provenance while dropping the signed upload credential.
    const sourceReference = source.kind === "upload" ? { kind: "upload" as const } : source;
    const sourceSnapshot = await capturePublicationReference(sourceReference);
    progress("download", "Baixando o vídeo original…");
    const bytes = await readPublicVideo(publicMediaUrl(url), undefined, options.signal);
    progress("inspect", "Conferindo duração, resolução e compatibilidade…");
    const metadata = mp4Metadata(bytes);
    const invalid = validateProviderEdit(engine, metadata, input.resolution, targetMode);
    if (invalid) return { error: invalid };
    await ensureVideoToolsAvailable();
    const id = randomUUID();
    progress("identity", "Preparando a identidade e a roupa do influencer…");
    const identity = await prepareCharacterIdentity(inf, metadata, engine, id, options.signal);
    // Freeze the ORIGINAL bytes: social/CDN links can expire while generation is queued.
    progress("snapshot", "Salvando o original para preservar imagem e áudio…");
    const snapshot = await put(`edit-sources/${user.id}/${id}.mp4`, bytes, { access: "public", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: false, abortSignal: options.signal });
    const sourceUrl = snapshot.url;
    const segments = [];
    if (engine.startsWith("fal-kling") && metadata.duration > 15) {
      progress("segments", "Preparando a continuidade do vídeo original…");
      const parts = await splitContinuousEditSource(bytes, metadata.duration, { signal: options.signal, onProgress: (completed, total) => {
        if (completed) progress("segments", `Conferindo os trechos preparados (${completed}/${total})…`);
      } });
      for (const [index, part] of parts.entries()) {
        progress("upload", `Salvando trecho ${index + 1} de ${parts.length}…`);
        const stored = await put(`edit-sources/${user.id}/${id}-${index}.mp4`, part.bytes, { access: "public", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: false, abortSignal: options.signal });
        segments.push({ sourceUrl: stored.url, start: part.start, source: mp4Metadata(part.bytes) });
      }
    } else segments.push({ sourceUrl, start: 0, source: metadata });
    for (const part of segments) buildProviderEditInput(engine, part.sourceUrl, inf.imageUrl, target, part.source.duration, input.resolution, 0, { identity, continuous: segments.length > 1 });
    const cost = estimateProviderEdit(engine, metadata, input.resolution, segments.map(s => s.source.duration));
    if (engine.startsWith("fal-kling") && segments.length > 1) cost.costDetail += " Inclui o intervalo compartilhado entre os trechos para melhorar a continuidade.";
    const receipt = { id, userId: user.id, influencerId: inf.id, imageUrl: inf.imageUrl, identityVersion: EDIT_IDENTITY_VERSION, identity, sourceUrl, name, target, metadata, resolution: input.resolution, engine, segments, ...(engine.startsWith("fal-kling") ? { assembly: "overlap-v1" as const } : {}), seed: Math.floor(Math.random() * 2147483647), estimatedUsd: cost.estimatedUsd, creditCost: usdToCredits(cost.estimatedUsd), creditPricingVersion: CREDIT_PRICING_VERSION, expiresAt: Date.now() + 15 * 60000 };
    progress("ready", "Original conferido. Preparação concluída.");
    return { quote: { token: signEditQuote({ ...receipt, sourceReference, sourceSnapshot }), name, sourceUrl, metadata, resolution: receipt.resolution, engine, segmentCount: segments.length, costDetail: cost.costDetail, estimatedUsd: receipt.estimatedUsd, creditCost: receipt.creditCost, expiresAt: receipt.expiresAt } };
  } catch (error) {
    if (options.signal?.aborted) return { error: "Preparação cancelada ou limite de espera atingido. Nenhuma geração foi iniciada." };
    // Log only the processing phase/type, never reference URLs, prompts or credentials.
    console.error("[prepare-edit]", { stage, errorType: error instanceof Error ? error.name : "unknown" });
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return { error: "O download do vídeo demorou demais. Tente novamente; nenhuma geração foi iniciada." };
    return { error: error instanceof Error ? error.message : "Não foi possível preparar o vídeo." };
  }
}
