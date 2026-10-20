import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Check, Clock, Infinity, ListChecks, LockKeyhole, Sparkles } from "lucide-react";

import { LEARNING_MODULES, type LearningModule } from "@/data/learning-modules";
import { CopyModelButton } from "./copy-model-button";
import { LogoMark } from "./logo";
import styles from "./learning-pages.module.css";

/* Área Aprender: índice com a trilha e os cinco guias escritos, leitura de cada
   guia em página própria e a trilha extra (ComfyUI/GPU) em preparação. O
   conteúdo vem de src/data/learning-modules.ts e não muda aqui. O acesso é
   decidido pelo servidor (unlocked); sem plano, nada do conteúdo é renderizado. */

const FIRST_GUIDE = `/app/modulos/${LEARNING_MODULES[0].slug}`;

function moduleNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function LessonLibrary({ unlocked }: { unlocked: boolean }) {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.badge}><LogoMark size={16} /> Aprender · Pro e Max</span>
        <h1>Aprenda. Crie. Evolua.</h1>
        <p>Um caminho simples para transformar suas ideias em conteúdo.</p>
      </header>

      <section className={styles.trail} aria-labelledby="trail-title">
        <div className={styles.trailText}>
          <span className={styles.eyebrow}><BookOpen size={14} aria-hidden="true" /> Trilha</span>
          <h2 id="trail-title">Do personagem à primeira série</h2>
          <p>Cinco guias escritos com exercícios práticos: identidade do personagem, escolha de referências, instruções de edição, revisão do resultado e criação de séries.</p>
          {unlocked
            ? <Link href={FIRST_GUIDE} className="btn btn-accent">Começar trilha <ArrowRight size={16} aria-hidden="true" /></Link>
            : <Link href="/app/planos" className="btn btn-accent">Ver planos <ArrowRight size={16} aria-hidden="true" /></Link>}
        </div>
        <ol className={styles.trailSteps} aria-label="Etapas da trilha">
          {LEARNING_MODULES.map((module, index) => <li key={module.slug}><span>{moduleNumber(index)}</span>{module.shortTitle}</li>)}
        </ol>
      </section>

      {!unlocked ? (
        <section className={styles.locked} aria-labelledby="locked-title">
          <LockKeyhole size={22} aria-hidden="true" />
          <div>
            <h2 id="locked-title">Continue aprendendo no Pro ou Max</h2>
            <p>Os módulos completos estão incluídos nesses planos. Veja abaixo os assuntos e escolha seu plano para acessar os guias e exercícios.</p>
          </div>
          <Link href="/app/planos" className="btn btn-accent">Ver planos <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      ) : null}

      <div className={styles.sectionHead}>
        <h2>Módulos</h2>
        <span>{LEARNING_MODULES.length} guias escritos</span>
      </div>
      <ul className={styles.grid} aria-label="Módulos">
        {LEARNING_MODULES.map((module, index) => (
          <li key={module.slug}>
            <article className={styles.card} data-locked={!unlocked}>
              <div className={styles.cover}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={module.cover} alt="" width={640} height={400} loading={index < 3 ? "eager" : "lazy"} decoding="async" />
              </div>
              <div className={styles.cardBody}>
                <div className={styles.cardMeta}>
                  <span className={styles.number}>Módulo {moduleNumber(index)}</span>
                  <span className={styles.kind}><BookOpen size={12} aria-hidden="true" /> Guia escrito</span>
                </div>
                <h3>{module.shortTitle}</h3>
                <p>{module.description}</p>
                {unlocked
                  ? <Link href={`/app/modulos/${module.slug}`} className={styles.open} aria-label={`Abrir guia: ${module.shortTitle}`}>Abrir guia <ArrowRight size={15} aria-hidden="true" /></Link>
                  : <span className={styles.lockedTag}><LockKeyhole size={13} aria-hidden="true" /> Incluído no Pro e no Max</span>}
              </div>
            </article>
          </li>
        ))}
      </ul>

      <section className={styles.extraModule} aria-labelledby="extra-unlimited-title">
        <div className={styles.extraCover}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/learn/cover-comfy.svg" alt="" width={640} height={400} loading="lazy" decoding="async" />
        </div>
        <div className={styles.extraText}>
          <div className={styles.extraBadges}><span className={styles.badge}>MÓDULO EXTRA · MAX</span><span className={`${styles.badge} ${styles.preparation}`}><Clock size={13} aria-hidden="true" />Em preparação</span></div>
          <h2 id="extra-unlimited-title"><Infinity size={20} aria-hidden="true" />Criação Ilimitada</h2>
          <p>Uma futura trilha sobre produção com ComfyUI e GPU própria ou alugada. As aulas gravadas ainda não estão disponíveis; o acesso ao módulo faz parte do plano Max.</p>
          <Link href="/app/criacao-ilimitada" className="btn btn-ghost" aria-label="Conhecer o módulo Criação Ilimitada">Conhecer o módulo <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>
    </div>
  );
}

