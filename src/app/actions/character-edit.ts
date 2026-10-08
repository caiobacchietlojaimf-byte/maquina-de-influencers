"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth";
import { getInfluencer, getViral, getVideo, createVideoOnce, reserveVideoCredits, updateVideo, adjustCredits, type Video } from "@/lib/db";
import { getProfile } from "@/data/ai-profiles";
import { getMotionPreset } from "@/data/motion-presets";
import { isAiCharacterVideo } from "@/lib/ai-discovery";
import { readUploadedReference } from "@/lib/uploaded-reference";
import { publicMediaUrl, inspectPublicVideo, readPublicVideo } from "@/lib/video-media";
import { mp4Metadata } from "@/lib/video-reference";
import { EDIT_ENGINES, MAIN_CHARACTER_TARGET, buildCharacterEditPrompt, buildProviderEditInput, validateProviderEdit, estimateProviderEdit, isEditEngine, type EditEngine, type EditResolution, type EditTargetMode, type EditSource, type EditQuote } from "@/lib/character-edit";
import { readEditQuote, signEditQuote } from "@/lib/edit-quote";
import { isConfigured, submitGeneration, PlatformError } from "@/lib/platform";
import { VIDEO_COST } from "@/lib/costs";
import { ensureVideoToolsAvailable } from "@/lib/finalize-edit";
import { isFalConfigured, submitFalGeneration, FalError } from "@/lib/fal";
import { splitEditSource } from "@/lib/edit-segments";

