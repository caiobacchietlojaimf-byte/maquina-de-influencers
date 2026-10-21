import Link from "next/link";
import { ArrowRight, BookOpen, Check, Clapperboard, Coins, Flame, Send, Users, Wand2 } from "lucide-react";

import { requirePageUser } from "@/lib/auth";
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
            A esteira completa da máquina: minerar o viral, criar o influencer, gerar o vídeo e
            publicar. Tudo aqui dentro.
          </p>
          <div className={styles.heroActions}>
            <Link href="/app/criar-videos" className="btn btn-accent">
              <Wand2 size={17} /> Criar vídeo
            </Link>
            <Link href="/app/influencers" className="btn btn-ghost">
              <Users size={17} /> Criar influencer
            </Link>
          </div>
        </div>

        <div className={styles.balance}>
          <span className={styles.balanceIcon}>
            <Coins size={18} />
          </span>
          <span className={styles.balanceLabel}>Saldo disponível</span>
          <strong>{user.credits.toLocaleString("pt-BR")}</strong>
          <span className={styles.balanceUnit}>créditos</span>
          <Link href="/app/creditos" className={styles.balanceLink}>
            Comprar créditos <ArrowRight size={15} />
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
