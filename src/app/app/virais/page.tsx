import { requirePageUser } from "@/lib/auth";
import { listFollows, listInfluencers, listVirals } from "@/lib/db";
import { MinedVirals } from "@/components/mined-virals";

export const metadata = { title: "Vídeos Virais" };
export const dynamic = "force-dynamic";

export default async function ViraisPage() {
  const user = await requirePageUser();

  // Buscas em paralelo; a mineração NÃO bloqueia o render — o cliente dispara
  // em background assim que a página monta (getMinedViralsAction).
  const [influencers, virals, follows] = await Promise.all([
    listInfluencers(user.id),
    listVirals("BR"),
    listFollows(user.id),
  ]);
  const ready = influencers.filter((i) => i.status === "completed" && i.imageUrl);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            Vídeos <span style={{ color: "var(--accent)" }}>Virais</span>
          </h1>
          <p className="sub">
            Tendências duplicáveis mineradas do TikTok, efeitos virais prontos e os perfis de IA
            que estão dominando o jogo. Escolha o vídeo, escolha seu influencer e duplique.
          </p>
        </div>
      </div>
      <MinedVirals
        initialVirals={virals}
        influencers={ready.map((i) => ({ id: i.id, name: i.name, imageUrl: i.imageUrl! }))}
        initialFollows={follows.map((f) => f.handle)}
      />
    </div>
  );
}
