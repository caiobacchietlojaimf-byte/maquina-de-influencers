import Link from "next/link";
import { Clapperboard, Flame, Send, Users } from "lucide-react";

import { requirePageUser } from "@/lib/auth";
import { listInfluencers, listPosts, listVideos } from "@/lib/db";
import { isConfigured } from "@/lib/platform";

export const metadata = { title: "Início" };
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requirePageUser();
  const [influencers, videos, posts] = await Promise.all([
    listInfluencers(user.id),
    listVideos(user.id),
    listPosts(user.id),
  ]);
  const configured = isConfigured();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            Fala, <span style={{ color: "var(--accent)" }}>{user.name.split(" ")[0]}</span>
          </h1>
          <p className="sub">
            A esteira completa da máquina: minerar o viral, criar o influencer, gerar o vídeo e
            publicar. Tudo aqui dentro.
          </p>
        </div>
      </div>

      {!configured ? (
        <div className="notice">
          <b>Modo demonstração:</b> nenhuma chave da Higgsfield configurada. As gerações usam
          resultados de exemplo. Defina <b>HF_API_KEY</b> (formato id:secret) e{" "}
          <b>HF_API_BASE_URL</b> no .env.local para gerar de verdade.
        </div>
      ) : null}

      <div className="pipeline">
        <div className="step">
          <span className="n">PASSO 01</span>
          <b>Minerar o viral</b>
          <span>Tendências reais do TikTok, por região</span>
        </div>
        <div className="step">
          <span className="n">PASSO 02</span>
          <b>Criar o influencer</b>
          <span>9 tipos, 150+ traços, dado de sorteio</span>
        </div>
        <div className="step">
          <span className="n">PASSO 03</span>
          <b>Gerar o vídeo</b>
          <span>Motion transfer com o viral de referência</span>
        </div>
        <div className="step">
          <span className="n">PASSO 04</span>
          <b>Publicar</b>
          <span>Agora ou agendado, TikTok e Instagram</span>
        </div>
      </div>

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
          <div className="n">{posts.filter((p) => p.status === "posted").length}</div>
          <div className="l">publicações feitas</div>
        </div>
      </div>

      <div className="home-grid">
        <Link href="/app/virais" className="home-card">
          <div className="icon">
            <Flame size={19} />
          </div>
          <h3>Minerar virais</h3>
          <p>
            Feed de tendências do TikTok minerado em tempo real, com views, música e download sem
            marca d&apos;água. Importe também por link.
          </p>
          <span className="go">Ver tendências →</span>
        </Link>
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
        <Link href="/app/videos" className="home-card">
          <div className="icon">
            <Clapperboard size={19} />
          </div>
          <h3>Meus vídeos</h3>
          <p>Acompanhe as gerações em andamento, baixe os prontos e mande para publicação.</p>
          <span className="go">Abrir galeria →</span>
        </Link>
        <Link href="/app/publicar" className="home-card">
          <div className="icon">
            <Send size={19} />
          </div>
          <h3>Publicar</h3>
          <p>
            Conecte TikTok e Instagram, escreva a legenda e publique na hora ou agende. A fila
            roda sozinha.
          </p>
          <span className="go">Abrir central →</span>
        </Link>
      </div>
    </div>
  );
}
