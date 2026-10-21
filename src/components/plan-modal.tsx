"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clapperboard, Coins, QrCode, ShieldCheck, Sparkles, X } from "lucide-react";
import { PLAN_CATALOG, type PlanId } from "@/lib/plans";
import styles from "./plan-modal.module.css";

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function PlanModal({ open, onClose, video, poster, template, subtitle = "Escolha um plano para gerar o seu vídeo." }: { open: boolean; onClose: () => void; video: string; poster: string; template: string; subtitle?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [plan, setPlan] = useState<PlanId>("pro");
  const selected = PLAN_CATALOG.find((item) => item.id === plan) ?? PLAN_CATALOG[1];

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return <dialog
    ref={ref}
    className={styles.dialog}
    aria-labelledby="plan-title"
    onClose={onClose}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div className={styles.sheet}>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      <header className={styles.hero}>
        <video src={video} poster={poster} muted loop playsInline autoPlay aria-hidden />
        <div className={styles.heroText}>
          <span className={styles.chip}><QrCode size={14} /> Pagamento no PIX</span>
          <h2 id="plan-title">Você no <em>viral</em></h2>
          <p>{subtitle}</p>
        </div>
      </header>

      <div className={styles.body}>
        <ul className={styles.trust}>
          <li><ShieldCheck size={15} /> Sem renovação automática</li>
          <li><Coins size={15} /> Créditos por 30 dias</li>
          <li><Clapperboard size={15} /> Use em qualquer template</li>
        </ul>

        <div className={styles.plans} role="radiogroup" aria-label="Planos">
          {PLAN_CATALOG.map((item) => {
            const active = item.id === plan;
            return <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={styles.plan}
              data-active={active}
              data-featured={item.highlighted === true}
              onClick={() => setPlan(item.id)}
            >
              {item.highlighted ? <span className={styles.ribbon}><Sparkles size={12} /> Mais escolhido</span> : null}
              <span className={styles.radio} aria-hidden>{active ? <Check size={14} strokeWidth={3} /> : null}</span>
              <span className={styles.planInfo}>
                <strong>{item.name}</strong>
                <span>{item.summary}</span>
                <span className={styles.meta}><Coins size={13} /> {item.creditsMonthly.toLocaleString("pt-BR")} créditos · 30 dias</span>
              </span>
              <span className={styles.price}>{brl(item.priceMonthlyBRL)}<small>no PIX</small></span>
            </button>;
          })}
        </div>

        <ul className={styles.features}>
          {selected.features.map((feature) => <li key={feature}><Check size={15} aria-hidden /> {feature}</li>)}
        </ul>
        <p className={styles.note}>Valores de lançamento em definição: o checkout mostra plano, valor e período antes do pagamento. Os créditos são consumidos por geração.</p>
      </div>

      <footer className={styles.footer}>
        <Link href={`/login?modo=cadastro&plano=${selected.id}&template=${encodeURIComponent(template)}`} className={styles.pay}>
          Continuar com {selected.name} · {brl(selected.priceMonthlyBRL)} <ArrowRight size={18} />
        </Link>
        <span>Você cria a conta e paga no PIX em seguida.</span>
      </footer>
    </div>
  </dialog>;
}
