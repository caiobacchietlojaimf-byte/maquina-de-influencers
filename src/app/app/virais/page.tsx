import { currentUser } from "@/lib/auth";
import { listInfluencers } from "@/lib/db";
import { ViralGrid } from "@/components/viral-grid";

export const metadata = { title: "Vídeos Virais" };
export const dynamic = "force-dynamic";

export default async function ViraisPage() {
  const user = (await currentUser())!;
  const ready = listInfluencers(user.id).filter((i) => i.status === "completed" && i.imageUrl);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            Vídeos <span style={{ color: "var(--accent)" }}>Virais</span>
          </h1>
          <p className="sub">
            Tendências que explodiram no TikTok e Instagram. Cada uma vem com o prompt pronto —
            escolha um influencer seu e duplique o vídeo em um clique.
          </p>
        </div>
      </div>
      <ViralGrid
        influencers={ready.map((i) => ({ id: i.id, name: i.name, imageUrl: i.imageUrl! }))}
      />
    </div>
  );
}
