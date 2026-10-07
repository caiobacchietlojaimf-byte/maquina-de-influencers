import Link from "next/link";
import { Clapperboard, Flame, Users, Wand2 } from "lucide-react";

import { currentUser } from "@/lib/auth";
import { listInfluencers, listVideos } from "@/lib/db";
import { isConfigured } from "@/lib/platform";

export const metadata = { title: "Início" };

export default async function HomePage() {
  const user = (await currentUser())!;
  const influencers = listInfluencers(user.id);
  const videos = listVideos(user.id);
  const configured = isConfigured();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            Fala, <span style={{ color: "var(--accent)" }}>{user.name.split(" ")[0]}</span>
          </h1>
          <p className="sub">Sua fábrica de criadores virtuais. Escolha por onde começar.</p>
        </div>
      </div>

      {!configured ? (
        <div className="notice">
          <b>Modo demonstração:</b> nenhuma chave da Higgsfield configurada. As gerações usam
          resultados de exemplo. Defina <b>HF_API_KEY</b> (formato id:secret) e{" "}
          <b>HF_API_BASE_URL</b> no .env.local para gerar de verdade.
        </div>
      ) : null}

      <div className="stat-row">
        <div className="stat" data-accent="true">
          <div className="n">{user.credits.toLocaleString("pt-BR")}</div>
          <div className="l">créditos disponíveis</div>
        </div>
        <div className="stat">
          <div className="n">{influencers.length}</div>
          <div className="l">influencers criados</div>
        </div>
        <div className="stat">
          <div className="n">{videos.length}</div>
          <div className="l">vídeos gerados</div>
        </div>
        <div className="stat">
          <div className="n">{videos.filter((v) => v.status === "processing").length}</div>
          <div className="l">gerações em andamento</div>
        </div>
      </div>

      <div className="home-grid">
        <Link href="/app/influencers" className="home-card">
          <div className="icon">
            <Users size={19} />
          </div>
          <h3>Criar influencer</h3>
          <p>
            Monte o personagem do zero: 9 tipos, mais de 150 traços, ou jogue o dado e deixe a
            máquina decidir.
          </p>
          <span className="go">Abrir estúdio →</span>
        </Link>
        <Link href="/app/virais" className="home-card">
          <div className="icon">
            <Flame size={19} />
          </div>
          <h3>Duplicar um viral</h3>
          <p>
            Tendências com milhões de views no TikTok e Instagram, com prompt pronto para rodar
            com o seu influencer.
          </p>
          <span className="go">Ver tendências →</span>
        </Link>
        <Link href="/app/influencers?aba=movimento" className="home-card">
          <div className="icon">
            <Wand2 size={19} />
          </div>
          <h3>Aplicar movimento</h3>
          <p>
            Presets Genjutsu de motion transfer: o personagem performa o movimento exato do vídeo
            de referência.
          </p>
          <span className="go">Escolher movimento →</span>
        </Link>
        <Link href="/app/videos" className="home-card">
          <div className="icon">
            <Clapperboard size={19} />
          </div>
          <h3>Meus vídeos</h3>
          <p>Acompanhe as gerações em andamento, baixe os prontos e refaça o que falhou.</p>
          <span className="go">Abrir galeria →</span>
        </Link>
      </div>
    </div>
  );
}
