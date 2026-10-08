import { VideoStudio } from "@/components/video-studio";
import { requirePageUser } from "@/lib/auth";
import { getViral, listInfluencers } from "@/lib/db";
import { getProfile } from "@/data/ai-profiles";
import { isAiCharacterVideo } from "@/lib/ai-discovery";
import type { StudioReference } from "@/lib/video-reference";

export const metadata = { title: "Criar Vídeos" };
export const dynamic = "force-dynamic";
export const maxDuration = 240;

export default async function CreateVideosPage({
  searchParams,
}: {
  searchParams: Promise<{ influencer?: string; preset?: string; profile?: string; video?: string; viral?: string }>;
}) {
  const user = await requirePageUser();
  const [influencers, params] = await Promise.all([listInfluencers(user.id), searchParams]);
  let reference: StudioReference | undefined;
  if (params.profile && params.video) {
    const profile = getProfile(params.profile);
    const post = profile?.posts.find(post => post.code === params.video);
    if (profile && post?.video) reference = { kind: "profile", id: post.code, handle: profile.handle, name: `@${profile.handle} · ${post.scene}`, videoUrl: post.video, thumbnail: post.thumbnail ?? `/reel-thumbs/${post.code}.jpg`, duration: post.metrics?.duration ?? 0 };
  } else if (params.viral) {
    const viral = await getViral(params.viral);
    if (viral && isAiCharacterVideo(viral) && viral.playUrl) reference = { kind: "viral", id: viral.id, name: `@${viral.authorHandle} · ${viral.title}`, videoUrl: viral.playUrl, thumbnail: viral.coverUrl, duration: viral.duration };
  }

  return (
    <VideoStudio
      key={`${params.influencer ?? ""}:${params.preset ?? ""}:${params.profile ?? ""}:${params.video ?? ""}:${params.viral ?? ""}`}
      initialInfluencers={influencers}
      initialInfluencerId={params.influencer}
      initialPresetId={params.preset}
      initialReference={reference}
      initialError={(params.video || params.viral) && !reference ? "Referência não encontrada. Escolha outro vídeo ou envie um arquivo." : undefined}
      uploadUserId={user.id}
      credits={user.credits}
    />
  );
}
