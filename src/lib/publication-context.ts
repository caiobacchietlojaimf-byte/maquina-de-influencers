import "server-only";

import { AI_PROFILES, type AiProfile, type ProfilePost } from "@/data/ai-profiles";
import { MOTION_PRESETS, type MotionPreset } from "@/data/motion-presets";
import { VIRAL_EFFECTS, type ViralEffect } from "@/data/viral-effects";
import { getViral, type Influencer, type Video, type Viral } from "./db";
import type { EditSource } from "./character-edit";

/** Editorial data, never an upload token, generation prompt or credential. */
export type PublicationReferenceSnapshot = {
  sourceTitle?: string;
  sourceCaption?: string;
  sourcePageUrl?: string;
  sceneDescription?: string;
  keywords: string[];
  referenceKind?: "profile" | "viral" | "preset" | "effect" | "upload";
  /** Catalog descriptions are inspiration; only video analysis establishes facts. */
  descriptionIsProposal?: boolean;
  sourceMetrics?: { views?: number; likes?: number; comments?: number; shares?: number; observedAt?: string };
};
export type PublicationContext = PublicationReferenceSnapshot & {
  characterName?: string;
  matchedBy: "snapshot" | "id" | "url" | "unique-name" | "none";
};
type EditorialVideo = Video & { edit?: Video["edit"] & {
  sourceReference?: EditSource | { kind: "upload" };
  sourceSnapshot?: PublicationReferenceSnapshot;
} };

function plain(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return;
  const text = value.normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, "").trim();
  return text ? text.slice(0, max) : undefined;
}
function pageUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return; }
}
function metrics(value: PublicationReferenceSnapshot["sourceMetrics"]): PublicationReferenceSnapshot["sourceMetrics"] {
  if (!value || typeof value !== "object") return;
  const result: NonNullable<PublicationReferenceSnapshot["sourceMetrics"]> = {};
  for (const key of ["views", "likes", "comments", "shares"] as const) {
    if (typeof value[key] === "number" && Number.isFinite(value[key]) && value[key]! >= 0) result[key] = Math.floor(value[key]!);
  }
  if (typeof value.observedAt === "string" && /^\d{4}-\d{2}-\d{2}(?:T[^\s]{1,30})?$/u.test(value.observedAt) && Number.isFinite(Date.parse(value.observedAt))) result.observedAt = value.observedAt;
  return Object.keys(result).length ? result : undefined;
}
/** Also bounds older JSON records before treating them as untrusted prompt data. */
export function sanitizePublicationReference(value: PublicationReferenceSnapshot): PublicationReferenceSnapshot {
  return {
    sourceTitle: plain(value.sourceTitle, 240), sourceCaption: plain(value.sourceCaption, 2200),
    sourcePageUrl: pageUrl(value.sourcePageUrl), sceneDescription: plain(value.sceneDescription, 600),
    keywords: Array.isArray(value.keywords) ? [...new Set(value.keywords.flatMap(v => plain(v, 60) ?? []).slice(0, 8))] : [],
    referenceKind: ["profile", "viral", "preset", "effect", "upload"].includes(value.referenceKind ?? "") ? value.referenceKind : undefined,
    ...(value.descriptionIsProposal ? { descriptionIsProposal: true } : {}),
    sourceMetrics: metrics(value.sourceMetrics),
  };
}
function profileReference(profile: AiProfile, post: ProfilePost): PublicationReferenceSnapshot {
  return sanitizePublicationReference({
    referenceKind: "profile", sourceTitle: `@${profile.handle} · ${post.scene}`, keywords: [],
    sourcePageUrl: profile.platform === "instagram" ? `https://www.instagram.com/reel/${encodeURIComponent(post.code)}/` : profile.url,
    // post.prompt is an authored generation instruction, NOT an original caption.
    sceneDescription: post.scene, sourceMetrics: post.metrics,
  });
}
function presetReference(preset: MotionPreset): PublicationReferenceSnapshot {
  return { referenceKind: "preset", sourceTitle: preset.name, keywords: [] };
}
function effectReference(effect: ViralEffect): PublicationReferenceSnapshot {
  // effect.views are explicitly illustrative; never transfer them to analytics/copy.
  return sanitizePublicationReference({ referenceKind: "effect", sourceTitle: effect.name, sceneDescription: effect.description, descriptionIsProposal: true, keywords: effect.tags });
}
function viralReference(viral: Viral): PublicationReferenceSnapshot {
  return sanitizePublicationReference({
    referenceKind: "viral", sourceTitle: viral.title, sourcePageUrl: viral.pageUrl, keywords: [],
    // New provider responses retain their source text explicitly. Old seeded
    // scene titles must never be silently reclassified as original captions.
    sourceCaption: viral.sourceCaptionOrigin === "provider-title" ? viral.sourceCaption : undefined,
    sourceMetrics: { views: viral.views, likes: viral.likes, comments: viral.comments, shares: viral.shares, ...(Number.isFinite(viral.minedAt) && viral.minedAt > 0 && viral.minedAt <= 8.64e15 ? { observedAt: new Date(viral.minedAt).toISOString() } : {}) },
  });
}

