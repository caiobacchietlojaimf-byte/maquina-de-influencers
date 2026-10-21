import Link from "next/link";
import { ArrowRight, BookOpen, Check, Clapperboard, Coins, Flame, Send, Sparkles, Users, Wand2 } from "lucide-react";

import { requirePageUser } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/plans";
import { listInfluencers, listPosts, listVideos } from "@/lib/db";
import { isConfigured } from "@/lib/platform";
import { groupInfluencerVersions } from "@/lib/influencer-versions";

import styles from "./home.module.css";

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
  const influencerCount = groupInfluencerVersions(influencers).length;
  const postedCount = posts.filter((p) => p.status === "posted").length;
  const firstName = user.name.split(" ")[0];
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
        <div className="notice">
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
            <span>influencers criados</span>
          </p>
        </div>
        <div>
          <span className={styles.statIcon}>
            <Clapperboard size={18} />
          </span>
          <p>
            <strong>{videos.length}</strong>
            <span>vídeos gerados</span>
          </p>
        </div>
        <div>
          <span className={styles.statIcon}>
            <Send size={18} />
          </span>
          <p>
            <strong>{postedCount}</strong>
            <span>publicações feitas</span>
          </p>
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
