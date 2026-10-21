import Link from "next/link";
import { ArrowRight, BookOpen, Check, Clapperboard, Infinity, Layers3, Plus, ScanFace, Send, Sparkles, Wand2 } from "lucide-react";
import { HERO_VIDEOS } from "@/data/hero";
import PRESETS from "@/data/influencer-presets.json";
import { PLAN_CATALOG } from "@/lib/plans";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeroCarousel } from "@/components/hero-carousel";
import { TrendingRow, type TrendingItem } from "@/components/trending-row";
import { VIRAL_EFFECTS } from "@/data/viral-effects";
import { MOTION_PRESETS } from "@/data/motion-presets";
import { LandingMenu } from "@/components/landing-menu";
import Image from "next/image";
import styles from "./landing.module.css";

const MOTIONS: ReadonlyArray<[name: string, title: string, description: string, tag: string]> = [
  ["Studio Rap Performance", "No estúdio", "Você no microfone, mandando o verso no estúdio", "Solo"],
  ["Urban Dance Trio", "Trio na rua", "3 amigos no passinho sincronizado na calçada", "Trio"],
  ["Convertible Car Singalong", "Conversível", "Cantando junto no carro aberto, cabelo ao vento", "Grupo"],
  ["Stage Performance Recast", "Holofote", "Você rouba a cena no palco com a plateia olhando", "Solo"],
  ["Synchronized Crowd Bow", "Reverência", "A galera inteira se curvando no mesmo tempo", "Grupo"],
  ["Nightclub Character Swap", "Na balada", "Você no lugar do personagem principal da pista", "Solo"],
  ["Dance Duo", "Dupla dançante", "2 amigos na coreografia que está em todo lugar", "Duo"],
  ["Poodle Dance Crew", "Pet na dança", "O seu pet puxando a coreografia da turma", "Pet"],
];
const motionItems: TrendingItem[] = MOTIONS.flatMap(([name, title, description, tag]) => {
  const preset = MOTION_PRESETS.find((item) => item.name === name);
  return preset ? [{ id: preset.id, name: title, description, thumbnail: preset.thumbnail, preview: preset.preview, tag, badge: preset.category === "trending" ? "hot" as const : null }] : [];
});
const effectItems: TrendingItem[] = VIRAL_EFFECTS.slice(0, 6).map((item) => ({ id: item.id, name: item.name, description: item.description, thumbnail: item.thumbnail, preview: item.preview, views: item.views, badge: item.views >= 40_000_000 ? "hot" : null }));
const trending: TrendingItem[] = motionItems.flatMap((item, index) => (effectItems[index] ? [item, effectItems[index]] : [item]));
const faces = PRESETS.slice(12, 16);
const navLinks = [
  { href: "#exemplos", label: "Exemplos" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "Dúvidas" },
];

const stats = [
  { value: "9", label: "tipos de personagem", icon: ScanFace },
  { value: "180+", label: "traços de aparência", icon: Layers3 },
  { value: "4", label: "etapas, um só estúdio", icon: Wand2 },
  { value: "2", label: "redes para publicar", icon: Send },
];

const steps = [
  { title: "Dê identidade à sua ideia", text: "Escolha os traços do personagem, envie uma foto e acrescente uma referência de estilo.", icon: ScanFace },
  { title: "Escolha uma boa referência", text: "Explore o catálogo ou envie seu vídeo. Confira duração, modelo e custo antes de gerar.", icon: Clapperboard },
  { title: "Revise. Ajuste. Publique.", text: "Compare com o original, baixe seus arquivos e organize a publicação nas contas conectadas.", icon: Send },
];

