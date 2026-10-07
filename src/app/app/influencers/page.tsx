import { requirePageUser } from "@/lib/auth";
import { listInfluencers } from "@/lib/db";
import { InfluencerStudio } from "@/components/influencer-studio";

export const metadata = { title: "Influencers" };
export const dynamic = "force-dynamic";

export default async function InfluencersPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const user = await requirePageUser();
  const { aba } = await searchParams;

  return (
    <InfluencerStudio
      initialInfluencers={listInfluencers(user.id)}
      initialTab={aba === "movimento" ? "motion" : "create"}
      credits={user.credits}
    />
  );
}
