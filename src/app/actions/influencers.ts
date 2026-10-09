"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  claimInfluencerSubmission, createInfluencerOnce, deleteInfluencer, getInfluencer, listInfluencers,
  refundInfluencerCredits, reserveInfluencerCredits, updateInfluencer, type Influencer,
} from "@/lib/db";
import { buildBrief } from "@/lib/prompt";
import {
  buildInfluencerPayload, checkInfluencerConfiguration,
  InfluencerGenerationError, influencerRequestIdentity, storeInfluencerReference,
  submitInfluencerGeneration, validateInfluencerInput, type CreateInfluencerInput,
  buildInfluencerImageEditPayload, INFLUENCER_IMAGE_EDIT_MODEL, INFLUENCER_MODEL,
  publicImageUrl, submitInfluencerImageEdit, validateInfluencerVariantInput, type CreateInfluencerVariantInput,
} from "@/lib/influencer-generation";
import { INFLUENCER_EDIT_COST, INFLUENCER_PROMPT_COST, SHEET_COST } from "@/lib/costs";
import { failInfluencerGeneration as failGeneration, finalizeInfluencers } from "@/lib/influencer-finalization";

export type { CreateInfluencerInput, CreateInfluencerVariantInput } from "@/lib/influencer-generation";
type CreateResult = { id: string } | { error: string; retryable?: boolean };
type VariantContext = { input: CreateInfluencerVariantInput; root: Influencer; source: Influencer };