export async function prepareCharacterEditAction(input: { influencerId: string; source: EditSource; target?: string; targetMode?: EditTargetMode; resolution: EditResolution; engine?: EditEngine }): Promise<{ quote: EditQuote } | { error: string }> {
  const user = await requireUser();
  try {
    const engine = input.engine ?? "higgsfield";
    if (!isEditEngine(engine)) return { error: "Modelo de edição inválido." };
    if (!(EDIT_ENGINES[engine].provider === "fal" ? isFalConfigured() : isConfigured())) return { error: "A API escolhida não está configurada no servidor." };
    if (!["480p", "720p", "1080p", "auto"].includes(input.resolution)) return { error: "Resolução inválida." };
    // Older clients supplied a manual description without a mode.
    const targetMode = input.targetMode ?? "manual";
    if (targetMode !== "main" && targetMode !== "manual") return { error: "Seleção de personagem inválida." };
    if (targetMode === "manual" && (typeof input.target !== "string" || input.target.trim().length < 8 || input.target.length > 500)) return { error: "Descreva quem será substituído (8 a 500 caracteres), incluindo roupa e posição no vídeo." };
    const target = targetMode === "main" ? MAIN_CHARACTER_TARGET : input.target!.trim();
    const inf = await getInfluencer(user.id, input.influencerId);
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
    const bytes = await readPublicVideo(publicMediaUrl(url));
    const metadata = mp4Metadata(bytes);
    const invalid = validateProviderEdit(engine, metadata, input.resolution, targetMode);
    if (invalid) return { error: invalid };
    await ensureVideoToolsAvailable();
    const id = randomUUID();
    // Freeze the ORIGINAL bytes: social/CDN links can expire while generation is queued.
    const snapshot = await put(`edit-sources/${user.id}/${id}.mp4`, bytes, { access: "public", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: false });
    const sourceUrl = snapshot.url;
    const segments = [];
    if (engine.startsWith("fal-kling") && metadata.duration > 15) {
      const parts = await splitEditSource(bytes, metadata.duration);
      for (const [index, part] of parts.entries()) {
        const stored = await put(`edit-sources/${user.id}/${id}-${index}.mp4`, part.bytes, { access: "public", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: false });
        segments.push({ sourceUrl: stored.url, start: part.start, source: mp4Metadata(part.bytes) });
      }
    } else segments.push({ sourceUrl, start: 0, source: metadata });
    const cost = estimateProviderEdit(engine, metadata, input.resolution, segments.map(s => s.source.duration));
    const receipt = { id, userId: user.id, influencerId: inf.id, imageUrl: inf.imageUrl, sourceUrl, name, target, metadata, resolution: input.resolution, engine, segments, seed: Math.floor(Math.random() * 2147483647), estimatedUsd: cost.estimatedUsd, expiresAt: Date.now() + 15 * 60000 };
    return { quote: { token: signEditQuote(receipt), name, sourceUrl, metadata, resolution: receipt.resolution, engine, segmentCount: segments.length, costDetail: cost.costDetail, estimatedUsd: receipt.estimatedUsd, expiresAt: receipt.expiresAt } };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível preparar o vídeo." }; }
}

export async function generateCharacterEditAction(input: { quoteToken: string; acceptedEstimate: boolean }): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  try {
    if (input.acceptedEstimate !== true) return { error: "Confira e aceite a estimativa antes de gerar." };
    const receipt = readEditQuote(input.quoteToken, user.id);
    const existing = await getVideo(user.id, receipt.id);
    if (existing) return { id: existing.id };
    const engine = receipt.engine ?? "higgsfield";
    if (!isEditEngine(engine)) return { error: "Preparação inválida." };
    const config = EDIT_ENGINES[engine];
    if (!(config.provider === "fal" ? isFalConfigured() : isConfigured())) return { error: "API de edição indisponível." };
    const inf = await getInfluencer(user.id, receipt.influencerId);
    if (!inf?.imageUrl || inf.imageUrl !== receipt.imageUrl || inf.status !== "completed") return { error: "O influencer foi alterado. Prepare a troca novamente." };
    const source = await inspectPublicVideo(receipt.sourceUrl);
    if (validateProviderEdit(engine, source, receipt.resolution, receipt.target === MAIN_CHARACTER_TARGET ? "main" : "manual") || Math.abs(source.duration - receipt.metadata.duration) > 0.05 || source.width !== receipt.metadata.width || source.height !== receipt.metadata.height || source.frameCount !== receipt.metadata.frameCount) return { error: "O vídeo original mudou. Prepare a troca novamente." };
    if (user.credits < VIDEO_COST) return { error: `Créditos insuficientes (precisa de ${VIDEO_COST}).` };
    const prompt = buildCharacterEditPrompt(receipt.target, source.duration);
    const segments = receipt.segments ?? [{ sourceUrl: receipt.sourceUrl, start: 0, source }];
    // Inspect every immutable segment BEFORE a paid submission or credit debit.
    if (segments.length > 1) for (const part of segments) {
      const actual = await inspectPublicVideo(part.sourceUrl);
      if (actual.duration < 3 || actual.duration > 15 || Math.abs(actual.duration - part.source.duration) > 0.05 || actual.width !== part.source.width || actual.height !== part.source.height) return { error: "Um trecho mudou. Prepare a troca novamente." };
    }
    const video: Video = { id: receipt.id, userId: user.id, influencerId: inf.id, kind: "viral", presetName: receipt.name, prompt, status: "queued", createdAt: Date.now(), edit: { model: config.model, provider: config.provider, sourceUrl: receipt.sourceUrl, imageUrl: inf.imageUrl, target: receipt.target, source, resolution: receipt.resolution, estimatedUsd: receipt.estimatedUsd, segments, seed: receipt.seed } };
    if (!await createVideoOnce(video)) return { id: video.id };
    if (!await reserveVideoCredits(user.id, VIDEO_COST)) { await updateVideo(video.id, { status: "failed", error: "Não foi possível reservar os créditos. Nenhuma chamada paga foi feita." }); return { error: "Créditos indisponíveis. Prepare novamente." }; }
    let providerRequestId: string | undefined;
    try {
      for (const part of video.edit!.segments!) {
        const payload = buildProviderEditInput(engine, part.sourceUrl, inf.imageUrl, receipt.target, part.source.duration, receipt.resolution, receipt.seed ?? 0);
        const queued = config.provider === "fal" ? await submitFalGeneration(config.model, payload) : await submitGeneration(config.model, payload);
        providerRequestId = queued.requestId;
        part.requestId = queued.requestId;
        await updateVideo(video.id, { requestId: video.edit!.segments![0].requestId, edit: video.edit });
      }
      // Only poll once ALL segment submissions are persisted.
      await updateVideo(video.id, { status: "processing" });
    } catch (error) {
      // A network/5xx failure can occur AFTER acceptance. Never silently retry or change models.
      const uncertain = Boolean(providerRequestId) || !(error instanceof PlatformError || error instanceof FalError) || error.status >= 500;
      await updateVideo(video.id, { status: uncertain ? "review" : "failed", edit: video.edit, ...(providerRequestId ? { requestId: video.edit!.segments![0].requestId ?? providerRequestId } : {}), error: uncertain ? "Uma solicitação pode ter sido aceita, mas o envio completo não foi confirmado. Confira os pedidos no provedor antes de repetir. Nenhum trecho será reenviado automaticamente." : (error instanceof Error ? error.message : "Edição recusada pelo provedor.") });
      if (!uncertain) await adjustCredits(user.id, VIDEO_COST);
      return { error: uncertain ? "Confirmação pendente: confira Meus Vídeos e as solicitações do provedor antes de repetir." : "O provedor recusou a edição. Veja os detalhes em Meus Vídeos; os créditos do sistema foram devolvidos." };
    }
    revalidatePath("/app", "layout");
    return { id: video.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível iniciar a edição." }; }
}
