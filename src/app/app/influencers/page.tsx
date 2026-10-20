import { redirect } from "next/navigation";

import { requirePageUser, sessionUserId } from "@/lib/auth";
import { listInfluencers } from "@/lib/db";
import { InfluencerStudio } from "@/components/influencer-studio";

export const metadata = { title: "Influencers" };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function InfluencersPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; tab?: string; influencer?: string; preset?: string }>;
}) {
  // Lista e validação do usuário em paralelo (id vem do cookie assinado).
  const userId = (await sessionUserId()) ?? "";
  const [user, influencers, { aba, tab, influencer, preset }] = await Promise.all([
    requirePageUser(),
    userId ? listInfluencers(userId) : [],
    searchParams,
  ]);
  if (aba === "movimento" || tab === "motion") {
    const params = new URLSearchParams();
    if (influencer) params.set("influencer", influencer);
    if (preset) params.set("preset", preset);
    const query = params.toString();
    redirect(`/app/criar-videos${query ? `?${query}` : ""}`);
  }

  return (
    <InfluencerStudio
      initialInfluencers={influencers}
      credits={user.credits}
      userId={user.id}
    />
  );
}
