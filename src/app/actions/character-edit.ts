"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getInfluencer, getVideo, createVideoOnce, reserveVideoCredits, updateVideo, adjustCredits, type Video } from "@/lib/db";
import { inspectPublicVideo } from "@/lib/video-media";
import { EDIT_ENGINES, MAIN_CHARACTER_TARGET, buildCharacterEditPrompt, buildProviderEditInput, validateProviderEdit, isEditEngine, type EditQuote } from "@/lib/character-edit";
import { readEditQuote } from "@/lib/edit-quote";
import { isConfigured, submitGeneration, PlatformError } from "@/lib/platform";
import { CREDIT_PRICING_VERSION, usdToCredits } from "@/lib/credit-pricing";
import { isFalConfigured, submitFalGeneration, FalError, falVideoWebhookUrl } from "@/lib/fal";

import { prepareCharacterEdit } from "@/lib/prepare-character-edit";

export async function prepareCharacterEditAction(input: Parameters<typeof prepareCharacterEdit>[0]): Promise<{ quote: EditQuote } | { error: string }> {
  return prepareCharacterEdit(input, { signal: AbortSignal.timeout(190000) });
}

export async function generateCharacterEditAction(input: { quoteToken: string; acceptedEstimate: boolean }): Promise<{ id: string } | { error: string }> {
  const user = await requireUser();
  try {
    if (input.acceptedEstimate !== true) return { error: "Confira e aceite a estimativa antes de gerar." };
    const receipt = readEditQuote(input.quoteToken, user.id);
    const existing = await getVideo(user.id, receipt.id);
    if (existing) return { id: existing.id };
    if (receipt.creditPricingVersion !== CREDIT_PRICING_VERSION || !Number.isSafeInteger(receipt.creditCost) || receipt.creditCost !== usdToCredits(receipt.estimatedUsd)) return { error: "O preço dos créditos mudou. Prepare a troca novamente para conferir o novo valor." };
    const creditCost = receipt.creditCost!;
    const engine = receipt.engine ?? "higgsfield";
    if (!isEditEngine(engine)) return { error: "Preparação inválida." };
    const config = EDIT_ENGINES[engine];
    if (!(config.provider === "fal" ? isFalConfigured() : isConfigured())) return { error: "API de edição indisponível." };
    const inf = await getInfluencer(user.id, receipt.influencerId);
    if (!inf?.imageUrl || inf.imageUrl !== receipt.imageUrl || inf.status !== "completed") return { error: "O influencer foi alterado. Prepare a troca novamente." };
    const source = await inspectPublicVideo(receipt.sourceUrl);
    if (validateProviderEdit(engine, source, receipt.resolution, receipt.target === MAIN_CHARACTER_TARGET ? "main" : "manual") || Math.abs(source.duration - receipt.metadata.duration) > 0.05 || source.width !== receipt.metadata.width || source.height !== receipt.metadata.height || source.frameCount !== receipt.metadata.frameCount) return { error: "O vídeo original mudou. Prepare a troca novamente." };
    if (user.credits < creditCost) return { error: `Créditos insuficientes (precisa de ${creditCost}).` };
    const prompt = buildCharacterEditPrompt(receipt.target, source.duration);
    const segments = receipt.segments ?? [{ sourceUrl: receipt.sourceUrl, start: 0, source }];
    // Inspect every immutable segment BEFORE a paid submission or credit debit.
    if (engine.startsWith("fal-kling") || segments.length > 1) for (const part of segments) {
      const actual = await inspectPublicVideo(part.sourceUrl);
      if (actual.duration < 3 || actual.duration > 15 || Math.abs(actual.duration - part.source.duration) > 0.05 || actual.width !== part.source.width || actual.height !== part.source.height) return { error: "Um trecho mudou. Prepare a troca novamente." };
    }
    const video: Video = { id: receipt.id, userId: user.id, influencerId: inf.id, kind: "viral", presetName: receipt.name, prompt, status: "queued", createdAt: Date.now(), creditCost, creditPricingVersion: CREDIT_PRICING_VERSION, edit: { model: config.model, provider: config.provider, sourceUrl: receipt.sourceUrl, imageUrl: inf.imageUrl, target: receipt.target, source, resolution: receipt.resolution, estimatedUsd: receipt.estimatedUsd, segments, seed: receipt.seed, ...(receipt.assembly ? { assembly: receipt.assembly } : {}) } };
    if (!await createVideoOnce(video)) return { id: video.id };
    if (!await reserveVideoCredits(user.id, creditCost)) { await updateVideo(video.id, { status: "failed", error: "Não foi possível reservar os créditos. Nenhuma chamada paga foi feita." }); return { error: "Créditos indisponíveis. Prepare novamente." }; }
    let providerRequestId: string | undefined;
    try {
      for (const part of video.edit!.segments!) {
        const payload = buildProviderEditInput(engine, part.sourceUrl, inf.imageUrl, receipt.target, part.source.duration, receipt.resolution, receipt.seed ?? 0);
        if (receipt.assembly === "overlap-v1" && segments.length > 1 && typeof payload.prompt === "string") {
          payload.prompt += "\nThis video is an overlapping excerpt of a longer continuous take. Keep the source person's exact screen position, body scale and distance from the camera throughout, especially at the first and last frames. Continue the existing action without introducing an entrance, a new pose, a framing reset or an ending. Keep the same face, hair, clothing fit, accessories and colors throughout the excerpt.";
        }
        const queued = config.provider === "fal" ? await submitFalGeneration(config.model, payload, falVideoWebhookUrl(video.id)) : await submitGeneration(config.model, payload);
        providerRequestId = queued.requestId;
        part.requestId = queued.requestId;
        await updateVideo(video.id, { requestId: video.edit!.segments![0].requestId, edit: video.edit });
      }
      // Only poll once ALL segment submissions are persisted.
      await updateVideo(video.id, { status: "processing" });
    } catch (error) {
      // A network/5xx failure can occur AFTER acceptance. Never silently retry or change models.
      const uncertain = Boolean(providerRequestId) || !(error instanceof PlatformError || error instanceof FalError) || error.status >= 500 || error.status === 408;
      await updateVideo(video.id, { status: uncertain ? "review" : "failed", edit: video.edit, ...(providerRequestId ? { requestId: video.edit!.segments![0].requestId ?? providerRequestId } : {}), error: uncertain ? "Uma solicitação pode ter sido aceita, mas o envio completo não foi confirmado. Confira os pedidos no provedor antes de repetir. Nenhum trecho será reenviado automaticamente." : (error instanceof Error ? error.message : "Edição recusada pelo provedor.") });
      if (!uncertain) await adjustCredits(user.id, creditCost);
      return { error: uncertain ? "Confirmação pendente: confira Meus Vídeos e as solicitações do provedor antes de repetir." : "O provedor recusou a edição. Veja os detalhes em Meus Vídeos; os créditos do sistema foram devolvidos." };
    }
    revalidatePath("/app", "layout");
    return { id: video.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível iniciar a edição." }; }
}