export function LessonReader({ module, index, unlocked }: { module: LearningModule; index: number; unlocked: boolean }) {
  const previous = index > 0 ? LEARNING_MODULES[index - 1] : undefined;
  const next = index < LEARNING_MODULES.length - 1 ? LEARNING_MODULES[index + 1] : undefined;
  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label="Navegação dos módulos">
        <Link href="/app/modulos" className={styles.backLink}><ArrowLeft size={15} aria-hidden="true" /> Voltar aos módulos</Link>
        <span aria-hidden="true">·</span>
        <span>Módulo {moduleNumber(index)} de {LEARNING_MODULES.length}</span>
      </nav>

      <header className={styles.readerHead}>
        <div className={styles.cardMeta}>
          <span className={styles.number}>Módulo {moduleNumber(index)}</span>
          <span className={styles.kind}><BookOpen size={12} aria-hidden="true" /> Guia escrito</span>
        </div>
        <h1>{module.title}</h1>
        <p className={styles.lead}>{module.description}</p>
      </header>

      {!unlocked ? (
        <section className={styles.locked} aria-labelledby="locked-title">
          <LockKeyhole size={22} aria-hidden="true" />
          <div>
            <h2 id="locked-title">Continue aprendendo no Pro ou Max</h2>
            <p>Este guia completo, com modelo e exercício, está incluído nesses planos.</p>
          </div>
          <Link href="/app/planos" className="btn btn-accent">Ver planos <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      ) : (
        <div className={styles.reader}>
          <article className={styles.article}>
            <section id="introducao" aria-labelledby="introducao-title">
              <h2 id="introducao-title" className="sr-only">Introdução</h2>
              {module.paragraphs.map((text) => <p key={text}>{text}</p>)}
            </section>
            <section id="antes-de-seguir" className={styles.block} aria-labelledby="checklist-title">
              <h2 id="checklist-title"><ListChecks size={18} aria-hidden="true" /> Antes de seguir</h2>
              <ul>{module.checklist.map((text) => <li key={text}>{text}</li>)}</ul>
            </section>
            <section id="modelo" className={styles.block} aria-labelledby="model-title">
              <div className={styles.blockHead}>
                <h2 id="model-title"><Sparkles size={18} aria-hidden="true" /> Modelo para adaptar</h2>
                <CopyModelButton text={module.prompt} />
              </div>
              <pre>{module.prompt}</pre>
            </section>
            <section id="exercicio" className={styles.exercise} aria-labelledby="exercise-title">
              <h2 id="exercise-title">Seu exercício</h2>
              <p>{module.exercise}</p>
              <Link href={module.tool.href} className="btn btn-accent">Colocar em prática <ArrowRight size={16} aria-hidden="true" /></Link>
              <span className={styles.toolHint}>{module.tool.label}</span>
            </section>
          </article>
          <aside className={styles.toc} aria-label="Neste guia">
            <span className={styles.eyebrow}>Neste guia</span>
            <ol>
              <li><a href="#introducao">Introdução</a></li>
              <li><a href="#antes-de-seguir">Antes de seguir</a></li>
              <li><a href="#modelo">Modelo para adaptar</a></li>
              <li><a href="#exercicio">Seu exercício</a></li>
            </ol>
            <Link href={module.tool.href} className="btn btn-accent btn-sm">Colocar em prática <ArrowRight size={14} aria-hidden="true" /></Link>
          </aside>
        </div>
      )}

      <nav className={styles.pager} aria-label="Guias anterior e próximo">
        {previous ? <Link href={`/app/modulos/${previous.slug}`} className={styles.pagerLink} rel="prev"><ArrowLeft size={15} aria-hidden="true" /><span><small>Anterior</small>{previous.shortTitle}</span></Link> : <span />}
        <Link href="/app/modulos" className="btn btn-ghost">Voltar aos módulos</Link>
        {next ? <Link href={`/app/modulos/${next.slug}`} className={`${styles.pagerLink} ${styles.pagerNext}`} rel="next"><span><small>Próximo</small>{next.shortTitle}</span><ArrowRight size={15} aria-hidden="true" /></Link> : <span />}
      </nav>
    </div>
  );
}

