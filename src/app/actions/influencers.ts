"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  claimInfluencerSubmission, createInfluencerOnce, deleteInfluencer, failAbandonedInfluencerPreparation, getInfluencer, listInfluencers, markUnconfirmedInfluencerSubmission,
  refundInfluencerCredits, reserveInfluencerCredits, updateInfluencer, type Influencer,
} from "@/lib/db";
import { buildBrief } from "@/lib/prompt";
import {
  buildInfluencerPayload, checkInfluencerConfiguration, getInfluencerGenerationStatus,
  InfluencerGenerationError, influencerRequestIdentity, storeInfluencerReference,
  submitInfluencerGeneration, validateInfluencerInput, type CreateInfluencerInput,
} from "@/lib/influencer-generation";
import { SHEET_COST } from "@/lib/costs";

export type { CreateInfluencerInput } from "@/lib/influencer-generation";
type CreateResult = { id: string } | { error: string; retryable?: boolean };

async function failGeneration(influencer: Influencer, error: string) {
  // Ledger makes recovery safe if a worker stops between the refund and this update.
  await refundInfluencerCredits(influencer.userId, influencer.id);
  await updateInfluencer(influencer.id, { status: "failed", error, creditsRefunded: true, submissionUncertain: false }, influencer.userId);
}

async function createForUser(userId: string, value: CreateInfluencerInput, storedReferences = false): Promise<CreateResult> {
  let influencer: Influencer | undefined;
  let ownsSubmission = false;
  let sent = false;
  let submittedRequestId: string | undefined;
  try {
    const input = validateInfluencerInput(value, userId, storedReferences);
    const { id, fingerprint } = influencerRequestIdentity(userId, input);
    const existing = await getInfluencer(userId, id, true);
    if (existing) {
      if (existing.deletedAt || existing.requestFingerprint !== fingerprint) return { error: "Este pedido já foi utilizado. Inicie uma nova criação.", retryable: false };
      if (existing.status === "failed") return { error: existing.error ?? "Este pedido falhou. Use Tentar novamente no influencer.", retryable: !existing.submissionUncertain };
      return { id };
    }
    checkInfluencerConfiguration(Boolean(input.referenceUrl || input.styleReferenceUrl));
    influencer = {
      id, userId, name: input.name, tier: input.tier, selection: input.selection,
      brief: buildBrief(input.tier, input.selection, { identity: Boolean(input.referenceUrl), style: Boolean(input.styleReferenceUrl) }),
      seed: randomInt(1, 1_000_001), status: "queued", requestFingerprint: fingerprint, createdAt: Date.now(),
      referenceUploadIncomplete: Boolean(input.referenceUrl || input.styleReferenceUrl),
    };
    if (!await createInfluencerOnce(influencer)) return { id };
    ownsSubmission = true;
    // Save public references before any paid submission. Never send a data URI to the model.
    const [referenceUrl, styleReferenceUrl] = await Promise.all([
      storeInfluencerReference(input.referenceUrl, userId, id, "identity"),
      storeInfluencerReference(input.styleReferenceUrl, userId, id, "style"),
    ]);
    await updateInfluencer(id, { referenceUrl, styleReferenceUrl, referenceUploadIncomplete: false }, userId);
    if (!await reserveInfluencerCredits(userId, id, SHEET_COST)) {
      await failGeneration(influencer, `Créditos insuficientes (precisa de ${SHEET_COST}).`);
      return { error: `Créditos insuficientes (precisa de ${SHEET_COST}).`, retryable: true };
    }
    if (!await claimInfluencerSubmission(userId, id)) {
      await refundInfluencerCredits(userId, id);
      return { error: "A preparação foi interrompida. Inicie uma nova tentativa.", retryable: true };
    }
    sent = true;
    const queued = await submitInfluencerGeneration(buildInfluencerPayload({ ...input, referenceUrl, styleReferenceUrl }, influencer.seed), id);
    submittedRequestId = queued.requestId;
    await updateInfluencer(id, { requestId: queued.requestId, status: "processing" }, userId);
    revalidatePath("/app", "layout");
    return { id };
  } catch (caught) {
    const uncertain = caught instanceof InfluencerGenerationError ? caught.uncertain : sent;
    const message = caught instanceof InfluencerGenerationError ? caught.message : uncertain
      ? "A confirmação da geração está pendente. Não envie outro pedido; confira este influencer novamente."
      : "Não foi possível preparar o influencer. Tente novamente.";
    if (influencer && ownsSubmission) {
      try {
        if (uncertain) {
          await updateInfluencer(influencer.id, { status: submittedRequestId ? "processing" : "failed", ...(submittedRequestId ? { requestId: submittedRequestId } : {}), submissionUncertain: true, error: message }, userId);
        } else await failGeneration(influencer, message);
        revalidatePath("/app", "layout");
      } catch { /* A later poll recovers persisted reservations; never submit again here. */ }
    }
    return { error: message, retryable: !uncertain };
  }
}

