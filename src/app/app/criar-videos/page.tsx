import { VideoStudio } from "@/components/video-studio";
import { requirePageUser, sessionUserId } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/plans";
import { getViral, listInfluencers } from "@/lib/db";
import { getProfile } from "@/data/ai-profiles";
import { isAiCharacterVideo } from "@/lib/ai-discovery";
import type { StudioReference } from "@/lib/video-reference";
import { getReadyTemplate, viralDuration, viralVideo } from "@/data/virais-proprios";

export const metadata = { title: "Criar Vídeos" };
export const dynamic = "force-dynamic";
export const maxDuration = 240;

export default async function CreateVideosPage({
  searchParams,
}: {
  searchParams: Promise<{ influencer?: string; preset?: string; profile?: string; video?: string; viral?: string; template?: string }>;
}) {
  const userId = (await sessionUserId()) ?? "";
  const [user, influencers, params] = await Promise.all([requirePageUser(), userId ? listInfluencers(userId) : [], searchParams]);
  let reference: StudioReference | undefined;
  const template = getReadyTemplate(params.template);
  if (template) {
    reference = { kind: "template", id: template.slug, name: template.title, videoUrl: viralVideo(template.slug), thumbnail: template.poster, duration: viralDuration(template.slug) };
  } else if (params.profile && params.video) {
    const profile = getProfile(params.profile);
    const post = profile?.posts.find(post => post.code === params.video);
    if (profile && post?.video) reference = { kind: "profile", id: post.code, handle: profile.handle, name: `@${profile.handle} · ${post.scene}`, videoUrl: post.video, thumbnail: post.thumbnail ?? `/reel-thumbs/${post.code}.jpg`, duration: post.metrics?.duration ?? 0 };
  } else if (params.viral) {
    const viral = await getViral(params.viral);
    if (viral && isAiCharacterVideo(viral) && viral.playUrl) reference = { kind: "viral", id: viral.id, name: `@${viral.authorHandle} · ${viral.title}`, videoUrl: viral.playUrl, thumbnail: viral.coverUrl, duration: viral.duration };
  }

  return (
    <VideoStudio
      key={`${params.influencer ?? ""}:${params.preset ?? ""}:${params.profile ?? ""}:${params.video ?? ""}:${params.viral ?? ""}:${params.template ?? ""}`}
      initialInfluencers={influencers}
      initialInfluencerId={params.influencer}
      initialPresetId={params.preset}
      initialReference={reference}
      initialError={(params.video || params.viral || params.template) && !reference ? "Referência não encontrada. Escolha outro vídeo ou envie um arquivo." : undefined}
      uploadUserId={user.id}
      credits={user.credits}
      hasPlan={!!getUserEntitlements(user).planId}
    />
  );
}
