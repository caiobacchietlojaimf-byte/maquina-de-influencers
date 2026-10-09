import { requirePageUser } from "@/lib/auth";
import { listInfluencers } from "@/lib/db";
import { listAiVirals } from "@/lib/miner";
import { MinedVirals } from "@/components/mined-virals";
import { groupInfluencerVersions, influencerVersionLabel } from "@/lib/influencer-versions";

export const metadata = { title: "Vídeos Virais" };
export const dynamic = "force-dynamic";

export default async function ViraisPage() {
  const user = await requirePageUser();

  // Buscas em paralelo; a mineração NÃO bloqueia o render — o cliente dispara
  // em background assim que a página monta (getMinedViralsAction).
  const [influencers, virals] = await Promise.all([
    listInfluencers(user.id),
    listAiVirals(),
  ]);
  const ready = groupInfluencerVersions(influencers).flatMap(family => family.versions.filter(i => i.status === "completed" && i.imageUrl).map(i => ({ ...i, name: family.versions.length > 1 ? `${family.root.name} · ${influencerVersionLabel(i)}` : family.root.name })));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            Vídeos <span style={{ color: "var(--accent-text)" }}>Virais</span>
          </h1>
          <p className="sub">
            Explore os personagens de IA do Instagram e TikTok. Assista aos vídeos disponíveis, encontre referências e crie uma nova cena com seu influencer.
          </p>
        </div>
      </div>
      <MinedVirals
        initialVirals={virals}
        influencers={ready.map((i) => ({ id: i.id, name: i.name, imageUrl: i.imageUrl! }))}
      />
    </div>
  );
}