export async function createInfluencerAction(input: CreateInfluencerInput): Promise<CreateResult> {
  const user = await requireUser();
  return createForUser(user.id, input);
}

/** Polls existing requests only. Failed submissions are never silently resubmitted. */
export async function pollInfluencersAction(): Promise<Influencer[]> {
  const user = await requireUser();
  const records = await listInfluencers(user.id);
  const pending = records.filter(i => i.status === "processing" || i.status === "queued" || (i.status === "failed" && i.requestFingerprint && !i.submissionUncertain && !i.creditsRefunded));
  let changed = false;
  await Promise.all(pending.slice(0, 20).map(async influencer => {
    try {
      if (influencer.status === "failed") {
        await failGeneration(influencer, influencer.error ?? "Não foi possível gerar o influencer.");
        changed = true;
        return;
      }
      if (influencer.requestId === "demo") {
        await failGeneration(influencer, "Este pedido antigo não foi enviado à IA. Crie um novo influencer.");
        changed = true;
        return;
      }
      if (!influencer.requestId) {
        if (influencer.submissionStartedAt) {
          if (!await markUnconfirmedInfluencerSubmission(user.id, influencer.id)) return;
        } else if (await failAbandonedInfluencerPreparation(user.id, influencer.id)) {
          await failGeneration(influencer, "A preparação foi interrompida. Tente novamente.");
        }
        changed = true;
        return;
      }
      const status = await getInfluencerGenerationStatus(influencer.requestId);
      if (status.status === "completed" && status.images.length) {
        await updateInfluencer(influencer.id, { status: "completed", imageUrl: status.images[0], gallery: status.images.slice(1), submissionUncertain: false, error: undefined }, user.id);
        changed = true;
      } else if (["completed", "failed", "nsfw", "canceled", "cancelled"].includes(status.status)) {
        await failGeneration(influencer, status.status === "nsfw" ? "A plataforma recusou esta geração. Revise as fotos e características." : "A plataforma não entregou uma imagem válida. Os créditos foram devolvidos.");
        changed = true;
      }
    } catch { /* Transient polling failures keep the same request for the next pass. */ }
  }));
  if (changed) revalidatePath("/app", "layout");
  return listInfluencers(user.id);
}

export async function deleteInfluencerAction(id: string): Promise<void> {
  const user = await requireUser();
  if (!await deleteInfluencer(user.id, id)) throw new Error("Não foi possível excluir este influencer. Aguarde a confirmação da geração e tente novamente.");
  revalidatePath("/app", "layout");
}

export async function renameInfluencerAction(id: string, value: string): Promise<{ name: string } | { error: string }> {
  const user = await requireUser();
  if (typeof value !== "string" || typeof id !== "string") return { error: "Nome inválido." };
  const name = value.trim();
  if (!name || name.length > 80) return { error: "Use um nome de 1 a 80 caracteres." };
  try {
    const influencer = await updateInfluencer(id, { name }, user.id);
    if (!influencer) return { error: "Influencer não encontrado." };
    revalidatePath("/app", "layout");
    return { name: influencer.name };
  } catch {
    return { error: "Não foi possível salvar o nome. Tente novamente." };
  }
}

export async function retryInfluencerAction(id: string, requestKey: string): Promise<CreateResult> {
  const user = await requireUser();
  const influencer = await getInfluencer(user.id, id);
  if (!influencer || influencer.deletedAt) return { error: "Influencer não encontrado", retryable: false };
  if (influencer.status !== "failed" || influencer.submissionUncertain) return { error: "Este pedido ainda não permite uma nova tentativa. Confira o status antes de gerar novamente.", retryable: false };
  if (influencer.referenceUploadIncomplete) return { error: "As fotos deste pedido não terminaram de enviar. Reenvie as fotos pelo formulário para criar o influencer.", retryable: false };
  return createForUser(user.id, {
    requestKey, name: influencer.name, tier: influencer.tier as CreateInfluencerInput["tier"], selection: influencer.selection,
    ...(influencer.referenceUrl ? { referenceUrl: influencer.referenceUrl } : {}),
    ...(influencer.styleReferenceUrl ? { styleReferenceUrl: influencer.styleReferenceUrl } : {}),
  }, true);
}
