import { currentUser } from "@/lib/auth";
import { listInfluencers, listVirals } from "@/lib/db";
import { mineTrending } from "@/lib/miner";
import { MinedVirals } from "@/components/mined-virals";

export const metadata = { title: "Vídeos Virais" };
export const dynamic = "force-dynamic";

export default async function ViraisPage() {
  const user = (await currentUser())!;
  const ready = listInfluencers(user.id).filter((i) => i.status === "completed" && i.imageUrl);

  // Minera o feed BR na primeira visita (cache de 30min no banco).
  await mineTrending("BR").catch(() => undefined);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            Vídeos <span style={{ color: "var(--accent)" }}>Virais</span>
          </h1>
          <p className="sub">
            Tendências mineradas em tempo real do TikTok, mais a galeria de efeitos virais.
            Escolha um vídeo, escolha seu influencer e duplique: ele vira o protagonista com o
            mesmo movimento, câmera e ritmo.
          </p>
        </div>
      </div>
      <MinedVirals
        initialVirals={listVirals("BR")}
        influencers={ready.map((i) => ({ id: i.id, name: i.name, imageUrl: i.imageUrl! }))}
      />
    </div>
  );
}
