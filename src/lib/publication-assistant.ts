import "server-only";

import { createHash } from "node:crypto";
import { claimVideoCaption, finishVideoCaption, finishVideoCaptionError, getInfluencer, getVideo, reserveCaptionRequest, type SocialPlatform } from "./db";
import { resolvePublicationContext } from "./publication-context";
import { generatePublicationCaption, CAPTION_PROVIDER_VERSION } from "./caption-provider";
import { getInstagramPerformance } from "./instagram-performance";
import { publicationFallback } from "./publication-fallback";
import type { CaptionGoal } from "./publish-caption";
import type { PublicationSuggestion } from "./publication-assistant-types";

export type PreparationInput = { videoId: string; platform: SocialPlatform; goal?: CaptionGoal };
export type ImprovementInput = PreparationInput & { caption: string };
type Result = { suggestion: PublicationSuggestion } | { error: string };
const FALLBACK_NOTICE = "Rascunho preparado pelo contexto da referência. A análise visual não ficou disponível; confira a cena antes de publicar.";
const IMPROVEMENT_ERROR = "Não foi possível concluir a melhoria. Sua legenda foi preservada; nenhuma nova análise será enviada automaticamente.";

function validSelection(input: PreparationInput): boolean {
  return Boolean(input && typeof input.videoId === "string" && input.videoId.length <= 100 && /^[a-zA-Z0-9_-]+$/.test(input.videoId)
    && ["instagram", "tiktok"].includes(input.platform) && ["comments", "shares", "saves", "follows"].includes(input.goal ?? "comments"));
}

