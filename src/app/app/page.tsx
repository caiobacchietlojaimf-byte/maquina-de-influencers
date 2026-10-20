import Link from "next/link";
import { AlertTriangle, ArrowRight, Film, Flame, Plus, Send, Users, Wand2 } from "lucide-react";

import { requirePageUser } from "@/lib/auth";
import { listInfluencers, listPosts, listVideos, type Post, type Video } from "@/lib/db";
import { displayDate } from "@/lib/display-date";
import { groupInfluencerVersions } from "@/lib/influencer-versions";
import { isConfigured } from "@/lib/platform";
import { InfluencerImage } from "@/components/influencer-image";
import { VideoCover } from "@/components/video-preview";

export const metadata = { title: "Início" };
export const dynamic = "force-dynamic";

/* Recortes otimizados (WebP, 560×720) de capas do catálogo de referências que já vive em /reel-thumbs. */
const SHOWCASE = ["/home/hero-stroll.webp", "/home/hero-boss.webp", "/home/hero-night.webp"];
const RECENT_LIMIT = 3;
const CAST_LIMIT = 8;

type WorkState = {
  label: string;
  tone: "progress" | "ready" | "done" | "warn" | "danger";
  action: string;
  href: string;
};

/* Estados reais do modelo: geração (queued/processing/review/failed/completed) e,
   para vídeos prontos, o que já existe em publicações. Geração concluída não é publicação. */
function workState(video: Video, posts: Post[]): WorkState {
  if (video.status === "queued" || video.status === "processing") {
    return { label: video.finalizationStartedAt ? "Finalizando" : "Gerando", tone: "progress", action: "Acompanhar", href: "/app/videos" };
  }
  if (video.status === "failed") return { label: "Falhou", tone: "danger", action: "Ver detalhes", href: "/app/videos" };
  if (video.status === "review") return { label: "Precisa de revisão", tone: "warn", action: "Revisar", href: "/app/videos" };
  const related = posts.filter((post) => post.videoId === video.id);
  if (related.some((post) => post.status === "posted")) return { label: "Publicado", tone: "done", action: "Ver publicações", href: "/app/publicar" };
  if (related.some((post) => post.status === "scheduled" || post.status === "posting")) return { label: "Agendado", tone: "done", action: "Ver agendamento", href: "/app/publicar" };
  if (related.some((post) => post.status === "failed")) return { label: "Publicação falhou", tone: "danger", action: "Ver publicações", href: "/app/publicar" };
  if (video.resultUrl) return { label: "Pronto para publicar", tone: "ready", action: "Publicar", href: `/app/publicar?video=${encodeURIComponent(video.id)}` };
  return { label: "Concluído", tone: "done", action: "Ver vídeo", href: "/app/videos" };
}