export function UnlimitedLearning({ unlocked }: { unlocked: boolean }) {
  return <div className={styles.page}>
    <nav className={styles.crumbs} aria-label="Navegação dos módulos"><Link href="/app/modulos" className={styles.backLink}><ArrowLeft size={15} aria-hidden="true" /> Voltar aos módulos</Link></nav>
    <header className={styles.readerHead}><span className={styles.badge}><Infinity size={15} /> MÓDULO MAX · EM PREPARAÇÃO</span><h1>Criação Ilimitada</h1><p className={styles.lead}>Uma futura trilha para entender a produção com ComfyUI e GPU própria ou alugada. Mais autonomia para montar seu processo, com custos e limites claros.</p></header>
    <div className={styles.intro}><Clock size={19} /><p><strong>As aulas gravadas ainda não estão disponíveis.</strong> Não há data anunciada. O plano Max dá acesso a este módulo; o nome não inclui geração infinita no estúdio nem GPU gratuita.</p></div>
    {!unlocked ? <section className={styles.locked}><LockKeyhole size={22} /><div><h2>Um módulo extra do plano Max</h2><p>Conheça o conteúdo planejado abaixo. Os módulos escritos do Pro já estão disponíveis; esta trilha de aulas gravadas está em preparação.</p></div><Link href="/app/planos" className="btn btn-accent">Conhecer o Max <ArrowRight size={16} /></Link></section> : <div className={styles.intro}><Check size={19} /><p>Seu acesso inclui este módulo. Enquanto as aulas são preparadas, use os módulos escritos e organize as referências do seu projeto.</p></div>}
    <div className={styles.roadmap}>{[
      ["Entender o fluxo", "O papel dos modelos, referências e etapas de um workflow visual no ComfyUI."],
      ["Preparar o ambiente", "Conceitos de GPU, memória, armazenamento e configuração antes de iniciar uma sessão."],
      ["Trabalhar com referências", "Organização de imagens, vídeos, prompts e versões para experimentos reproduzíveis."],
      ["Revisar e controlar custos", "Como planejar testes, comparar resultados e acompanhar recursos do ambiente escolhido."],
    ].map(([title, description], index) => <article key={title}><span>0{index + 1} · CONTEÚDO PLANEJADO</span><h2>{title}</h2><p>{description}</p></article>)}</div>
    {unlocked ? <section className={styles.ready}><h2>O que você pode preparar agora</h2><ul>{["Salve o vídeo original, a imagem aprovada do influencer e a ficha do personagem.", "Defina o resultado esperado e um limite de gasto para cada experimento.", "Confira os requisitos do modelo e as regras de cobrança antes de contratar uma GPU.", "Organize uma pasta para entrada, versões de teste e resultados aprovados.", "Use Exportar pacote em Criar Vídeos para reunir os arquivos e instruções do projeto."].map((text) => <li key={text}><Check size={16} />{text}</li>)}</ul><div className={styles.links}><Link href="/app/criar-videos" className="btn btn-accent">Preparar meu projeto <ArrowRight size={16} /></Link><Link href="/app/modulos" className="btn btn-ghost">Ler os módulos <BookOpen size={16} /></Link></div></section> : null}
  </div>;
}