const faq = [
  { q: "Preciso saber programar?", a: "Para usar o estúdio, não. Você escolhe o personagem e a referência pela interface. O aprendizado técnico com ComfyUI e GPU pertence à área futura Criação Ilimitada." },
  { q: "A troca fica exatamente igual ao vídeo original?", a: "O original é a base da edição, mas a fidelidade visual varia com o modelo, a referência, os cortes e os movimentos. Confira a estimativa antes de gerar e revise personagem, cenário e áudio ao finalizar." },
  { q: "O plano inclui vídeos ilimitados?", a: "Não. As gerações no estúdio usam créditos. A área Criação Ilimitada prevista no Max é uma trilha de aprendizado; GPU e provedores externos continuam sujeitos a limites e cobranças." },
  { q: "O pagamento renova sozinho?", a: "A modalidade prevista é PIX por 30 dias, com renovação manual. O checkout apresenta o plano, o valor e o período antes do pagamento." },
  { q: "Como escolho minhas referências?", a: "Prefira material que você tem autorização para usar, com personagem visível, boa luz e movimentos fáceis de acompanhar. Revise o conteúdo antes de publicar e confira as regras da rede social." },
];

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function LandingPage() {
  return <div className={styles.landing}>
    <a className={styles.skip} href="#conteudo">Ir para o conteúdo</a>

    <header className={styles.navWrap}>
      <nav className={styles.nav} aria-label="Navegação principal">
        <Link href="/" className={styles.brand}><LogoMark size={28} /><span>Máquina de Influencers</span></Link>
        <div className={styles.navLinks}>{navLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</div>
        <div className={styles.navActions}>
          <ThemeToggle compact />
          <Link href="/login" className={styles.login}>Entrar</Link>
          <Link href="/login?modo=cadastro" className={`btn btn-accent ${styles.navCta}`}>Começar <ArrowRight size={16} /></Link>
          <LandingMenu links={navLinks} />
        </div>
      </nav>
    </header>

    <main id="conteudo">
      <section className={styles.heroBand}>
        <div className={styles.heroGlow} aria-hidden />
        <div className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.badge}><span className={styles.badgeDot} />Estúdio de influencers com IA</span>
            <h1>Crie o influencer.<br /><em>A IA faz o resto.</em></h1>
            <p>Monte um personagem com a sua cara, escolha uma referência viral e transforme tudo em vídeo pronto para TikTok e Instagram — do primeiro traço à publicação.</p>
            <div className={styles.actions}>
              <Link href="/login?modo=cadastro" className="btn btn-accent btn-lg">Criar meu influencer <ArrowRight size={19} /></Link>
              <a href="#exemplos" className={`btn btn-outline btn-lg ${styles.ghostLg}`}>Ver exemplos</a>
            </div>
            <div className={styles.proof}>
              <div className={styles.faces} aria-hidden>
                {faces.map((item) => <Image key={item.id} src={item.preview.thumb || item.preview.url} alt="" width={34} height={34} sizes="34px" />)}
              </div>
              <span><strong>{PRESETS.length} personagens</strong> no catálogo · custo exibido antes de gerar</span>
            </div>
          </div>

          <div className={styles.stage}>
            <HeroCarousel videos={HERO_VIDEOS} />
            <div className={`${styles.float} ${styles.floatTop}`}><Wand2 size={15} /> Personagem gerado</div>
            <div className={`${styles.float} ${styles.floatBottom}`}><span className={styles.liveDot} /> Pronto para publicar</div>
          </div>
        </div>

        <div className={styles.stats}>
          {stats.map((item) => <div key={item.label}><span className={styles.statIcon}><item.icon size={18} /></span><p><strong>{item.value}</strong><span>{item.label}</span></p></div>)}
        </div>
      </section>

      <section className={`${styles.section} ${styles.trending}`} id="exemplos">
        <div className={styles.trendingHead}>
          <h2>Em alta</h2>
          <span className={styles.readyChip}><Check size={14} strokeWidth={3} /> Pronto pra recriar</span>
        </div>
        <p className={styles.trendingSub}>Os efeitos que estão <em>viralizando</em> agora. Escolha um, coloque o seu influencer e gere o vídeo.</p>
        <TrendingRow items={trending} href="/login?modo=cadastro" />
        <p className={styles.mediaNote}>Referências do catálogo Higgsfield integrado ao estúdio. A Máquina de Influencers é um produto independente. Exemplos ilustram possibilidades, não garantem resultado idêntico.</p>
      </section>

      <section className={`${styles.section} ${styles.workflow}`} id="como-funciona">
        <div className={styles.sectionHeading}>
          <span className={styles.eyebrow}>Como funciona</span>
          <h2>Do personagem ao post em três passos.</h2>
          <p>Ferramentas conectadas para você trabalhar com intenção e revisar cada etapa.</p>
        </div>
        <ol className={styles.steps}>
          {steps.map((step, index) => <li key={step.title}>
            <div className={styles.stepTop}><span className={styles.stepIcon}><step.icon size={22} /></span><span className={styles.stepNum}>0{index + 1}</span></div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>)}
        </ol>
      </section>

      <section className={styles.section} id="planos">
        <div className={styles.sectionHeading}>
          <span className={styles.eyebrow}>Planos</span>
          <h2>Um plano para cada fase.</h2>
          <p>Planos de 30 dias com renovação manual via PIX. Valores de lançamento em definição; confirme a oferta no checkout.</p>
        </div>
        <div className={styles.plans}>
          {PLAN_CATALOG.map((plan) => <article key={plan.id} className={styles.plan} data-featured={plan.id === "pro"}>
            <div className={styles.planHeading}><h3>{plan.name}</h3>{plan.id === "pro" ? <span>Mais escolhido</span> : null}</div>
            <p>{plan.summary}</p>
            <div className={styles.price}>{brl(plan.priceMonthlyBRL)}<span>/ 30 dias</span></div>
            <strong className={styles.credits}><Sparkles size={14} /> {plan.creditsMonthly.toLocaleString("pt-BR")} créditos por período</strong>
            <ul>{plan.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" /><span>{feature}</span></li>)}</ul>
            <Link className={`btn ${plan.id === "pro" ? "btn-accent" : "btn-ghost"}`} href={`/login?modo=cadastro&plano=${plan.id}`}>Escolher {plan.name}<ArrowRight size={16} /></Link>
          </article>)}
        </div>
        <p className={styles.planNote}>Os créditos são consumidos por geração; a quantidade de vídeos varia conforme o modelo e a duração. Criação Ilimitada é uma área futura de aprendizado no Max. GPU e serviços externos têm custos próprios.</p>
      </section>

      <section className={`${styles.section} ${styles.learning}`}>
        <div>
          <span className={styles.eyebrow}><BookOpen size={14} /> Criar também é aprender</span>
          <h2>Mais repertório.<br />Mais controle sobre o resultado.</h2>
          <p>No Pro e no Max, guias originais para construir personagens, escolher referências, escrever instruções e revisar suas criações.</p>
          <Link href="/login?modo=cadastro&plano=pro" className="btn btn-outline">Conhecer o Pro <ArrowRight size={16} /></Link>
        </div>
        <div className={styles.future}>
          <div className={styles.futureTop}><span className={styles.stepIcon}><Infinity size={22} /></span><span className={styles.pill}>No Max · em preparação</span></div>
          <h3>Criação Ilimitada</h3>
          <p>Uma futura trilha gravada sobre ComfyUI e produção com GPU própria ou alugada. O nome da área não significa vídeos gratuitos ou computação sem limite.</p>
          <span className={styles.microcopy}>Aulas gravadas ainda não disponíveis. Sem data de lançamento anunciada.</span>
        </div>
      </section>

      <section className={`${styles.section} ${styles.faq}`} id="faq" aria-labelledby="faq-title">
        <div className={styles.faqIntro}>
          <span className={styles.eyebrow}>Dúvidas</span>
          <h2 id="faq-title">Sem letras miúdas.</h2>
          <p>Não achou sua resposta? Entre no estúdio e confira os detalhes antes de gerar qualquer coisa.</p>
        </div>
        <div className={styles.faqList}>
          {faq.map((item) => <details key={item.q}><summary>{item.q}<Plus size={18} aria-hidden /></summary><p>{item.a}</p></details>)}
        </div>
      </section>

      <section className={styles.finalWrap}>
        <div className={styles.finalCta}>
          <Layers3 size={28} />
          <h2>Qual personagem você vai criar?</h2>
          <p>Comece pela identidade. Construa o resto no seu ritmo.</p>
          <Link href="/login?modo=cadastro" className="btn btn-accent btn-lg">Abrir meu estúdio <ArrowRight size={18} /></Link>
        </div>
      </section>
    </main>

    <footer className={styles.footer}>
      <div className={styles.footerBrand}>
        <Link href="/" className={styles.brand}><LogoMark size={24} /><span>Máquina de Influencers</span></Link>
        <p>Personagens, referências e vídeos em um só lugar.</p>
      </div>
      <nav aria-label="Produto" className={styles.footerCol}><b>Produto</b><a href="#exemplos">Exemplos</a><a href="#como-funciona">Como funciona</a><a href="#planos">Planos</a><Link href="/login">Entrar no estúdio</Link></nav>
      <nav aria-label="Informações legais" className={styles.footerCol}><b>Legal</b><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/exclusao-de-dados">Excluir dados</Link></nav>
      <span className={styles.copy}>© {new Date().getFullYear()} Máquina de Influencers</span>
    </footer>
  </div>;
}