/** Called during preparation to retain metadata even if a catalog later changes. */
export async function capturePublicationReference(source: EditSource | { kind: "upload" }): Promise<PublicationReferenceSnapshot> {
  if (source.kind === "upload") return { referenceKind: "upload", keywords: [] };
  if (source.kind === "profile") {
    const profile = AI_PROFILES.find(p => p.handle === source.handle), post = profile?.posts.find(p => p.code === source.id);
    return profile && post ? profileReference(profile, post) : { referenceKind: "profile", keywords: [] };
  }
  if (source.kind === "preset") {
    const preset = MOTION_PRESETS.find(p => p.id === source.id);
    return preset ? presetReference(preset) : { referenceKind: "preset", keywords: [] };
  }
  const viral = await getViral(source.id);
  return viral ? viralReference(viral) : { referenceKind: "viral", keywords: [] };
}

type Candidate = { id: string; name: string; media?: string; snapshot: PublicationReferenceSnapshot };
function catalog(): Candidate[] {
  return [
    ...MOTION_PRESETS.map(p => ({ id: p.id, name: p.name, media: p.drivingVideo, snapshot: presetReference(p) })),
    ...VIRAL_EFFECTS.map(p => ({ id: p.id, name: p.name, media: p.preview, snapshot: effectReference(p) })),
    ...AI_PROFILES.flatMap(p => p.posts.map(post => ({ id: `${p.handle}:${post.code}`, name: `@${p.handle} · ${post.scene}`, media: post.video, snapshot: profileReference(p, post) }))),
  ];
}

/** Exact catalog matching only. The actual owned result remains the visual evidence. */
export async function resolvePublicationContext(userId: string, video: EditorialVideo, influencer?: Influencer): Promise<PublicationContext> {
  if (video.userId !== userId || video.deletedAt) throw new Error("Vídeo indisponível.");
  if (influencer && (influencer.userId !== userId || influencer.id !== video.influencerId)) throw new Error("Influencer indisponível.");
  const characterName = plain(influencer?.name, 80);
  const base = { sourceTitle: plain(video.presetName, 240), characterName, keywords: [] as string[] };
  const wrap = (snapshot: PublicationReferenceSnapshot, matchedBy: PublicationContext["matchedBy"]): PublicationContext => ({ ...base, ...sanitizePublicationReference(snapshot), sourceTitle: plain(snapshot.sourceTitle, 240) ?? base.sourceTitle, characterName, matchedBy });
  if (video.edit?.sourceSnapshot && typeof video.edit.sourceSnapshot === "object") return wrap(video.edit.sourceSnapshot, "snapshot");
  if (video.edit?.sourceReference) return wrap(await capturePublicationReference(video.edit.sourceReference), "id");
  const candidates = catalog();
  if (video.presetId) {
    const matches = candidates.filter(c => c.id === video.presetId);
    if (matches.length === 1) return wrap(matches[0].snapshot, "id");
    if (matches.length > 1) return { ...base, matchedBy: "none" };
    const viral = await getViral(video.presetId);
    if (viral) return wrap(viralReference(viral), "id");
  }
  if (video.edit?.sourceUrl) {
    const matches = candidates.filter(c => c.media === video.edit!.sourceUrl);
    if (matches.length === 1) return wrap(matches[0].snapshot, "url");
    if (matches.length > 1) return { ...base, matchedBy: "none" };
  }
  if (video.presetName) {
    const matches = candidates.filter(c => c.name === video.presetName);
    if (matches.length === 1) return wrap(matches[0].snapshot, "unique-name");
  }
  // Never use video.prompt/influencer.brief as a scene synopsis or infer persona
  // from appearance, ethnicity, gender, clothing, or generation instructions.
  return { ...base, matchedBy: "none" };
}
