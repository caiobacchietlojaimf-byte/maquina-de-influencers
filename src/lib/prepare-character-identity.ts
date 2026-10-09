import "server-only";
import { put } from "@vercel/blob";
import { getInfluencer, type Influencer } from "./db";
import { publicMediaUrl, readPublicVideo } from "./video-media";
import { headCloseUp, prepareCharacterIdentityMedia } from "./character-identity-media";
import type { EditEngine, EditIdentityReferences } from "./character-edit";

export const EDIT_IDENTITY_VERSION = "identity-v2";

/** Provenance identifies a sheet layout, never a different version's face/outfit. */
async function hasSheetLayout(influencer: Influencer, signal?: AbortSignal): Promise<boolean> {
  let current: Influencer | undefined = influencer;
  const visited = new Set<string>();
  for (let depth = 0; current && depth < 20; depth++) {
    signal?.throwIfAborted();
    if (visited.has(current.id)) return false;
    visited.add(current.id);
    if (/Two-panel sheet: left a (?:tight )?frontal close-up portrait/i.test(current.brief ?? "") && /right a full-body/i.test(current.brief ?? "")) return true;
    if (current.creationMode !== "edit" || !current.sourceInfluencerId) return false;
    // Ownership is checked at every step. Only the selected image is processed.
    current = await getInfluencer(influencer.userId, current.sourceInfluencerId, true);
  }
  return false;
}

export async function readCharacterIdentity(influencer: Influencer, video: { width: number; height: number }, signal?: AbortSignal) {
  if (!influencer.imageUrl || influencer.status !== "completed") throw new Error("Selecione uma versão pronta do influencer.");
  const image = await readPublicVideo(publicMediaUrl(influencer.imageUrl), 25 * 1024 * 1024, signal);
  const sheetLayout = await hasSheetLayout(influencer, signal);
  const identity = await prepareCharacterIdentityMedia(image, { knownTwoPanelSheet: sheetLayout, videoWidth: video.width, videoHeight: video.height, signal });
  if (identity.frontal) return { image, identity: { ...identity, frontalSource: "sheet" as const } };
  // Kling needs a dedicated face view. The selected image itself is preferred:
  // a gallery sheet may predate an edit that changed hair or facial hair.
  const head = await headCloseUp(image, signal);
  if (head) return { image, identity: { ...identity, strategy: "sheet-panels" as const, frontal: head, frontalSource: "head-crop" as const } };
  if (sheetLayout) {
    for (const url of (influencer.gallery ?? []).slice(0, 3)) {
      try {
        const sheet = await prepareCharacterIdentityMedia(await readPublicVideo(publicMediaUrl(url), 25 * 1024 * 1024, signal), { knownTwoPanelSheet: true, videoWidth: video.width, videoHeight: video.height, signal });
        if (sheet.frontal) return { image, identity: { ...identity, strategy: "sheet-panels" as const, frontal: sheet.frontal, frontalSource: "gallery-sheet" as const } };
      } catch { signal?.throwIfAborted(); }
    }
  }
  return { image, identity };
}

/** Freeze references with the same lifecycle and ownership as the source video. */
export async function prepareCharacterIdentity(influencer: Influencer, video: { width: number; height: number }, engine: EditEngine, preparationId: string, signal?: AbortSignal): Promise<EditIdentityReferences> {
  const { identity } = await readCharacterIdentity(influencer, video, signal);
  const store = async (name: string, bytes: Buffer) => {
    signal?.throwIfAborted();
    return (await put(`edit-identities/${influencer.userId}/${preparationId}/${name}.png`, bytes, {
      access: "public", contentType: "image/png", addRandomSuffix: false, allowOverwrite: false, abortSignal: signal,
    })).url;
  };
  if (engine === "fal-wan") {
    const wanUrl = await store("character", identity.wan);
    return { strategy: "single-image", appearanceUrl: wanUrl, wanUrl };
  }
  const appearanceUrl = await store("appearance", identity.appearance);
  const frontalUrl = identity.frontal ? await store("frontal", identity.frontal) : undefined;
  return { strategy: identity.strategy, appearanceUrl, ...(frontalUrl ? { frontalUrl, frontalSource: "frontalSource" in identity ? identity.frontalSource : "sheet" } : {}) };
}
