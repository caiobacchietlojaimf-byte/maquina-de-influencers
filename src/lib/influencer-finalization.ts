import "server-only";

import {
  failAbandonedInfluencerPreparation, getInfluencer, markUnconfirmedInfluencerSubmission,
  refundInfluencerCredits, updateInfluencer, updatePendingInfluencer, type Influencer,
} from "@/lib/db";
import { getInfluencerGenerationStatus, getInfluencerImageEditStatus, storeInfluencerEditResult } from "@/lib/influencer-generation";

export async function failInfluencerGeneration(influencer: Influencer, error: string) {
  const claimed = await updatePendingInfluencer(influencer.userId, influencer.id, { status: "failed", error, submissionUncertain: false });
  const current = claimed ?? await getInfluencer(influencer.userId, influencer.id);
  if (!current || current.status !== "failed" || current.submissionUncertain) return;
  // Persist terminal failure before refunding. A later poll repairs this ledger
  // if the worker stops here, without letting a stale failure undo a success.
  await refundInfluencerCredits(influencer.userId, influencer.id);
  await updateInfluencer(influencer.id, { creditsRefunded: true }, influencer.userId);
}

/** Existing requests only. Safe from a browser poll or the authenticated cron. */
export async function finalizeInfluencers(records: Influencer[]): Promise<boolean> {
  let changed = false;
  const pending = records.filter(item => item.status === "processing" || item.status === "queued" || (item.status === "failed" && item.requestFingerprint && !item.submissionUncertain && !item.creditsRefunded));
  await Promise.all(pending.slice(0, 8).map(async snapshot => {
    const { userId, id } = snapshot;
    try {
      const influencer = await getInfluencer(userId, id);
      if (!influencer || influencer.status === "completed") return;
      await updatePendingInfluencer(userId, id, { completionCheckedAt: Date.now() });
      if (influencer.status === "failed") {
        if (!influencer.submissionUncertain && !influencer.creditsRefunded) {
          await failInfluencerGeneration(influencer, influencer.error ?? "Não foi possível gerar o influencer.");
          changed = true;
        }
        return;
      }
      if (influencer.requestId === "demo") {
        await failInfluencerGeneration(influencer, "Este pedido antigo não foi enviado à IA. Crie um novo influencer.");
        changed = true;
        return;
      }
      if (!influencer.requestId) {
        if (influencer.submissionStartedAt) {
          if (!await markUnconfirmedInfluencerSubmission(userId, id)) return;
        } else if (await failAbandonedInfluencerPreparation(userId, id)) {
          await failInfluencerGeneration(influencer, "A preparação foi interrompida. Tente novamente.");
        }
        changed = true;
        return;
      }
      const status = influencer.pendingImageUrl && influencer.provider === "fal"
        ? { status: "completed", images: [influencer.pendingImageUrl] }
        : influencer.provider === "fal"
          ? await getInfluencerImageEditStatus(influencer.requestId, influencer.model ?? "")
          : await getInfluencerGenerationStatus(influencer.requestId);
      if (status.status === "completed" && status.images.length) {
        let imageUrl = status.images[0];
        if (influencer.provider === "fal") {
          if (!await updatePendingInfluencer(userId, id, { pendingImageUrl: imageUrl })) return;
          try { imageUrl = await storeInfluencerEditResult(imageUrl, userId, id); }
          catch {
            // A completed image is not a failed generation: keep the same result
            // for storage-only retry and never refund/re-submit a paid request.
            await updatePendingInfluencer(userId, id, { error: "A imagem já foi gerada. O salvamento está pendente; atualize as versões para tentar salvar novamente, sem nova geração." });
            changed = true;
            return;
          }
        }
        await updatePendingInfluencer(userId, id, { status: "completed", imageUrl, gallery: status.images.slice(1), pendingImageUrl: undefined, submissionUncertain: false, error: undefined });
        changed = true;
      } else if (["completed", "failed", "nsfw", "canceled", "cancelled"].includes(status.status)) {
        await failInfluencerGeneration(influencer, status.status === "nsfw" ? "A plataforma recusou esta geração. Revise as fotos e características." : "A plataforma não entregou uma imagem válida. Os créditos foram devolvidos.");
        changed = true;
      }
    } catch { /* Transient provider/database failure retains the same queued request. */ }
  }));
  return changed;
}
