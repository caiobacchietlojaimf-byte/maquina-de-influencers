import { redirect } from "next/navigation";

import { requirePageUser } from "@/lib/auth";
import { listInfluencers } from "@/lib/db";
import { InfluencerStudio } from "@/components/influencer-studio";

export const metadata = { title: "Influencers" };
export const dynamic = "force-dynamic";

export default async function InfluencersPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; tab?: string; influencer?: string; preset?: string }>;
}) {
  const user = await requirePageUser();
  const { aba, tab, influencer, preset } = await searchParams;
  if (aba === "movimento" || tab === "motion") {
    const params = new URLSearchParams();
    if (influencer) params.set("influencer", influencer);
    if (preset) params.set("preset", preset);
    const query = params.toString();
    redirect(`/app/criar-videos${query ? `?${query}` : ""}`);
  }

  return (
    <InfluencerStudio
      initialInfluencers={await listInfluencers(user.id)}
      credits={user.credits}
    />
  );
}
