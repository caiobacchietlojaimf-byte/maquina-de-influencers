import { requirePageUser, sessionUserId } from "@/lib/auth";
import { listInfluencers } from "@/lib/db";
import { listAiVirals } from "@/lib/miner";
import { getCollectorStatus } from "@/lib/viral-collector";
import { MinedVirals } from "@/components/mined-virals";
import { groupInfluencerVersions, influencerVersionLabel } from "@/lib/influencer-versions";
import { isAdmin } from "@/lib/admin";

export const metadata = { title: "Explorar virais" };
export const dynamic = "force-dynamic";

export default async function ViraisPage() {
  // Tudo sai do banco: acervo, status do agendador e última visita do usuário.
  // Nenhuma coleta externa roda aqui; a galeria aparece na hora.
  const userId = (await sessionUserId()) ?? "";
  const [user, influencers, virals, status] = await Promise.all([
    requirePageUser(),
    userId ? listInfluencers(userId) : [],
    listAiVirals(),
    getCollectorStatus().catch(() => null),
  ]);
  const ready = groupInfluencerVersions(influencers).flatMap(family => family.versions.filter(i => i.status === "completed" && i.imageUrl).map(i => ({ ...i, name: family.versions.length > 1 ? `${family.root.name} · ${influencerVersionLabel(i)}` : family.root.name })));

  return (
    <MinedVirals
      initialVirals={virals}
      initialStatus={status}
      seenAt={user.viralsSeenAt ?? null}
      now={Date.now()}
      influencers={ready.map((i) => ({ id: i.id, name: i.name, imageUrl: i.imageUrl! }))}
      canAdmin={isAdmin(user)}
    />
  );
}
