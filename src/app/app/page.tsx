import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  Clapperboard,
  Coins,
  Film,
  Flame,
  Plus,
  Send,
  Sparkles,
  Users,
  Wand2,
} from "lucide-react";

import { requirePageUser, sessionUserId } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/plans";
import { listInfluencers, listPosts, listVideos, type Post, type Video } from "@/lib/db";
import { displayDate } from "@/lib/display-date";
import { groupInfluencerVersions } from "@/lib/influencer-versions";
import { isConfigured } from "@/lib/platform";
import { InfluencerImage } from "@/components/influencer-image";
import { VideoCover } from "@/components/video-preview";

import styles from "./home.module.css";

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

export default async function HomePage() {
  // As listas partem do id do cookie assinado e correm em paralelo com a
  // validação do usuário; sem sessão válida, requirePageUser redireciona.
  const userId = (await sessionUserId()) ?? "";
  const [user, influencers, videos, posts] = await Promise.all([
    requirePageUser(),
    userId ? listInfluencers(userId) : [],
    userId ? listVideos(userId) : [],
    userId ? listPosts(userId) : [],
  ]);
  const configured = isConfigured();
  const families = groupInfluencerVersions(influencers);
  const influencerCount = families.length;
  const recent = [...videos].sort((a, b) => b.createdAt - a.createdAt).slice(0, RECENT_LIMIT);
  const postedCount = posts.filter((post) => post.status === "posted").length;
  const influencerName = new Map(influencers.map((influencer) => [influencer.id, influencer.name]));
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const { planId } = getUserEntitlements(user);
  // Próximo passo do cliente: sem saldo → planos ou créditos; sem influencer → criar um.
  const stage = user.credits <= 0 ? (planId ? "credits" : "plan") : influencerCount === 0 ? "influencer" : "video";

  const steps = [
    {
      href: "/app/virais",
      icon: Flame,
      title: "Minerar o viral",
      text: "Tendências reais do TikTok, por região, com download sem marca d'água.",
      action: "Ver tendências",
      done: influencerCount > 0 || videos.length > 0,
    },
    {
      href: "/app/influencers",
      icon: Users,
      title: "Criar o influencer",
      text: "9 tipos, mais de 150 traços, ou jogue o dado e deixe a máquina decidir.",
      action: "Abrir estúdio",
      done: influencerCount > 0,
    },
    {
      href: "/app/criar-videos",
      icon: Wand2,
      title: "Gerar o vídeo",
      text: "Motion transfer com o viral de referência: escolha, ajuste a cena e gere.",
      action: "Criar um vídeo",
      done: videos.length > 0,
    },
    {
      href: "/app/publicar",
      icon: Send,
      title: "Publicar",
      text: "Agora ou agendado, no TikTok e no Instagram. A fila roda sozinha.",
      action: "Abrir central",
      done: postedCount > 0,
    },
  ];
  const nextStep = steps.findIndex((step) => !step.done);

  return (
    <div className={styles.home}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Seu painel</span>
          <h1>
            Olá, <span>{firstName}</span>
          </h1>
          <p>
            {stage === "plan"
              ? "Para começar a gerar, escolha um plano. Ele já vem com créditos para criar seu influencer e os primeiros vídeos."
              : stage === "credits"
                ? "Seus créditos acabaram. Recarregue para continuar criando influencers e vídeos."
                : stage === "influencer"
                  ? "Comece criando seu influencer. Depois é só escolher um vídeo de referência e gerar."
                  : "A esteira completa da máquina: minerar o viral, criar o influencer, gerar o vídeo e publicar. Tudo aqui dentro."}
          </p>
          <div className={styles.heroActions}>
            {stage === "plan" ? (
              <Link href="/app/planos" className="btn btn-accent">
                <Sparkles size={17} /> Escolher meu plano
              </Link>
            ) : stage === "credits" ? (
              <Link href="/app/creditos" className="btn btn-accent">
                <Coins size={17} /> Comprar créditos
              </Link>
            ) : stage === "influencer" ? (
              <Link href="/app/influencers" className="btn btn-accent">
                <Users size={17} /> Criar influencer
              </Link>
            ) : (
              <Link href="/app/criar-videos" className="btn btn-accent">
                <Wand2 size={17} /> Criar vídeo
              </Link>
            )}
            {stage === "video" ? (
              <Link href="/app/influencers" className="btn btn-ghost">
                <Users size={17} /> Criar influencer
              </Link>
            ) : (
              <Link href="/app/virais" className="btn btn-ghost">
                <Flame size={17} /> Ver vídeos virais
              </Link>
            )}
          </div>
        </div>

        <div className={styles.balance}>
          <span className={styles.balanceIcon}>
            <Coins size={18} />
          </span>
          <span className={styles.balanceLabel}>Saldo disponível</span>
          <strong>{user.credits.toLocaleString("pt-BR")}</strong>
          <span className={styles.balanceUnit}>créditos</span>
          <Link href={planId ? "/app/creditos" : "/app/planos"} className={styles.balanceLink}>
            {planId ? "Comprar créditos" : "Ver planos"} <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {!configured ? (
        <div className="notice" role="status">
          <b>Criação de influencers indisponível:</b> o serviço de geração ainda precisa ser configurado.
          Nenhum crédito será cobrado por essa indisponibilidade.
        </div>
      ) : null}

      <section className={styles.stats} aria-label="Seus números">
        <div>
          <span className={styles.statIcon}>
            <Users size={18} />
          </span>
          <p>
            <strong>{influencerCount}</strong>
            <span>{influencerCount === 1 ? "influencer criado" : "influencers criados"}</span>
          </p>
        </div>
        <div>
          <span className={styles.statIcon}>
            <Clapperboard size={18} />
          </span>
          <p>
            <strong>{videos.length}</strong>
            <span>{videos.length === 1 ? "vídeo gerado" : "vídeos gerados"}</span>
          </p>
        </div>
        <div>
          <span className={styles.statIcon}>
            <Send size={18} />
          </span>
          <p>
            <strong>{postedCount}</strong>
            <span>{postedCount === 1 ? "publicação feita" : "publicações feitas"}</span>
          </p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="home-cast-title">
        <div className={styles.sectionHead}>
          <h2 id="home-cast-title">Seus influencers</h2>
          {families.length > CAST_LIMIT ? (
            <Link href="/app/influencers" className={styles.sectionLink}>
              Ver todos
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {families.length ? (
          <div className={styles.cast}>
            {families.slice(0, CAST_LIMIT).map((family) => {
              const shown = family.versions.find((version) => version.status === "completed" && version.imageUrl) ?? family.root;
              const ready = shown.status === "completed" && shown.imageUrl;
              return (
                <Link key={family.id} href="/app/influencers" className={styles.castItem} aria-label={`Abrir ${shown.name} no estúdio de influencers`}>
                  <span className={styles.castAvatar} data-state={ready ? "ready" : shown.status}>
                    {ready ? (
                      <InfluencerImage src={shown.imageUrl!} alt="" />
                    ) : shown.status === "failed" ? (
                      <AlertTriangle size={18} aria-hidden="true" />
                    ) : (
                      <span className="spinner" aria-hidden="true" />
                    )}
                  </span>
                  <span className={styles.castName}>{shown.name}</span>
                </Link>
              );
            })}
            <Link href="/app/influencers" className={`${styles.castItem} ${styles.castNew}`} aria-label="Criar novo influencer">
              <span className={styles.castAvatar}>
                <Plus size={22} aria-hidden="true" />
              </span>
              <span className={styles.castName}>Novo influencer</span>
            </Link>
          </div>
        ) : (
          <div className={`${styles.empty} ${styles.emptyRow}`}>
            <span className={styles.emptyIcon} aria-hidden="true">
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

      <section className={styles.section} aria-labelledby="home-recent-title">
        <div className={styles.sectionHead}>
          <h2 id="home-recent-title">{videos.length ? "Continue de onde parou" : "Seus vídeos recentes"}</h2>
          {videos.length > RECENT_LIMIT ? (
            <Link href="/app/videos" className={styles.sectionLink}>
              Ver todos
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {recent.length ? (
          <div className={styles.works}>
            {recent.map((video) => {
              const state = workState(video, posts);
              const title = workTitle(video);
              const who = video.influencerId ? influencerName.get(video.influencerId) : undefined;
              const playable = (video.status === "completed" || video.status === "review") && video.resultUrl;
              return (
                <article key={video.id} className={styles.work}>
                  <div className={styles.workMedia}>
                    {playable ? (
                      <VideoCover
                        videoId={video.id}
                        thumbnailUrl={video.thumbnailSourceUrl === video.resultUrl ? video.thumbnailUrl : undefined}
                        title={title}
                        className={styles.workCover}
                      />
                    ) : (
                      <div className={styles.workPlaceholder} data-tone={state.tone} role="img" aria-label={`${state.label}: ${title}`}>
                        {state.tone === "progress" ? <span className="spinner" /> : state.tone === "danger" ? <AlertTriangle size={22} /> : <Film size={22} />}
                      </div>
                    )}
                    <span className={styles.status} data-tone={state.tone}>
                      <i aria-hidden="true" />
                      {state.label}
                    </span>
                  </div>
                  <div className={styles.workBody}>
                    <h3>{title}</h3>
                    <span className={styles.workMeta}>
                      {who ? `${who} · ` : ""}
                      {displayDate(video.createdAt, "short")}
                    </span>
                    <Link href={state.href} className={styles.workAction} aria-label={`${state.action}: ${title}`}>
                      {state.action}
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
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

      <section className={styles.showcase} aria-labelledby="home-showcase-title">
        <div className={styles.showcaseCopy}>
          <span className={styles.eyebrow}>Seu próximo vídeo</span>
          <h2 id="home-showcase-title">Da inspiração à publicação.</h2>
          <p>Escolha um influencer, adicione uma referência e comece.</p>
          <Link href="/app/virais" className="btn btn-outline">
            Explorar referências
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className={styles.showcaseArt} aria-hidden="true">
          {SHOWCASE.map((src) => (
            <span key={src} className={styles.showcaseFrame}>
              <img src={src} alt="" width={560} height={720} loading="lazy" decoding="async" />
            </span>
          ))}
        </div>
      </section>

      <section className={styles.flow}>
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>Esteira</span>
            <h2>Do viral à publicação em 4 passos</h2>
          </div>
          {nextStep >= 0 ? (
            <span className={styles.progress}>
              {steps.filter((step) => step.done).length} de {steps.length} concluídos
            </span>
          ) : (
            <span className={styles.progress} data-complete="true">
              <Check size={14} /> Esteira completa
            </span>
          )}
        </div>

        <ol className={styles.steps}>
          {steps.map((step, index) => {
            const Icon = step.icon;
            const state = step.done ? "done" : index === nextStep ? "next" : "todo";
            return (
              <li key={step.href} data-state={state}>
                <Link href={step.href} className={styles.step}>
                  <span className={styles.stepMarker} aria-hidden="true">
                    {step.done ? <Check size={15} strokeWidth={2.6} /> : String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.stepBody}>
                    <span className={styles.stepTitle}>
                      <Icon size={16} /> {step.title}
                      {index === nextStep ? <span className={styles.nextTag}>Próximo</span> : null}
                    </span>
                    <span className={styles.stepText}>{step.text}</span>
                    <span className={styles.stepAction}>
                      {step.action} <ArrowRight size={14} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={styles.more}>
        <Link href="/app/videos" className={styles.shortcut}>
          <span className={styles.statIcon}>
            <Clapperboard size={18} />
          </span>
          <span className={styles.shortcutBody}>
            <b>Meus vídeos</b>
            <span>Acompanhe as gerações em andamento, baixe os prontos e mande para publicação.</span>
          </span>
          <ArrowRight size={18} className={styles.shortcutArrow} />
        </Link>
        <Link href="/app/modulos" className={styles.shortcut}>
          <span className={styles.statIcon}>
            <BookOpen size={18} />
          </span>
          <span className={styles.shortcutBody}>
            <b>Módulos</b>
            <span>Aulas e estratégias para tirar o máximo da máquina e crescer os perfis.</span>
          </span>
          <ArrowRight size={18} className={styles.shortcutArrow} />
        </Link>
      </section>
    </div>
  );
}
