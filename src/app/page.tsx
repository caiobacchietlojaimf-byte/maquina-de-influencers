import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Clapperboard,
  Flame,
  Sparkles,
  TrendingUp,
  Users,
  Wand2,
} from "lucide-react";

import { HERO_VIDEOS } from "@/data/hero";
import { currentUser } from "@/lib/auth";
import { LogoMark } from "@/components/logo";

export default async function LandingPage() {
  const user = await currentUser();
  if (user) redirect("/app");

  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link href="/" className="brand">
          <LogoMark />
          MÁQUINA DE INFLUENCERS
        </Link>
        <div className="links">
          <a href="#recursos">Recursos</a>
          <a href="#como-funciona">Como funciona</a>
        </div>
        <div className="spacer" />
        <Link href="/login" className="btn btn-ghost" style={{ height: 38 }}>
          Entrar
        </Link>
        <Link href="/login?modo=cadastro" className="btn btn-accent" style={{ height: 38 }}>
          Criar conta
        </Link>
      </nav>

      <header className="hero">
        <h1>
          SEU INFLUENCER,
          <br />
          <span className="accent">SEU HIT VIRAL</span>
        </h1>
        <p className="lede">
          Monte seu influencer de IA com o rosto, corpo e estilo que você quiser. Escolha um
          movimento viral e veja ele performar em um vídeo pronto para postar.
        </p>
        <div className="cta-row">
          <Link href="/login?modo=cadastro" className="btn btn-accent btn-lg">
            <Sparkles size={19} />
            Começar grátis
          </Link>
          <a href="#como-funciona" className="btn btn-outline btn-lg">
            Ver como funciona
          </a>
        </div>
      </header>

      <div className="hero-strip" aria-hidden>
        {HERO_VIDEOS.map((video) => (
          <video key={video.src} src={video.src} poster={video.poster} autoPlay muted loop playsInline />
        ))}
      </div>

      <div className="marquee" aria-hidden>
        <div className="marquee-track">
          {[0, 1].map((i) => (
            <span key={i} style={{ display: "flex", gap: 40 }}>
              <span className="lime">AI INFLUENCER</span>
              <span>VÍDEOS VIRAIS</span>
              <span className="lime">MOTION TRANSFER</span>
              <span>TIKTOK · REELS · SHORTS</span>
              <span className="lime">9 TIPOS DE PERSONAGEM</span>
              <span>MAIS DE 150 TRAÇOS</span>
              <span className="lime">GENJUTSU</span>
              <span>DO ROSTO AO VÍDEO EM MINUTOS</span>
            </span>
          ))}
        </div>
      </div>

      <section className="land-section" id="recursos">
        <h2>
          Uma fábrica completa de <span style={{ color: "var(--accent)" }}>criadores virtuais</span>
        </h2>
        <p className="sub">
          Tudo que o estúdio da Higgsfield oferece, na sua máquina: personagem, movimento e
          tendência no mesmo fluxo.
        </p>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="icon">
              <Users size={20} />
            </div>
            <h3>Influencers sob medida</h3>
            <p>
              9 tipos de personagem, de Média a Extremo, incluindo gato, sapo e capivara. Mais de
              150 traços combináveis: cabelo, rosto, corpo, estilo e acessórios.
            </p>
          </div>
          <div className="feature-card">
            <div className="icon">
              <TrendingUp size={20} />
            </div>
            <h3>Vídeos virais prontos</h3>
            <p>
              Tendências que explodiram no TikTok e Instagram, cada uma com prompt pronto para
              duplicar com o seu influencer como protagonista.
            </p>
          </div>
          <div className="feature-card">
            <div className="icon">
              <Wand2 size={20} />
            </div>
            <h3>Motion transfer Genjutsu</h3>
            <p>
              Dezenas de movimentos extraídos de vídeos reais. Escolha o preset, aplique no seu
              personagem e o vídeo mantém câmera, ritmo e energia originais.
            </p>
          </div>
          <div className="feature-card">
            <div className="icon">
              <Clapperboard size={20} />
            </div>
            <h3>Galeria viva</h3>
            <p>
              Todos os seus personagens e vídeos em um só lugar, com status em tempo real,
              retry de falhas e download em um clique.
            </p>
          </div>
        </div>
      </section>

      <section className="land-section" id="como-funciona" style={{ paddingTop: 0 }}>
        <h2>Do zero ao viral em 4 passos</h2>
        <div className="feature-grid">
          {[
            {
              n: "01",
              title: "Minere o viral",
              text: "A máquina puxa as tendências do TikTok em tempo real, por região, com views e música. Ou importe qualquer vídeo por link.",
            },
            {
              n: "02",
              title: "Crie o personagem",
              text: "Escolha o tipo, ajuste os traços ou jogue o dado para sortear um visual. A ficha do personagem sai em segundos.",
            },
            {
              n: "03",
              title: "Gere o vídeo",
              text: "O influencer performa o movimento exato do viral: mesma câmera, mesmo ritmo, novo protagonista.",
            },
            {
              n: "04",
              title: "Publique",
              text: "Conecte TikTok e Instagram, escreva a legenda e publique na hora ou agende. A fila roda sozinha.",
            },
          ].map((step) => (
            <div key={step.n} className="feature-card">
              <div
                className="display"
                style={{ color: "var(--accent)", fontSize: 30 }}
              >
                {step.n}
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 40, display: "flex", justifyContent: "center" }}>
          <Link href="/login?modo=cadastro" className="btn btn-accent btn-lg">
            <Flame size={19} />
            Criar meu influencer agora
          </Link>
        </div>
      </section>

      <footer className="land-footer">
        <LogoMark size={20} />
        <span>Máquina de Influencers — estúdio de criadores virtuais.</span>
        <span style={{ marginLeft: "auto" }}>
          Feito sobre a stack open-source do OpenHiggsfield.
        </span>
      </footer>
    </div>
  );
}