function workTitle(video: Video): string {
  if (video.presetName) return video.presetName;
  if (video.edit) return "Troca de personagem";
  return video.kind === "viral" ? "Vídeo viral" : "Vídeo";
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? singular : pluralForm}`;
}

export default async function HomePage() {
  const user = await requirePageUser();
  const [influencers, videos, posts] = await Promise.all([
    listInfluencers(user.id),
    listVideos(user.id),
    listPosts(user.id),
  ]);
  const configured = isConfigured();
  const families = groupInfluencerVersions(influencers);
  const recent = [...videos].sort((a, b) => b.createdAt - a.createdAt).slice(0, RECENT_LIMIT);
  const published = posts.filter((post) => post.status === "posted").length;
  const influencerName = new Map(influencers.map((influencer) => [influencer.id, influencer.name]));
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const empty = families.length === 0 && videos.length === 0;

  return (
    <div className="home">
      <header className="home-head">
        <div>
          <h1>
            Vamos criar algo, <span>{firstName}</span>?
          </h1>
          <p>Transforme suas ideias em vídeos com seus influencers.</p>
        </div>
        <Link href="/app/criar-videos" className="btn btn-accent home-cta">
          <Plus size={18} aria-hidden="true" />
          Criar vídeo
        </Link>
      </header>

      {!configured ? (
        <div className="notice" role="status">
          <b>Criação de influencers indisponível:</b> o serviço de geração ainda precisa ser configurado.
          Nenhum crédito será cobrado por essa indisponibilidade.
        </div>
      ) : null}

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-copy">
          <span className="home-eyebrow">Seu próximo vídeo</span>
          <h2 id="home-hero-title">Da inspiração à publicação.</h2>
          <p>Escolha um influencer, adicione uma referência e comece.</p>
          <Link href="/app/virais" className="btn btn-outline home-hero-link">
            Explorar referências
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="home-hero-art" aria-hidden="true">
          {SHOWCASE.map((src, index) => (
            <span key={src} className="home-hero-frame">
              <img src={src} alt="" width={560} height={720} loading={index === 0 ? "eager" : "lazy"} decoding="async" />
            </span>
          ))}
        </div>
      </section>

      <p className="home-stats">
        <span>{plural(families.length, "influencer", "influencers")}</span>
        <span>{plural(videos.length, "vídeo criado", "vídeos criados")}</span>
        <span>{plural(published, "publicação", "publicações")}</span>
      </p>

      {empty ? (
        <ol className="home-flow" aria-label="Como funciona">
          <li>
            <Flame size={16} aria-hidden="true" />
            <Link href="/app/virais">Explore uma referência</Link>
          </li>
          <li>
            <Users size={16} aria-hidden="true" />
            <Link href="/app/influencers">Crie um influencer</Link>
          </li>
          <li>
            <Wand2 size={16} aria-hidden="true" />
            <Link href="/app/criar-videos">Gere um vídeo</Link>
          </li>
          <li>
            <Send size={16} aria-hidden="true" />
            <Link href="/app/publicar">Publique</Link>
          </li>
        </ol>
      ) : null}

      <section className="home-section" aria-labelledby="home-recent-title">
        <div className="home-section-head">
          <h2 id="home-recent-title">{videos.length ? "Continue de onde parou" : "Seus vídeos recentes"}</h2>
          {videos.length > RECENT_LIMIT ? (
            <Link href="/app/videos" className="home-link">
              Ver todos
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {recent.length ? (
          <div className="home-works">
            {recent.map((video) => {
              const state = workState(video, posts);
              const title = workTitle(video);
              const who = video.influencerId ? influencerName.get(video.influencerId) : undefined;
              const playable = (video.status === "completed" || video.status === "review") && video.resultUrl;
              return (
                <article key={video.id} className="home-work">
                  <div className="home-work-media">
                    {playable ? (
                      <VideoCover
                        videoId={video.id}
                        thumbnailUrl={video.thumbnailSourceUrl === video.resultUrl ? video.thumbnailUrl : undefined}
                        title={title}
                        className="home-work-cover"
                      />
                    ) : (
                      <div className="home-work-placeholder" data-tone={state.tone} role="img" aria-label={`${state.label}: ${title}`}>
                        {state.tone === "progress" ? <span className="spinner" /> : state.tone === "danger" ? <AlertTriangle size={22} /> : <Film size={22} />}
                      </div>
                    )}
                    <span className="home-status" data-tone={state.tone}>
                      <i aria-hidden="true" />
                      {state.label}
                    </span>
                  </div>
                  <div className="home-work-body">
                    <h3>{title}</h3>
                    <span className="home-work-meta">
                      {who ? `${who} · ` : ""}
                      {displayDate(video.createdAt, "short")}
                    </span>
                    <Link href={state.href} className="home-work-action" aria-label={`${state.action}: ${title}`}>
                      {state.action}
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="home-empty">
            <span className="home-empty-icon" aria-hidden="true">
              <Film size={22} />
            </span>
            <b>Nenhum vídeo ainda</b>
            <p>
              {families.length
                ? "Seus influencers estão prontos. Escolha um movimento de referência e gere o primeiro vídeo."
                : "Crie um influencer, escolha uma referência e gere seu primeiro vídeo."}
            </p>
            <Link href={families.length ? "/app/criar-videos" : "/app/influencers"} className="btn btn-accent">
              {families.length ? "Criar vídeo" : "Criar influencer"}
            </Link>
          </div>
        )}
      </section>

      <section className="home-section" aria-labelledby="home-cast-title">
        <div className="home-section-head">
          <h2 id="home-cast-title">Seus influencers</h2>
          {families.length > CAST_LIMIT ? (
            <Link href="/app/influencers" className="home-link">
              Ver todos
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {families.length ? (
          <div className="home-cast">
            {families.slice(0, CAST_LIMIT).map((family) => {
              const shown = family.versions.find((version) => version.status === "completed" && version.imageUrl) ?? family.root;
              const ready = shown.status === "completed" && shown.imageUrl;
              return (
                <Link key={family.id} href="/app/influencers" className="home-cast-item" aria-label={`Abrir ${shown.name} no estúdio de influencers`}>
                  <span className="home-cast-avatar" data-state={ready ? "ready" : shown.status}>
                    {ready ? (
                      <InfluencerImage src={shown.imageUrl!} alt="" />
                    ) : shown.status === "failed" ? (
                      <AlertTriangle size={18} aria-hidden="true" />
                    ) : (
                      <span className="spinner" aria-hidden="true" />
                    )}
                  </span>
                  <span className="home-cast-name">{shown.name}</span>
                </Link>
              );
            })}
            <Link href="/app/influencers" className="home-cast-item home-cast-new" aria-label="Criar novo influencer">
              <span className="home-cast-avatar">
                <Plus size={22} aria-hidden="true" />
              </span>
              <span className="home-cast-name">Novo influencer</span>
            </Link>
          </div>
        ) : (
          <div className="home-empty home-empty-row">
            <span className="home-empty-icon" aria-hidden="true">
              <Users size={22} />
            </span>
            <div>
              <b>Crie seu primeiro influencer</b>
              <p>Monte um personagem com identidade própria para estrelar seus vídeos.</p>
            </div>
            <Link href="/app/influencers" className="btn btn-accent">
              Criar influencer
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
