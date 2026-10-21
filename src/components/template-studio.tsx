"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ImagePlus, Info, RefreshCw, Sparkles, X } from "lucide-react";
import { VIRAIS_PROPRIOS, viralVideo, type ViralProprio } from "@/data/virais-proprios";
import { PlanModal } from "./plan-modal";
import styles from "./template-studio.module.css";

export function TemplateStudio({ viral }: { viral: ViralProprio }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<(string | null)[]>(() => viral.slots.map(() => null));
  const [agreed, setAgreed] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const available = useMemo(() => VIRAIS_PROPRIOS.filter((item) => item.status !== "soon"), []);

  const urls = useRef(photos);
  urls.current = photos;
  useEffect(() => () => { urls.current.forEach((url) => url && URL.revokeObjectURL(url)); }, []);

  const filled = photos.filter(Boolean).length;
  const total = viral.slots.length;
  const ready = filled === total && agreed;
  const [first, ...rest] = viral.title.split(" ");

  const setPhoto = (index: number, file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const next = URL.createObjectURL(file);
    const previous = photos[index];
    if (previous) URL.revokeObjectURL(previous);
    setPhotos((current) => current.map((url, i) => (i === index ? next : url)));
  };
  const clearPhoto = (index: number) => {
    const previous = photos[index];
    if (previous) URL.revokeObjectURL(previous);
    setPhotos((current) => current.map((url, i) => (i === index ? null : url)));
  };

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
      <span className={styles.counter} data-complete={filled === total}>{filled}/{total}</span>
    </div>

    <div className={styles.slots} data-count={total}>
      {viral.slots.map((slot, index) => <div key={slot.label + index} className={styles.slot}>
        <label className={styles.drop} data-filled={photos[index] ? "true" : undefined}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); setPhoto(index, event.dataTransfer.files[0]); }}>
          <input ref={(node) => { inputs.current[index] = node; }} type="file" accept="image/*" className="sr-only" onChange={(event) => setPhoto(index, event.target.files?.[0])} />
          {photos[index]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photos[index]!} alt={`Foto para ${slot.label}`} />
            : <span className={styles.dropEmpty}><span className={styles.dropIcon}><ImagePlus size={18} /></span>Enviar foto</span>}
        </label>
        {photos[index] ? <div className={styles.slotActions}>
          <button type="button" onClick={() => inputs.current[index]?.click()} aria-label={`Trocar foto de ${slot.label}`}><RefreshCw size={14} /></button>
          <button type="button" onClick={() => clearPhoto(index)} aria-label={`Remover foto de ${slot.label}`}><X size={14} /></button>
        </div> : null}
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

    <label className={styles.consent}>
      <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
      <span>Sei que o resultado pode variar, tenho autorização de quem está nas fotos e aceito os <Link href="/termos">Termos de Uso</Link> e a <Link href="/privacidade">Política de Privacidade</Link>.</span>
    </label>

    <p className={styles.order}>As fotos seguem a ordem das caixas: {viral.slots.map((slot) => slot.hint.charAt(0).toLowerCase() + slot.hint.slice(1)).join(" → ")}.</p>

    <button type="button" className={styles.generate} disabled={!ready} onClick={() => setPlansOpen(true)}>
      <Sparkles size={18} /> Gerar meu vídeo
    </button>
    <p className={styles.hint}>{ready ? "Tudo pronto. Escolha um plano para gerar." : `Envie ${total === 1 ? "a foto" : `as ${total} fotos`} e marque a caixa para gerar.`}</p>
    <p className={styles.privacy}>Suas fotos ficam só neste aparelho até você criar a conta.</p>

    <PlanModal open={plansOpen} onClose={() => setPlansOpen(false)} video={viralVideo(viral.slug)} poster={viral.poster} template={viral.slug} />
  </main>;
}
