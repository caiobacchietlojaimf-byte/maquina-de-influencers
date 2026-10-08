import { VideoStudio } from "@/components/video-studio";
import { requirePageUser } from "@/lib/auth";
import { listInfluencers } from "@/lib/db";

export const metadata = { title: "Criar Vídeos" };
export const dynamic = "force-dynamic";

export default async function CreateVideosPage({
  searchParams,
}: {
  searchParams: Promise<{ influencer?: string; preset?: string }>;
}) {
  const user = await requirePageUser();
  const [influencers, params] = await Promise.all([listInfluencers(user.id), searchParams]);

  return (
    <VideoStudio
      key={`${params.influencer ?? ""}:${params.preset ?? ""}`}
      initialInfluencers={influencers}
      initialInfluencerId={params.influencer}
      initialPresetId={params.preset}
      credits={user.credits}
    />
  );
}