/** Authentication belongs to the action; ownership is rechecked here before data or paid work. */
export async function preparePublication(userId: string, input: PreparationInput): Promise<Result> {
  if (!validSelection(input)) return { error: "Selecione um vídeo e uma rede válidos." };
  const goal = input.goal ?? "comments";
  const video = await getVideo(userId, input.videoId);
  if (!video || video.userId !== userId || video.deletedAt || video.status !== "completed" || !video.resultUrl) return { error: "Selecione um vídeo pronto da sua conta." };
  const influencer = video.influencerId ? await getInfluencer(userId, video.influencerId, true) : undefined;
  const context = await resolvePublicationContext(userId, video, influencer);
  const fingerprint = createHash("sha256").update(JSON.stringify({
    version: CAPTION_PROVIDER_VERSION, resultUrl: video.resultUrl, context, platform: input.platform, goal,
    configured: Boolean(process.env.FAL_KEY?.trim()),
  })).digest("hex");
  const slot = `${input.platform}:${goal}`;
  const claim = await claimVideoCaption(userId, video.id, slot, fingerprint, video.resultUrl);
  if (!claim) return { error: "O vídeo não está mais disponível." };
  if (claim.entry.resultUrl !== video.resultUrl) return { error: "O vídeo foi alterado. Sua análise anterior não será usada." };
  if (!claim.claimed) {
    if (claim.entry.state === "ready" && claim.entry.suggestion) return { suggestion: claim.entry.suggestion };
    // Another request already owns the paid call. Wait for its result, never submit twice.
    const deadline = Date.now() + 48_000;
    do {
      const current = await getVideo(userId, video.id);
      if (!current || current.deletedAt || current.status !== "completed" || current.resultUrl !== video.resultUrl) return { error: "O vídeo foi alterado. Selecione-o novamente." };
      const entry = current.captionCache?.[slot];
      if (entry?.claimId !== claim.entry.claimId) return { error: "A preparação mudou. Abra a publicação novamente." };
      if (entry.state === "ready" && entry.suggestion) return { suggestion: entry.suggestion };
      if (Date.now() - entry.startedAt > 90_000) {
        const suggestion = publicationFallback(video.id, context, goal, FALLBACK_NOTICE);
        if (await finishVideoCaption(userId, video.id, slot, entry.claimId, suggestion)) return { suggestion };
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (Date.now() < deadline);
    return { error: "A legenda ainda está sendo preparada. Abra a publicação novamente em instantes; sua edição foi preservada." };
  }
  let suggestion = publicationFallback(video.id, context, goal, FALLBACK_NOTICE);
  try {
    if (process.env.FAL_KEY?.trim() && await reserveCaptionRequest(userId)) {
      const performance = input.platform === "instagram" ? await getInstagramPerformance(userId) : undefined;
      const comparable = performance?.status === "ready" ? performance.posts.filter(post => Number.isSafeInteger(post.likes) && post.likes! >= 0 && Number.isSafeInteger(post.comments) && post.comments! >= 0) : [];
      const current = await getVideo(userId, video.id);
      if (!current || current.deletedAt || current.status !== "completed" || current.resultUrl !== video.resultUrl) return { error: "O vídeo mudou durante a preparação. Selecione-o novamente." };
      const result = await generatePublicationCaption({
        userId, video, context, goal, platform: input.platform,
        ...(performance && comparable.length >= 3 ? { performanceContext: {
          sampleSize: comparable.length, summary: performance.summary, recommendations: performance.recommendations,
          bestPosts: comparable.slice(0, 3).map(({ caption, likes, comments }) => ({ caption, likes, comments })),
        } } : {}),
      });
      suggestion = {
        ...suggestion, method: "ai", notice: undefined, caption: result.caption,
        alternatives: result.alternatives.map((caption, index) => ({ label: `Variação ${index + 2}`, caption })),
        keywords: result.keywords, hashtags: result.hashtags, generatedAt: Date.now(),
      };
    }
  } catch {
    // Persist the fallback after uncertain provider failures too. Reopening the
    // composer must not silently resubmit a billable analysis.
  }
  if (!await finishVideoCaption(userId, video.id, slot, claim.entry.claimId, suggestion)) return { error: "O vídeo mudou durante a preparação. Sua legenda atual foi preservada." };
  return { suggestion };
}

/** Explicit click only. Returns a proposal; never changes a draft or a live post. */
export async function improvePublication(userId: string, input: ImprovementInput): Promise<Result> {
  if (!validSelection(input) || typeof input.caption !== "string" || !input.caption.trim() || input.caption.length > 2200) return { error: "Escreva uma legenda de até 2.200 caracteres e selecione um vídeo pronto." };
  const video = await getVideo(userId, input.videoId);
  if (!video || video.userId !== userId || video.deletedAt || video.status !== "completed" || !video.resultUrl) return { error: "Selecione um vídeo pronto da sua conta." };
  if (!process.env.FAL_KEY?.trim()) return { error: "A melhoria por IA está indisponível agora. Sua legenda foi preservada." };
  const currentCaption = input.caption.normalize("NFC").trim();
  const goal = input.goal ?? "comments";
  const influencer = video.influencerId ? await getInfluencer(userId, video.influencerId, true) : undefined;
  const context = await resolvePublicationContext(userId, video, influencer);
  const fingerprint = createHash("sha256").update(JSON.stringify({ version: `${CAPTION_PROVIDER_VERSION}:improve-v1`, resultUrl: video.resultUrl, context, currentCaption, platform: input.platform, goal })).digest("hex");
  const slot = `${input.platform}:${goal}:improve`;
  const claim = await claimVideoCaption(userId, video.id, slot, fingerprint, video.resultUrl);
  if (!claim || claim.entry.resultUrl !== video.resultUrl) return { error: "O vídeo foi alterado. Selecione-o novamente." };
  if (!claim.claimed) {
    if (claim.entry.state === "pending" && Date.now() - claim.entry.startedAt > 90_000) {
      await finishVideoCaptionError(userId, video.id, slot, claim.entry.claimId, IMPROVEMENT_ERROR);
      return { error: IMPROVEMENT_ERROR };
    }
    if (claim.entry.fingerprint !== fingerprint) return { error: "Outra melhoria deste vídeo está em andamento. Aguarde antes de melhorar o novo texto." };
    const deadline = Date.now() + 48_000;
    do {
      const current = await getVideo(userId, video.id);
      if (!current || current.deletedAt || current.status !== "completed" || current.resultUrl !== video.resultUrl) return { error: "O vídeo mudou durante a melhoria. Sua legenda foi preservada." };
      const entry = current.captionCache?.[slot];
      if (!entry || entry.claimId !== claim.entry.claimId) return { error: "A melhoria foi atualizada. Tente novamente." };
      if (entry.state === "ready") return entry.suggestion ? { suggestion: entry.suggestion } : { error: entry.error ?? IMPROVEMENT_ERROR };
      if (Date.now() - entry.startedAt > 90_000) {
        await finishVideoCaptionError(userId, video.id, slot, entry.claimId, IMPROVEMENT_ERROR);
        return { error: IMPROVEMENT_ERROR };
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (Date.now() < deadline);
    return { error: "A melhoria ainda está em andamento. Sua legenda foi preservada; tente consultar novamente em instantes." };
  }
  try {
    if (!await reserveCaptionRequest(userId)) {
      const error = "O limite de análises foi atingido. Tente mais tarde; sua legenda foi preservada.";
      await finishVideoCaptionError(userId, video.id, slot, claim.entry.claimId, error, Date.now() + 3_600_000);
      return { error };
    }
    const performance = input.platform === "instagram" ? await getInstagramPerformance(userId) : undefined;
    const comparable = performance?.status === "ready" ? performance.posts.filter(post => Number.isSafeInteger(post.likes) && post.likes! >= 0 && Number.isSafeInteger(post.comments) && post.comments! >= 0) : [];
    const current = await getVideo(userId, video.id);
    if (!current || current.deletedAt || current.status !== "completed" || current.resultUrl !== video.resultUrl) return { error: "O vídeo mudou durante a melhoria. Sua legenda foi preservada." };
    const result = await generatePublicationCaption({
      userId, video, context, currentCaption, goal, platform: input.platform,
      ...(performance && comparable.length >= 3 ? { performanceContext: {
        sampleSize: comparable.length, summary: performance.summary, recommendations: performance.recommendations,
        bestPosts: comparable.slice(0, 3).map(({ caption, likes, comments }) => ({ caption, likes, comments })),
      } } : {}),
    });
    const suggestion: PublicationSuggestion = {
      ...publicationFallback(video.id, context, goal, ""), method: "ai", notice: undefined,
      caption: result.caption, alternatives: result.alternatives.map((caption, index) => ({ label: `Variação ${index + 2}`, caption })),
      keywords: result.keywords, hashtags: result.hashtags, generatedAt: Date.now(),
    };
    if (!await finishVideoCaption(userId, video.id, slot, claim.entry.claimId, suggestion)) return { error: "O vídeo mudou durante a melhoria. Sua legenda foi preservada." };
    return { suggestion };
  } catch {
    await finishVideoCaptionError(userId, video.id, slot, claim.entry.claimId, IMPROVEMENT_ERROR);
    return { error: IMPROVEMENT_ERROR };
  }
}
