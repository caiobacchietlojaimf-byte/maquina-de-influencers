import Link from "next/link";
import { ArrowRight, BookOpen, Check, Clapperboard, Infinity, Layers3, ScanFace, Sparkles } from "lucide-react";
import { HERO_VIDEOS } from "@/data/hero";
import PRESETS from "@/data/influencer-presets.json";
import { CHARACTER_TYPES } from "@/data/character-types";
import { PLAN_CATALOG } from "@/lib/plans";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./landing.module.css";

const examples = PRESETS.filter((_, index) => [0, 4, 10].includes(index));
const steps = [
  { title: "Dê identidade à sua ideia", text: "Escolha os traços do personagem, envie uma foto e acrescente uma referência de estilo.", icon: ScanFace },
  { title: "Escolha uma boa referência", text: "Explore o catálogo ou envie seu vídeo. Prepare a troca e confira duração, modelo e custo antes de gerar.", icon: Clapperboard },
  { title: "Revise. Ajuste. Publique.", text: "Compare o resultado com o original, baixe seus arquivos e organize a publicação nas contas conectadas.", icon: Layers3 },
];

export default function LandingPage() {
  return <div className={styles.landing}>
    <a className={styles.skip} href="#conteudo">Ir para o conteúdo</a>
    <nav className={styles.nav} aria-label="Navegação principal">
      <Link href="/" className={styles.brand}><LogoMark size={30} /><span>MÁQUINA DE<br />INFLUENCERS</span></Link>
      <div className={styles.navLinks}><a href="#exemplos">Exemplos</a><a href="#como-funciona">Como funciona</a><a href="#planos">Planos</a></div>
      <div className={styles.navActions}><ThemeToggle compact /><Link href="/login" className={`btn btn-ghost ${styles.login}`}>Entrar</Link><Link href="/login?modo=cadastro" className="btn btn-accent">Começar <ArrowRight size={16} /></Link></div>
    </nav>
    <main id="conteudo">
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><Sparkles size={15} /> PERSONAGENS DE IA. IDEIAS COM PERSONALIDADE.</span>
          <h1>Uma ideia.<br />Um personagem.<br /><em>Seu próximo vídeo.</em></h1>
          <p>Crie um influencer com a sua cara, encontre referências e transforme seu personagem em conteúdo. Tudo em um estúdio, do primeiro traço à revisão do vídeo.</p>
          <div className={styles.actions}><Link href="/login?modo=cadastro" className="btn btn-accent btn-lg">Criar meu influencer <ArrowRight size={19} /></Link><a href="#exemplos" className="btn btn-outline">Ver exemplos</a></div>
          <p className={styles.microcopy}>Confira o custo antes de gerar.</p>
        </div>
        <div className={styles.cast} aria-label="Exemplos de personagens do catálogo">
          {examples.map((item, index) => <figure className={styles.castCard} key={item.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.preview.thumb || item.preview.url} alt={`Personagem de IA do catálogo, exemplo ${index + 1}`} fetchPriority={index === 1 ? "high" : "auto"} />
            <figcaption>{CHARACTER_TYPES.find((type) => type.id === item.tier)?.label ?? "Personagem de IA"}</figcaption>
          </figure>)}
          <div className={styles.castNote}><span className={styles.liveDot} /> Referências reais do catálogo do estúdio</div>
        </div>
      </section>
      <section className={styles.valueStrip} aria-label="Ferramentas do estúdio"><span><ScanFace size={18} /> 9 tipos de personagem</span><span><Layers3 size={18} /> Traços e referências visuais</span><span><Clapperboard size={18} /> Vídeo original como base</span><span><BookOpen size={18} /> Guias práticos no Pro</span></section>
      <section className={styles.section} id="exemplos">
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>IMAGINE O SEU PERSONAGEM AQUI</span><h2>Personalidades que saem do comum.</h2></div><p>Assista a referências do catálogo. São exemplos de possibilidades, não garantia de um resultado idêntico.</p></div>
        <div className={styles.videoGrid}>{HERO_VIDEOS.slice(0, 3).map((video, index) => <figure key={video.src}>
          <video src={video.src} poster={video.poster} controls playsInline preload="none" aria-label={`Exemplo de personagem em movimento ${index + 1}`} />
          <figcaption><span>Personagem em movimento</span><span>0{index + 1}</span></figcaption>
        </figure>)}</div>
        <p className={styles.mediaNote}>Referências do catálogo Higgsfield integrado ao estúdio. A Máquina de Influencers é um produto independente.</p>
      </section>
      <section className={`${styles.section} ${styles.workflow}`} id="como-funciona">
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>MENOS ABAS. MAIS CRIAÇÃO.</span><h2>Seu fluxo criativo,<br />do começo ao fim.</h2></div><p>Ferramentas conectadas para você trabalhar com intenção e revisar cada etapa.</p></div>
        <div className={styles.steps}>{steps.map((step, index) => <article key={step.title}><div className={styles.stepTop}><step.icon size={24} /><span>0{index + 1}</span></div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>
      </section>
      <section className={styles.section} id="planos">
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>ESCOLHA SEU RITMO</span><h2>Um plano para cada fase.</h2></div><p>Planos de 30 dias, com renovação manual via PIX. Valores de lançamento em definição; confirme a oferta no checkout.</p></div>
        <div className={styles.plans}>{PLAN_CATALOG.map((plan) => <article key={plan.id} className={styles.plan} data-featured={plan.id === "pro"}>
          <div className={styles.planHeading}><h3>{plan.name}</h3>{plan.id === "pro" ? <span>Para ir além</span> : null}</div>
          <p>{plan.summary}</p><div className={styles.price}>{plan.priceMonthlyBRL.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}<span>/ 30 dias</span></div>
          <strong>{plan.creditsMonthly.toLocaleString("pt-BR")} créditos por período</strong>
          <ul>{plan.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" /><span>{feature}</span></li>)}</ul>
          <Link className={`btn ${plan.id === "pro" ? "btn-accent" : "btn-ghost"}`} href={`/login?modo=cadastro&plano=${plan.id}`}>Escolher {plan.name}<ArrowRight size={16} /></Link>
        </article>)}</div>
        <p className={styles.planNote}>Os créditos são consumidos por geração; a quantidade de vídeos varia conforme o modelo e a duração. Criação Ilimitada é uma área futura de aprendizado no Max. GPU e serviços externos têm custos próprios.</p>
      </section>
      <section className={`${styles.section} ${styles.learning}`}>
        <div><span className={styles.eyebrow}><BookOpen size={16} /> CRIAR TAMBÉM É APRENDER</span><h2>Mais repertório.<br />Mais controle sobre o resultado.</h2><p>No Pro e no Max, guias originais para construir personagens, escolher referências, escrever instruções e revisar suas criações.</p><Link href="/login?modo=cadastro&plano=pro" className="btn btn-outline">Conhecer o Pro <ArrowRight size={16} /></Link></div>
        <div className={styles.future}><Infinity size={32} /><span className={styles.pill}>NO MAX · EM PREPARAÇÃO</span><h3>Criação Ilimitada</h3><p>Uma futura trilha gravada sobre ComfyUI e produção com GPU própria ou alugada. O nome da área não significa vídeos gratuitos ou computação sem limite.</p><span className={styles.microcopy}>Aulas gravadas ainda não disponíveis. Sem data de lançamento anunciada.</span></div>
      </section>
      <section className={`${styles.section} ${styles.faq}`} aria-labelledby="faq-title"><div><span className={styles.eyebrow}>DÚVIDAS ANTES DE COMEÇAR?</span><h2 id="faq-title">Sem letras miúdas.</h2></div><div>
        <details><summary>Preciso saber programar?</summary><p>Para usar o estúdio, não. Você escolhe o personagem e a referência pela interface. O aprendizado técnico com ComfyUI e GPU pertence à área futura Criação Ilimitada.</p></details>
        <details><summary>A troca fica exatamente igual ao vídeo original?</summary><p>O original é a base da edição, mas a fidelidade visual varia com o modelo, a referência, os cortes e os movimentos. Confira a estimativa antes de gerar e revise personagem, cenário e áudio ao finalizar.</p></details>
        <details><summary>O plano inclui vídeos ilimitados?</summary><p>Não. As gerações no estúdio usam créditos. A área Criação Ilimitada prevista no Max é uma trilha de aprendizado; GPU e provedores externos continuam sujeitos a limites e cobranças.</p></details>
        <details><summary>O pagamento renova sozinho?</summary><p>A modalidade prevista é PIX por 30 dias, com renovação manual. O checkout apresenta o plano, o valor e o período antes do pagamento.</p></details>
        <details><summary>Como escolho minhas referências?</summary><p>Prefira material que você tem autorização para usar, com personagem visível, boa luz e movimentos fáceis de acompanhar. Revise o conteúdo antes de publicar e confira as regras da rede social.</p></details>
      </div></section>
      <section className={styles.finalCta}><Sparkles size={26} /><h2>Qual personagem você vai criar?</h2><p>Comece pela identidade. Construa o resto no seu ritmo.</p><Link href="/login?modo=cadastro" className="btn btn-accent btn-lg">Abrir meu estúdio <ArrowRight size={18} /></Link></section>
    </main>
    <footer className={styles.footer}><Link href="/" className={styles.brand}><LogoMark size={23} /><span>MÁQUINA DE INFLUENCERS</span></Link><span>Personagens, referências e vídeos em um só lugar.</span><nav aria-label="Informações legais" className={styles.legalLinks}><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link><Link href="/exclusao-de-dados">Excluir dados</Link></nav><Link href="/login">Entrar no estúdio</Link></footer>
  </div>;
}
