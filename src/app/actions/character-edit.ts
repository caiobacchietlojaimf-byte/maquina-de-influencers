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
import { CHARACTER_EDIT_MODEL, buildCharacterEditPrompt, validateEditSource, estimateEditUsd, type EditResolution, type EditSource, type EditQuote } from "@/lib/character-edit";
import { readEditQuote, signEditQuote } from "@/lib/edit-quote";
import { isConfigured, submitGeneration, PlatformError } from "@/lib/platform";
import { VIDEO_COST } from "@/lib/costs";
import { ensureVideoToolsAvailable } from "@/lib/finalize-edit";

export async function prepareCharacterEditAction(input: { influencerId: string; source: EditSource; target: string; resolution: EditResolution }): Promise<{ quote: EditQuote } | { error: string }> {
  const user = await requireUser();
  try {
    if (!isConfigured()) return { error: "A API de edição não está configurada. Nenhuma geração será simulada." };
    if (!["720p", "1080p"].includes(input.resolution)) return { error: "Resolução inválida." };
    if (typeof input.target !== "string" || input.target.trim().length < 8 || input.target.length > 500) return { error: "Descreva quem será substituído (8 a 500 caracteres), incluindo roupa e posição no vídeo." };
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
    const invalid = validateEditSource(metadata);
    if (invalid) return { error: invalid };
    await ensureVideoToolsAvailable();
    const id = randomUUID();
    // Freeze the ORIGINAL bytes: social/CDN links can expire while generation is queued.
    const snapshot = await put(`edit-sources/${user.id}/${id}.mp4`, bytes, { access: "public", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: false });
    const sourceUrl = snapshot.url;
    const receipt = { id, userId: user.id, influencerId: inf.id, imageUrl: inf.imageUrl, sourceUrl, name, target: input.target.trim(), metadata, resolution: input.resolution, estimatedUsd: estimateEditUsd(metadata.duration, input.resolution), expiresAt: Date.now() + 15 * 60000 };
    return { quote: { token: signEditQuote(receipt), name, sourceUrl, metadata, resolution: receipt.resolution, estimatedUsd: receipt.estimatedUsd, expiresAt: receipt.expiresAt } };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível preparar o vídeo." }; }
}

export async function generateCharacterEditAction(input: { quoteToken: string; acceptedEstimate: boolean }): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  try {
    if (input.acceptedEstimate !== true) return { error: "Confira e aceite a estimativa antes de gerar." };
    const receipt = readEditQuote(input.quoteToken, user.id);
    const existing = await getVideo(user.id, receipt.id);
    if (existing) return { id: existing.id };
    if (!isConfigured()) return { error: "API de edição indisponível." };
    const inf = await getInfluencer(user.id, receipt.influencerId);
    if (!inf?.imageUrl || inf.imageUrl !== receipt.imageUrl || inf.status !== "completed") return { error: "O influencer foi alterado. Prepare a troca novamente." };
    const source = await inspectPublicVideo(receipt.sourceUrl);
    if (validateEditSource(source) || Math.abs(source.duration - receipt.metadata.duration) > 0.05 || source.width !== receipt.metadata.width || source.height !== receipt.metadata.height) return { error: "O vídeo original mudou. Prepare a troca novamente." };
    if (user.credits < VIDEO_COST) return { error: `Créditos insuficientes (precisa de ${VIDEO_COST}).` };
    const prompt = buildCharacterEditPrompt(receipt.target, source.duration);
    const video: Video = { id: receipt.id, userId: user.id, influencerId: inf.id, kind: "viral", presetName: receipt.name, prompt, status: "queued", createdAt: Date.now(), edit: { model: CHARACTER_EDIT_MODEL, sourceUrl: receipt.sourceUrl, imageUrl: inf.imageUrl, target: receipt.target, source, resolution: receipt.resolution, estimatedUsd: receipt.estimatedUsd } };
    if (!await createVideoOnce(video)) return { id: video.id };
    if (!await reserveVideoCredits(user.id, VIDEO_COST)) { await updateVideo(video.id, { status: "failed", error: "Não foi possível reservar os créditos. Nenhuma chamada paga foi feita." }); return { error: "Créditos indisponíveis. Prepare novamente." }; }
    let providerRequestId: string | undefined;
    try {
      const queued = await submitGeneration(CHARACTER_EDIT_MODEL, { prompt, video_url: receipt.sourceUrl, image_urls: [inf.imageUrl], resolution: receipt.resolution });
      providerRequestId = queued.requestId;
      await updateVideo(video.id, { status: "processing", requestId: queued.requestId });
    } catch (error) {
      // A network/5xx failure can occur AFTER acceptance. Never silently retry or change models.
      const uncertain = !(error instanceof PlatformError) || error.status >= 500;
      await updateVideo(video.id, { status: uncertain ? "review" : "failed", ...(providerRequestId ? { requestId: providerRequestId } : {}), error: uncertain ? "A confirmação do provedor não chegou. Confira as solicitações na Higgsfield antes de gerar novamente; a cobrança pode ter ocorrido." : (error instanceof Error ? error.message : "Edição recusada pelo provedor.") });
      if (!uncertain) await adjustCredits(user.id, VIDEO_COST);
      return { error: uncertain ? "Confirmação pendente: confira Meus Vídeos e as solicitações da Higgsfield antes de repetir." : "O provedor recusou a edição. Veja os detalhes em Meus Vídeos; os créditos do sistema foram devolvidos." };
    }
    revalidatePath("/app", "layout");
    return { id: video.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível iniciar a edição." }; }
}
