"use client";

import Image from "next/image";
import { Check, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import type { ReactNode } from "react";

import { CHARACTER_TYPES, getCharacterType, type CharacterTier } from "@/data/character-types";
import { optionsFor, type Selection, type TraitGroup } from "@/data/traits";
import { stepGroupsFor, WIZARD_STEPS } from "@/data/influencer-wizard";
import styles from "./influencer-studio.module.css";

/* Peças de apresentação do assistente de criação. O estado (etapa, seleção,
   modo) vive no InfluencerStudio; aqui só há marcação, acessibilidade e estilo. */

export function StepIndicator({
  steps,
  current,
  completed,
  disabled,
  onSelect,
}: {
  steps: ReadonlyArray<{ id: string; label: string; short: string }>;
  current: number;
  completed: ReadonlySet<number>;
  disabled: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <nav className={styles.stepper} aria-label="Etapas da criação">
      <p className={styles.stepperCompact} aria-hidden="true">
        Etapa {current + 1} de {steps.length} — {steps[current]?.label}
      </p>
      <ol className={styles.stepperList}>
        {steps.map((step, index) => {
          const state = index === current ? "current" : completed.has(index) ? "done" : "todo";
          // Só etapas já visitadas (ou a anterior) são atalhos; as demais seguem pelo "Continuar".
          const reachable = completed.has(index) || index <= current;
          return (
            <li key={step.id} className={styles.stepperItem} data-state={state}>
              <button
                type="button"
                className={styles.stepperButton}
                disabled={disabled || !reachable}
                aria-current={index === current ? "step" : undefined}
                onClick={() => onSelect(index)}
              >
                <span className={styles.stepperDot} aria-hidden="true">
                  {state === "done" ? <Check size={13} strokeWidth={3} /> : index + 1}
                </span>
                <span className={styles.stepperLabel}>{step.label}</span>
                <span className={styles.stepperShort}>{step.short}</span>
                {state === "done" ? <span className="sr-only"> (concluída)</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StepHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <header className={styles.stepHead}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export function TypePicker({ value, disabled, onChange }: { value: CharacterTier; disabled: boolean; onChange: (tier: CharacterTier) => void }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>
        Tipo de personagem <span className={styles.legendMeta}>· {CHARACTER_TYPES.length} tipos</span>
      </legend>
      <p className={styles.fieldHint}>Humanos têm etnia, idade e pele; os tipos animais usam um conjunto próprio de traços.</p>
      <div className={styles.typeGrid} role="group" aria-label="Tipo de personagem">
        {CHARACTER_TYPES.map((type) => (
          <button
            type="button"
            key={type.id}
            className={styles.optionCard}
            data-kind="media"
            data-active={value === type.id}
            aria-pressed={value === type.id}
            disabled={disabled}
            onClick={() => onChange(type.id)}
          >
            <span className={styles.optionVisual}>
              <Image src={type.icon} alt="" width={96} height={96} unoptimized />
              {value === type.id ? <Check className={styles.selectedMark} size={16} aria-hidden="true" /> : null}
            </span>
            <span>{type.label}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function TraitGroupField({
  group,
  tier,
  picked,
  disabled,
  before,
  onToggle,
}: {
  group: TraitGroup;
  tier: CharacterTier;
  picked: string[];
  disabled: boolean;
  /** Conteúdo extra antes das opções (ex.: referência de estilo). */
  before?: ReactNode;
  onToggle: (optionId: string) => void;
}) {
  const options = optionsFor(group, tier);
  const chosen = picked.map((id) => options.find((option) => option.id === id)?.label).filter(Boolean).join(", ");
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>
        {group.label}
        <span className={styles.legendMeta}>
          {" "}· {group.max > 1 ? `até ${group.max}` : "1 opção"} · opcional
        </span>
      </legend>
      <p className={styles.fieldHint} aria-live="polite">{chosen ? `Escolhido: ${chosen}` : "Nada escolhido ainda."}</p>
      {before}
      <div className={styles.optionGrid} data-kind={group.kind} role="group" aria-label={group.label}>
        {options.map((option) => {
          const active = picked.includes(option.id);
          return (
            <button
              type="button"
              key={option.id}
              className={styles.optionCard}
              data-kind={option.image ? "media" : option.swatch ? "color" : "text"}
              data-active={active}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onToggle(option.id)}
            >
              {option.image || option.swatch ? (
                <span className={styles.optionVisual}>
                  {option.image ? (
                    <Image src={option.image} alt="" width={96} height={96} style={{ objectFit: option.imageFit ?? "cover" }} unoptimized />
                  ) : (
                    <span className={styles.swatch} style={{ backgroundColor: option.swatch }} />
                  )}
                  {active ? <Check className={styles.selectedMark} size={16} aria-hidden="true" /> : null}
                </span>
              ) : null}
              <span>{option.label}</span>
              {!option.image && !option.swatch && active ? <Check size={14} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export type SummaryLine = { label: string; value: string; stepIndex: number };

/** Resumo das escolhas para o painel lateral e para a revisão final. */
export function buildSummary(tier: CharacterTier, selection: Selection): SummaryLine[] {
  const lines: SummaryLine[] = [];
  WIZARD_STEPS.forEach((step, index) => {
    for (const group of stepGroupsFor(step, tier)) {
      const options = optionsFor(group, tier);
      const labels = (selection[group.id] ?? []).map((id) => options.find((option) => option.id === id)?.label).filter((label): label is string => Boolean(label));
      if (labels.length) lines.push({ label: group.label, value: labels.join(", "), stepIndex: index });
    }
  });
  return lines;
}

export function SummaryPanel({
  name,
  tier,
  reference,
  styleReference,
  prompt,
  mode,
  lines,
  cost,
  credits,
  disabled,
  onEdit,
}: {
  name: string;
  tier: CharacterTier;
  reference: string | null;
  styleReference: string | null;
  prompt: string;
  mode: "form" | "prompt";
  lines: SummaryLine[];
  cost: number;
  credits: number;
  disabled: boolean;
  onEdit: (stepIndex: number) => void;
}) {
  const type = getCharacterType(tier);
  const Row = ({ label, value, step }: { label: string; value: ReactNode; step: number }) => (
    <li className={styles.summaryRow}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={styles.summaryValue}>{value}</span>
      <button type="button" className={styles.summaryEdit} disabled={disabled} onClick={() => onEdit(step)} aria-label={`Editar ${label}`}>
        <Pencil size={13} aria-hidden="true" />
      </button>
    </li>
  );
  return (
    <div className={styles.summary}>
      <div className={styles.summaryHead}>
        <span className={styles.summaryAvatar}>
          {reference ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={reference} alt="Foto de referência" />
          ) : mode === "form" ? (
            <Image src={type.icon} alt="" width={48} height={48} unoptimized />
          ) : null}
        </span>
        <div>
          <b>{name.trim() || "Sem nome ainda"}</b>
          <span>{mode === "prompt" ? "Imagem + prompt" : type.label}</span>
        </div>
      </div>
      <ul className={styles.summaryList}>
        {mode === "form" ? <Row label="Tipo" value={type.label} step={0} /> : null}
        <Row label="Foto de referência" value={reference ? "Enviada" : "Nenhuma"} step={0} />
        {mode === "form" ? lines.map((line) => <Row key={line.label} label={line.label} value={line.value} step={line.stepIndex} />) : null}
        {mode === "form" && styleReference ? <Row label="Referência de estilo" value="Enviada" step={3} /> : null}
        {prompt.trim() ? <Row label={mode === "prompt" ? "Descrição" : "Roupa e detalhes"} value={prompt.trim()} step={mode === "prompt" ? 1 : 3} /> : null}
        {mode === "form" && !lines.length ? <li className={styles.summaryEmpty}>Nenhum traço escolhido. Sem escolhas, a geração fica livre dentro do tipo.</li> : null}
      </ul>
      <div className={styles.summaryCost}>
        <span>Geração do personagem</span>
        <b>✦ {cost} {cost === 1 ? "crédito" : "créditos"}</b>
        <small>Saldo: {credits.toLocaleString("pt-BR")} · nada é cobrado antes de você clicar em Gerar.</small>
      </div>
    </div>
  );
}

export function WizardNav({
  canBack,
  isLast,
  disabled,
  busy,
  cost,
  blocked,
  onBack,
  onNext,
  onGenerate,
}: {
  canBack: boolean;
  isLast: boolean;
  disabled: boolean;
  busy: boolean;
  cost: number;
  /** Motivo de não poder gerar (saldo, serviço), mostrado junto ao botão. */
  blocked?: string | null;
  onBack: () => void;
  onNext: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className={styles.wizardNav}>
      <button type="button" className={`btn btn-ghost ${styles.navBack}`} disabled={disabled || !canBack} onClick={onBack}>
        <ChevronLeft size={17} aria-hidden="true" />
        Voltar
      </button>
      {blocked ? <span className={styles.navNotice} role="status">{blocked}</span> : null}
      {isLast ? (
        <button type="button" className={`btn btn-accent ${styles.navNext}`} disabled={disabled || Boolean(blocked)} onClick={onGenerate}>
          {busy ? <><span className="spinner" aria-hidden="true" /> Enviando…</> : <>Gerar personagem <span className={styles.navCost}>✦ {cost}</span></>}
        </button>
      ) : (
        <button type="button" className={`btn btn-accent ${styles.navNext}`} disabled={disabled} onClick={onNext}>
          Continuar
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