async function createForUser(userId: string, value: CreateInfluencerInput, storedReferences = false, variant?: VariantContext): Promise<CreateResult> {
  let influencer: Influencer | undefined;
  let ownsSubmission = false;
  let sent = false;
  let submittedRequestId: string | undefined;
  try {
    // Variant inputs and all source references are validated/resolved by the
    // owned-record path below; callers never control a source image URL.
    const input = variant ? value : validateInfluencerInput(value, userId, storedReferences);
    const { id, fingerprint } = influencerRequestIdentity(userId, variant?.input ?? input);
    const existing = await getInfluencer(userId, id, true);
    if (existing) {
      if (existing.deletedAt || existing.requestFingerprint !== fingerprint) return { error: "Este pedido já foi utilizado. Inicie uma nova criação.", retryable: false };
      if (existing.status === "failed") return { error: existing.error ?? "Este pedido falhou. Use Tentar novamente no influencer.", retryable: !existing.submissionUncertain };
      return { id };
    }
    const provider = variant || input.mode === "prompt" ? "fal" : "higgsfield";
    const creditCost = variant ? INFLUENCER_EDIT_COST : input.mode === "prompt" ? INFLUENCER_PROMPT_COST : SHEET_COST;
    checkInfluencerConfiguration(Boolean(input.referenceUrl || input.styleReferenceUrl), provider);
    influencer = {
      id, userId, name: input.name, tier: input.tier, selection: input.selection,
      brief: provider === "fal" ? (variant
        ? buildInfluencerImageEditPayload({ ...input, referenceUrl: variant.source.imageUrl }, variant.input.kind).prompt
        : "") : buildBrief(input.tier, input.selection, { identity: Boolean(input.referenceUrl), style: Boolean(input.styleReferenceUrl), prompt: input.prompt }),
      seed: randomInt(1, 1_000_001), status: "queued", requestFingerprint: fingerprint, createdAt: Date.now(),
      referenceUploadIncomplete: Boolean(input.referenceUrl || input.styleReferenceUrl),
      creationMode: variant ? "edit" : input.mode ?? "form", prompt: input.prompt,
      provider, model: provider === "fal" ? INFLUENCER_IMAGE_EDIT_MODEL : INFLUENCER_MODEL, creditCost,
      ...(variant ? { rootInfluencerId: variant.root.id, sourceInfluencerId: variant.source.id, variantLabel: variant.input.name || (variant.input.kind === "outfit" ? "Nova roupa" : "Ajuste de detalhes"), editKind: variant.input.kind } : {}),
    };
    if (!await createInfluencerOnce(influencer)) {
      const winner = await getInfluencer(userId, id, true);
      return winner && !winner.deletedAt && winner.requestFingerprint === fingerprint ? { id } : { error: "Este pedido já foi utilizado. Inicie uma nova criação.", retryable: false };
    }
    ownsSubmission = true;
    // Save public references before any paid submission. Never send a data URI to the model.
    const [referenceUrl, styleReferenceUrl] = await Promise.all([
      storeInfluencerReference(input.referenceUrl, userId, id, "identity"),
      storeInfluencerReference(input.styleReferenceUrl, userId, id, "style"),
    ]);
    const imageEditPayload = provider === "fal" ? buildInfluencerImageEditPayload({ ...input, referenceUrl, styleReferenceUrl }, variant?.input.kind) : undefined;
    await updateInfluencer(id, { referenceUrl, styleReferenceUrl, referenceUploadIncomplete: false, ...(imageEditPayload ? { brief: imageEditPayload.prompt } : {}) }, userId);
    if (!await reserveInfluencerCredits(userId, id, creditCost)) {
      await failGeneration(influencer, `Créditos insuficientes (precisa de ${creditCost}).`);
      return { error: `Créditos insuficientes (precisa de ${creditCost}).`, retryable: true };
    }
    if (!await claimInfluencerSubmission(userId, id)) {
      await refundInfluencerCredits(userId, id);
      return { error: "A preparação foi interrompida. Inicie uma nova tentativa.", retryable: true };
    }
    sent = true;
    const queued = imageEditPayload ? await submitInfluencerImageEdit(imageEditPayload) : await submitInfluencerGeneration(buildInfluencerPayload({ ...input, referenceUrl, styleReferenceUrl }, influencer.seed), id);
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

async function createVariantForUser(userId: string, value: CreateInfluencerVariantInput, storedReferences = false): Promise<CreateResult> {
  try {
    const input = validateInfluencerVariantInput(value, userId, storedReferences);
    // A retry of a persisted failed version may still use its archived source;
    // ordinary client edits can only select active versions.
    const source = await getInfluencer(userId, input.influencerId, storedReferences);
    if (!source || source.status !== "completed" || !publicImageUrl(source.imageUrl)) return { error: "Selecione uma versão pronta do seu influencer para editar.", retryable: false };
    const root = source.rootInfluencerId ? await getInfluencer(userId, source.rootInfluencerId, true) : source;
    if (!root || root.rootInfluencerId) return { error: "O influencer original não está disponível.", retryable: false };
    return createForUser(userId, {
      requestKey: input.requestKey, name: root.name, tier: source.tier as CreateInfluencerInput["tier"],
      selection: source.selection, referenceUrl: source.imageUrl, styleReferenceUrl: input.styleReferenceUrl, prompt: input.prompt,
    }, storedReferences, { input, root, source });
  } catch (error) {
    return { error: error instanceof InfluencerGenerationError ? error.message : "Não foi possível preparar a edição do influencer.", retryable: false };
  }
}

export async function createInfluencerVariantAction(input: CreateInfluencerVariantInput): Promise<CreateResult> {
  const user = await requireUser();
  return createVariantForUser(user.id, input);
}

/** Polls existing requests only. Failed submissions are never silently resubmitted. */
export async function pollInfluencersAction(): Promise<Influencer[]> {
  const user = await requireUser();
  const records = await listInfluencers(user.id);
  if (await finalizeInfluencers(records)) revalidatePath("/app", "layout");
  return listInfluencers(user.id);
}

export async function deleteInfluencerAction(id: string): Promise<void> {
  const user = await requireUser();
  const influencer = await getInfluencer(user.id, id);
  if (influencer && !influencer.rootInfluencerId && (await listInfluencers(user.id)).some(item => item.rootInfluencerId === id)) throw new Error("Exclua as versões salvas antes de excluir o influencer original.");
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
  if (influencer.creationMode === "edit") {
    if (!influencer.sourceInfluencerId || !influencer.editKind || !influencer.prompt) return { error: "Os dados desta edição estão incompletos. Crie uma nova versão.", retryable: false };
    return createVariantForUser(user.id, { influencerId: influencer.sourceInfluencerId, requestKey, kind: influencer.editKind, prompt: influencer.prompt, name: influencer.variantLabel, ...(influencer.styleReferenceUrl ? { styleReferenceUrl: influencer.styleReferenceUrl } : {}) }, true);
  }
  return createForUser(user.id, {
    requestKey, name: influencer.name, tier: influencer.tier as CreateInfluencerInput["tier"], selection: influencer.selection,
    ...(influencer.creationMode === "prompt" ? { mode: "prompt" } : {}),
    ...(influencer.prompt ? { prompt: influencer.prompt } : {}),
    ...(influencer.referenceUrl ? { referenceUrl: influencer.referenceUrl } : {}),
    ...(influencer.styleReferenceUrl ? { styleReferenceUrl: influencer.styleReferenceUrl } : {}),
  }, true);
}
