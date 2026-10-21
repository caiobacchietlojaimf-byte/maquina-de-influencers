"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ImagePlus, Info, Sparkles } from "lucide-react";
import { VIRAIS_PROPRIOS, viralVideo, type ViralProprio } from "@/data/virais-proprios";
import { PlanModal } from "./plan-modal";
import styles from "./template-studio.module.css";

export function TemplateStudio({ viral }: { viral: ViralProprio }) {
  const router = useRouter();
  const [plans, setPlans] = useState<null | "photo" | "generate">(null);
  const available = useMemo(() => VIRAIS_PROPRIOS.filter((item) => item.status !== "soon"), []);
  const total = viral.slots.length;
  const [first, ...rest] = viral.title.split(" ");

  return <main className={styles.page}>
    <Link href="/#templates" className={styles.back}><ArrowLeft size={16} /> Início</Link>

    <details className={styles.picker}>
      <summary>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={viral.poster} alt="" />
        <span><strong>{viral.title}</strong><small>{viral.description}</small></span>
        <ChevronDown size={18} aria-hidden />
      </summary>
      <ul>
        {available.map((item) => <li key={item.slug}>
          <button type="button" data-active={item.slug === viral.slug} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); router.push(`/v/${item.slug}`); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.poster} alt="" />
            <span><strong>{item.title}</strong><small>{item.people} {item.people === 1 ? "foto" : "fotos"}</small></span>
          </button>
        </li>)}
      </ul>
    </details>

    <div className={styles.stage}>
      <video key={viral.slug} src={viralVideo(viral.slug)} poster={viral.poster} muted loop playsInline autoPlay controls={false} aria-label={`Vídeo de referência: ${viral.title}`} />
      <span className={styles.stageTitle}>{first}{rest.length ? <> <mark>{rest.join(" ")}</mark></> : null}</span>
    </div>

    <div className={styles.sectionHead}>
      <span>Fotos</span>
      <span className={styles.counter}>0/{total}</span>
    </div>

    <div className={styles.slots} data-count={total}>
      {viral.slots.map((slot, index) => <div key={slot.label + index} className={styles.slot}>
        <button type="button" className={styles.drop} onClick={() => setPlans("photo")} aria-label={`Enviar foto: ${slot.label}`}>
          <span className={styles.dropEmpty}><span className={styles.dropIcon}><ImagePlus size={18} /></span>Enviar foto</span>
        </button>
        <strong>{slot.label}</strong>
        <small>{slot.hint}</small>
      </div>)}
    </div>

    <details className={styles.info}>
      <summary>Como funciona <ChevronDown size={18} aria-hidden /></summary>
      <ol>
        <li><b>1 ·</b> Envie {total} {total === 1 ? "foto" : "fotos"}: uma pessoa por foto, nítida e de frente.</li>
        <li><b>2 ·</b> Confira a ordem: cada foto vira a pessoa descrita na caixa dela.</li>
        <li><b>3 ·</b> Toque em Gerar. O vídeo mantém os movimentos, a câmera e o áudio do original.</li>
      </ol>
      <p>Dicas: evite fotos em grupo, óculos escuros, sombras fortes, filtros e fotos de baixa qualidade.</p>
    </details>

    <details className={`${styles.info} ${styles.warn}`}>
      <summary><Info size={16} aria-hidden /> Antes de gerar: leia rapidinho <ChevronDown size={18} aria-hidden /></summary>
      <ul>
        <li>A IA nem sempre acerta de primeira: use fotos nítidas, de frente e com boa luz.</li>
        <li>O vídeo pode levar alguns minutos. Se ainda não apareceu, continua gerando.</li>
        <li>Vídeo concluído usa os créditos mesmo se não ficar perfeito. Se der erro, os créditos voltam.</li>
        <li>Use apenas fotos suas ou de quem autorizou.</li>
      </ul>
    </details>

    <p className={styles.order}>As fotos seguem a ordem das caixas: {viral.slots.map((slot) => slot.hint.charAt(0).toLowerCase() + slot.hint.slice(1)).join(" → ")}.</p>

    <button type="button" className={styles.generate} onClick={() => setPlans("generate")}>
      <Sparkles size={18} /> Gerar meu vídeo
    </button>
    <p className={styles.hint}>Escolha um plano, envie {total === 1 ? "a foto" : `as ${total} fotos`} e gere o seu. Ao enviar, você confirma que tem autorização de quem está nas fotos e aceita os <Link href="/termos">Termos de Uso</Link> e a <Link href="/privacidade">Política de Privacidade</Link>.</p>

    <PlanModal
      open={plans !== null}
      onClose={() => setPlans(null)}
      video={viralVideo(viral.slug)}
      poster={viral.poster}
      template={viral.slug}
      subtitle={plans === "photo" ? `Para enviar ${total === 1 ? "a sua foto" : "as fotos"} e gerar este vídeo, escolha um plano.` : undefined}
    />
  </main>;
}
