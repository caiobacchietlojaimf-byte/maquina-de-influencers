import type { Video } from "./db";

/** Paid provider requests stay visible while they may still produce (and bill)
 * a result. A provider-confirmed failure is final: nothing else can arrive. */
export function canDeleteVideo(video: Pick<Video, "status" | "resultUrl" | "edit" | "requestFingerprint" | "polling">): boolean {
  if (!video.edit && !video.requestFingerprint) return true;
  if (video.status === "queued" || video.status === "processing") return false;
  if (video.status === "review" && !video.resultUrl) return video.polling?.providerStatus === "failed";
  return true;
}
