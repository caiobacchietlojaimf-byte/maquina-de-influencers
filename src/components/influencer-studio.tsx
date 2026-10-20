"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Clock,
  Compass,
  Dices,
  Download,
  PenLine,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  createInfluencerAction,
  deleteInfluencerAction,
  pollInfluencersAction,
  retryInfluencerAction,
} from "@/app/actions/influencers";
import { INFLUENCER_EDIT_COST, INFLUENCER_PROMPT_COST, SHEET_COST } from "@/lib/costs";
import { displayDate } from "@/lib/display-date";
import { CHARACTER_TYPES, type CharacterTier } from "@/data/character-types";
import { HERO_VIDEOS } from "@/data/hero";
import { HeroReel } from "./hero-reel";
import PRESETS from "@/data/influencer-presets.json";
import { PROMPT_STEPS, stepGroupsFor, WIZARD_STEPS } from "@/data/influencer-wizard";
import { pruneSelection, randomSelection, type Selection, type TraitGroup } from "@/data/traits";
import type { Influencer } from "@/lib/db";
import { groupInfluencerVersions, influencerRootId } from "@/lib/influencer-versions";
import { InfluencerDetails } from "./influencer-details";
import { InfluencerImage } from "./influencer-image";
import { InfluencerImportDialog } from "./influencer-import-dialog";
import { ReferenceUpload } from "./influencer-reference-upload";
import { buildSummary, StepHeading, StepIndicator, SummaryPanel, TraitGroupField, TypePicker, WizardNav } from "./influencer-wizard";
import detailStyles from "./influencer-details.module.css";
import styles from "./influencer-studio.module.css";

type Preset = {
  id: string;
  name: string;
  tier: string;
  preview: { url: string; thumb?: string; width?: number; height?: number };
  sheet: { url?: string; thumb?: string };
  selection: Record<string, string[]>;
};

type View = "create" | "explore" | "history";

const TIER_LABEL: Record<string, string> = {
  ...Object.fromEntries(CHARACTER_TYPES.map((t) => [t.id, t.label])),
  import: "Importado",
};

const LAST_FORM_STEP = WIZARD_STEPS.length - 1;
const LAST_PROMPT_STEP = PROMPT_STEPS.length - 1;

export function InfluencerStudio({
  initialInfluencers,
  credits,
  userId,
}: {
  initialInfluencers: Influencer[];
  credits: number;
  userId: string;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const router = useRouter();
  const studioId = useId();
  const mounted = useRef(true);
  const submittingRef = useRef(false);
  const requestRef = useRef<{ signature: string; key: string } | null>(null);
  const refreshRef = useRef<Promise<void> | null>(null);
  const deletedIds = useRef(new Set<string>());
  const stepTop = useRef<HTMLDivElement>(null);

  /* ----- assistente ----- */
  const [creationMode, setCreationMode] = useState<"form" | "prompt">("form");
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(() => new Set());
  const [prompt, setPrompt] = useState("");
  const [tier, setTier] = useState<CharacterTier>("total");
  const [selection, setSelection] = useState<Selection>({});
  const [name, setName] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [styleReference, setStyleReference] = useState<string | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [styleReferenceLoading, setStyleReferenceLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ image?: string; prompt?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ----- abas ----- */
  const [view, setView] = useState<View>("create");
  const [viewer, setViewer] = useState<Preset | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  /* ----- dados vivos ----- */
  const [influencers, setInfluencers] = useState<Influencer[]>(initialInfluencers);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const families = useMemo(() => groupInfluencerVersions(influencers), [influencers]);
  const rootInfluencers = families.map((family) => family.root);
  const generationCost = creationMode === "prompt" ? INFLUENCER_PROMPT_COST : SHEET_COST;
  const detail = influencers.find((influencer) => influencer.id === detailId);
  const hasPending = influencers.some((i) => i.status === "processing" || i.status === "queued");
  const busy = submitting || referenceLoading || styleReferenceLoading;
  const steps = creationMode === "prompt" ? PROMPT_STEPS : WIZARD_STEPS;
  const lastStep = creationMode === "prompt" ? LAST_PROMPT_STEP : LAST_FORM_STEP;
  const summaryLines = useMemo(() => buildSummary(tier, selection), [tier, selection]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Older influencers may still point at an expiring provider link; one poll
  // lets the server copy it into storage (or recover it) before it breaks.
  useEffect(() => {
    if (influencers.some((item) => item.status === "completed" && item.imageUrl?.startsWith("https://") && !item.imageUrl.includes(".public.blob.vercel-storage.com"))) void refreshInfluencers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshInfluencers = useCallback(() => {
    if (refreshRef.current) return refreshRef.current;
    setRefreshing(true);
    const request = pollInfluencersAction().then((fresh) => {
      if (!mounted.current) return;
      setInfluencers(fresh.filter((item) => !deletedIds.current.has(item.id)));
      setRefreshError(null);
    }).catch(() => {
      if (mounted.current) setRefreshError("Não foi possível atualizar seus influencers. A geração continua; atualize para conferir.");
    }).finally(() => {
      refreshRef.current = null;
      if (mounted.current) setRefreshing(false);
    });
    refreshRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => { void refreshInfluencers(); }, 4000);
    return () => clearInterval(timer);
  }, [hasPending, refreshInfluencers]);

  /* ----- handlers ----- */

  const toggleOption = useCallback(
    (group: TraitGroup, optionId: string) => {
      setSelection((prev) => {
        const { id: groupId, max } = group;
        const current = prev[groupId] ?? [];
        if (current.includes(optionId)) {
          return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
        }
        const option = group.options.find((item) => item.id === optionId);
        const compatible = current.filter((id) => {
          if (option?.exclusive || group.options.find((item) => item.id === id)?.exclusive) return false;
          return !option?.slot || group.options.find((item) => item.id === id)?.slot !== option.slot;
        });
        const next = max === 1 ? [optionId] : [...compatible, optionId].slice(-max);
        return { ...prev, [groupId]: next };
      });
    },
    [],
  );

  const rollDice = useCallback(() => {
    setSelection(randomSelection(tier));
  }, [tier]);

  const changeTier = useCallback((next: CharacterTier) => {
    setTier(next);
    setSelection((prev) => pruneSelection(prev, next));
  }, []);

  const scrollToStep = useCallback(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = stepTop.current?.getBoundingClientRect().top ?? 0;
    if (top < 0 || top > 120) stepTop.current?.scrollIntoView({ behavior: reduced ? "instant" : "smooth", block: "start" });
  }, []);

  const goToStep = useCallback((index: number) => {
    setStep(Math.max(0, Math.min(index, lastStep)));
    setError(null);
    scrollToStep();
  }, [lastStep, scrollToStep]);

  /** Validação da etapa atual; erros ficam junto do campo. */
  const validateStep = useCallback((index: number): boolean => {
    if (creationMode !== "prompt") return true;
    const next: { image?: string; prompt?: string } = {};
    if (index === 0 && !reference) next.image = "Envie a imagem do personagem para continuar.";
    if (index === 1 && !prompt.trim()) next.prompt = "Descreva como quer seu influencer.";
    setFieldErrors(next);
    return !next.image && !next.prompt;
  }, [creationMode, reference, prompt]);

  const nextStep = useCallback(() => {
    if (!validateStep(step)) return;
    setCompleted((prev) => new Set(prev).add(step));
    goToStep(step + 1);
  }, [step, validateStep, goToStep]);

  const switchMode = useCallback((mode: "form" | "prompt") => {
    if (mode === creationMode) return;
    setCreationMode(mode);
    setStep(0);
    setCompleted(new Set());
    setFieldErrors({});
    setError(null);
  }, [creationMode]);

  const generateSheet = useCallback(async () => {
    if (submittingRef.current || referenceLoading || styleReferenceLoading) return;
    if (creationMode === "prompt" && !validateStep(1)) return;
    if (creationMode === "prompt" && !reference) { setFieldErrors({ image: "Envie a imagem do personagem." }); goToStep(0); return; }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    const input = {
      name: name.trim() || `Influencer ${rootInfluencers.length + 1}`,
      mode: creationMode,
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
      tier,
      selection,
      ...(reference ? { referenceUrl: reference } : {}),
      ...(creationMode === "form" && styleReference ? { styleReferenceUrl: styleReference } : {}),
    };
    const signature = JSON.stringify(input);
    if (requestRef.current?.signature !== signature) {
      requestRef.current = { signature, key: crypto.randomUUID() };
    }
    try {
      const result = await createInfluencerAction({ ...input, requestKey: requestRef.current.key });
      if (!mounted.current) return;
      if ("error" in result) {
        setError(result.error);
        if (result.retryable === true) requestRef.current = null;
        await refreshRef.current;
        await refreshInfluencers();
        router.refresh();
        return;
      }
      requestRef.current = null;
      setView("history");
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      await refreshRef.current;
      await refreshInfluencers();
      router.refresh();
    } catch {
      if (mounted.current) setError("A conexão foi interrompida. Tente novamente para conferir esta solicitação sem duplicá-la.");
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }, [name, tier, selection, creationMode, prompt, reference, styleReference, referenceLoading, styleReferenceLoading, rootInfluencers.length, refreshInfluencers, router, validateStep, goToStep]);

  const recreate = useCallback((preset: Preset) => {
    setCreationMode("form");
    setPrompt("");
    setTier(preset.tier as CharacterTier);
    setSelection(pruneSelection(preset.selection ?? {}, preset.tier as CharacterTier));
    setName(preset.name);
    setReference(null);
    setStyleReference(null);
    setError(null);
    setFieldErrors({});
    setViewer(null);
    setView("create");
    setCompleted(new Set([0, 1, 2]));
    setStep(LAST_FORM_STEP);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, []);

  const blocked = credits < generationCost ? `Você precisa de ${generationCost} ${generationCost === 1 ? "crédito" : "créditos"} para gerar (saldo: ${credits.toLocaleString("pt-BR")}).` : null;
  const currentStep = steps[step];

  /* ----- conteúdo de cada etapa ----- */

  function renderFormStep() {
    const definition = WIZARD_STEPS[step];
    if (!definition) return null;
    if (definition.id === "identity") {
      return (
        <>
          <StepHeading title={definition.label} description={definition.description} />
          <div className={styles.field}>
            <label htmlFor={`${studioId}-name`}>Nome do influencer <span className={styles.optionalLabel}>Opcional</span></label>
            <input id={`${studioId}-name`} className="input" placeholder="Ex.: Lola Turbo" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} />
            <span className={styles.fieldHint}>Sem nome, usamos “Influencer {rootInfluencers.length + 1}”. Dá para renomear depois.</span>
          </div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Foto de referência <span className={styles.optionalLabel}>Opcional</span></span>
            <span className={styles.fieldHint}>Com uma foto, o rosto serve de identidade e é adaptado ao tipo e aos traços escolhidos.</span>
            <ReferenceUpload label="Envie sua foto" previewLabel="Sua foto de referência" value={reference} onChange={setReference} onLoadingChange={setReferenceLoading} disabled={busy} />
          </div>
          <TypePicker value={tier} disabled={busy} onChange={changeTier} />
        </>
      );
    }
    const groups = stepGroupsFor(definition, tier);
    return (
      <>
        <StepHeading
          title={definition.label}
          description={definition.description}
          action={
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={rollDice} title="Sorteia todas as características do tipo atual">
              <Dices size={15} aria-hidden="true" /> Sortear visual
            </button>
          }
        />
        {groups.map((group) => (
          <TraitGroupField
            key={group.id}
            group={group}
            tier={tier}
            picked={selection[group.id] ?? []}
            disabled={busy}
            onToggle={(optionId) => toggleOption(group, optionId)}
            before={group.id === "aesthetic" ? (
              <div className={styles.styleUpload}>
                <ReferenceUpload label="Adicionar referência de estilo" previewLabel="Foto de referência de estilo" value={styleReference} onChange={setStyleReference} onLoadingChange={setStyleReferenceLoading} disabled={busy} />
              </div>
            ) : undefined}
          />
        ))}
        {definition.id === "style" ? (
          <>
            <div className={styles.field}>
              <label htmlFor={`${studioId}-prompt`}>Roupa e detalhes extras <span className={styles.optionalLabel}>Opcional</span></label>
              <textarea id={`${studioId}-prompt`} className={`input ${styles.promptInput}`} rows={3} maxLength={3000} value={prompt} disabled={busy} placeholder="Ex.: jaqueta vermelha aberta, camiseta branca e calça preta." onChange={(event) => setPrompt(event.target.value)} />
            </div>
            <ReviewBlock />
          </>
        ) : null}
      </>
    );
  }

  function renderPromptStep() {
    const definition = PROMPT_STEPS[step];
    if (!definition) return null;
    if (definition.id === "image") {
      return (
        <>
          <StepHeading title={definition.label} description={definition.description} />
          <div className={styles.field} data-invalid={Boolean(fieldErrors.image)}>
            <span className={styles.fieldLabel}>Imagem do personagem <span className={styles.requiredLabel}>Obrigatória</span></span>
            <span className={styles.fieldHint}>O rosto desta imagem é a identidade; a descrição na próxima etapa diz o resto.</span>
            <ReferenceUpload label="Adicionar imagem do personagem" required previewLabel="Imagem do personagem" value={reference} onChange={(value) => { setReference(value); if (value) setFieldErrors((prev) => ({ ...prev, image: undefined })); }} onLoadingChange={setReferenceLoading} disabled={busy} />
            {fieldErrors.image ? <p className={styles.fieldError} role="alert">{fieldErrors.image}</p> : null}
          </div>
          <div className={styles.field}>
            <label htmlFor={`${studioId}-name`}>Nome do influencer <span className={styles.optionalLabel}>Opcional</span></label>
            <input id={`${studioId}-name`} className="input" placeholder="Ex.: Lola Turbo" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} />
          </div>
        </>
      );
    }
    return (
      <>
        <StepHeading title={definition.label} description={definition.description} />
        <div className={styles.field} data-invalid={Boolean(fieldErrors.prompt)}>
          <label htmlFor={`${studioId}-prompt`}>Como será seu influencer? <span className={styles.requiredLabel}>Obrigatório</span></label>
          <textarea id={`${studioId}-prompt`} className={`input ${styles.promptInput}`} rows={5} maxLength={3000} value={prompt} disabled={busy} required aria-invalid={Boolean(fieldErrors.prompt)} aria-describedby={fieldErrors.prompt ? `${studioId}-prompt-error` : undefined} placeholder="Use o rosto da imagem. Corpo inteiro, camiseta preta, calça jeans e tênis branco…" onChange={(event) => { setPrompt(event.target.value); if (event.target.value.trim()) setFieldErrors((prev) => ({ ...prev, prompt: undefined })); }} />
          {fieldErrors.prompt ? <p id={`${studioId}-prompt-error`} className={styles.fieldError} role="alert">{fieldErrors.prompt}</p> : null}
        </div>
        <ReviewBlock />
      </>
    );
  }

  function ReviewBlock() {
    return (
      <section className={styles.review} aria-labelledby={`${studioId}-review`}>
        <h3 id={`${studioId}-review`}>Revisão</h3>
        <p className={styles.fieldHint}>Confira as escolhas. A geração custa ✦ {generationCost} {generationCost === 1 ? "crédito" : "créditos"} e só acontece ao clicar em “Gerar personagem”.</p>
        <div className={styles.reviewSummary}>
          <SummaryPanel name={name} tier={tier} reference={reference} styleReference={styleReference} prompt={prompt} mode={creationMode} lines={summaryLines} cost={generationCost} credits={credits} disabled={busy} onEdit={goToStep} />
        </div>
      </section>
    );
  }

  /* =========================================================== */

  return (
    <div className={styles.studio}>
      <div className={styles.topBar}>
        <div className={styles.viewTabs} role="tablist" aria-label="Área do estúdio">
          <button type="button" role="tab" className="chip" data-active={view === "create"} aria-selected={view === "create"} onClick={() => setView("create")}>
            <PenLine size={14} aria-hidden="true" /> Criar
          </button>
          <button type="button" role="tab" className="chip" data-active={view === "explore"} aria-selected={view === "explore"} onClick={() => setView("explore")}>
            <Compass size={14} aria-hidden="true" /> Explorar
          </button>
          <button type="button" role="tab" className="chip" data-active={view === "history"} aria-selected={view === "history"} onClick={() => setView("history")}>
            <Clock size={14} aria-hidden="true" /> Meus influencers{rootInfluencers.length ? <span className={styles.tabCount}>{rootInfluencers.length}</span> : null}
          </button>
        </div>
        <div className={styles.topActions}>
          {view === "history" ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)}>
              <Upload size={14} aria-hidden="true" /> Importar influencer
            </button>
          ) : null}
          <span className={styles.creditsPill}>✦ {credits.toLocaleString("pt-BR")} créditos</span>
        </div>
      </div>

      {refreshError ? <div className={styles.refreshNotice} role="status">
        <span>{refreshError}</span>
        <button type="button" className="btn btn-sm btn-ghost" disabled={refreshing} onClick={() => { void refreshInfluencers(); }}>
          <RotateCcw size={14} aria-hidden="true" />{refreshing ? "Atualizando…" : "Atualizar"}
        </button>
      </div> : null}

      {view === "create" ? (
        <div className={styles.wizard}>
          <div className={styles.wizardMain}>
            <div ref={stepTop} className={styles.wizardIntro}>
              <div>
                <span className={styles.kicker}>Crie seu próprio personagem</span>
                <h1 className={styles.title}>Influenciador de IA</h1>
              </div>
              <div className={styles.creationModes} role="group" aria-label="Como criar o influencer">
                <button type="button" aria-pressed={creationMode === "form"} disabled={busy} onClick={() => switchMode("form")}>Formulário</button>
                <button type="button" aria-pressed={creationMode === "prompt"} disabled={busy} onClick={() => switchMode("prompt")}>Imagem + prompt</button>
              </div>
            </div>

            <StepIndicator steps={steps} current={step} completed={completed} disabled={busy} onSelect={goToStep} />

            <div key={`${creationMode}-${step}`} className={styles.stepPanel}>
              {creationMode === "prompt" ? renderPromptStep() : renderFormStep()}
              {error ? <div className="auth-error" role="alert">{error}</div> : null}
            </div>

            <details className={styles.summaryMobile}>
              <summary>Ver resumo das escolhas</summary>
              <SummaryPanel name={name} tier={tier} reference={reference} styleReference={styleReference} prompt={prompt} mode={creationMode} lines={summaryLines} cost={generationCost} credits={credits} disabled={busy} onEdit={goToStep} />
            </details>

            <WizardNav canBack={step > 0} isLast={step === lastStep} disabled={busy} busy={submitting} cost={generationCost} blocked={step === lastStep ? blocked : null} onBack={() => goToStep(step - 1)} onNext={nextStep} onGenerate={generateSheet} />
          </div>

          <aside className={styles.wizardAside} aria-label="Resumo das escolhas">
            <SummaryPanel name={name} tier={tier} reference={reference} styleReference={styleReference} prompt={prompt} mode={creationMode} lines={summaryLines} cost={generationCost} credits={credits} disabled={busy} onEdit={goToStep} />
            <p className={styles.asideHint}>{currentStep ? `Etapa ${step + 1} de ${steps.length}: ${currentStep.label}.` : null} O resultado aparece em “Meus influencers” assim que ficar pronto.</p>
          </aside>
        </div>
      ) : null}

      {view === "explore" ? (
        <>
          <div className="studio-hero">
            <HeroReel videos={HERO_VIDEOS} className="videos" />
            <h2>
              Seu influencer,
              <br />
              seu hit viral
            </h2>
            <p>
              Monte seu influencer de IA com o rosto, corpo e estilo que você quiser.
              Explore os personagens e use um deles como ponto de partida.
            </p>
            <div className="chips">
              <span className={`chip ${styles.galleryLabel}`} data-active="true">
                <Sparkles size={13} />
                AI Influencers · {PRESETS.length}
              </span>
            </div>
          </div>

          <div className="masonry">
            {(PRESETS as Preset[]).map((preset) => (
              <figure key={preset.id} className={`preset-card ${styles.presetCard}`}>
                <button type="button" className={styles.presetOpen} onClick={() => setViewer(preset)} aria-label={`Ver ${preset.name}`} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preset.preview.thumb || preset.preview.url} alt={preset.name} loading="lazy" decoding="async" />
                <span className="tier-tag">{TIER_LABEL[preset.tier] ?? preset.tier}</span>
                <figcaption className="overlay">
                  <span className="name">{preset.name}</span>
                  <button type="button" className="recreate-btn" disabled={busy} onClick={() => recreate(preset)}>
                    Recriar
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : null}

      {view === "history" ? (
        rootInfluencers.length ? (
          <div className="history-grid">
            {rootInfluencers.map((inf) => (
              <InfluencerCard
                key={inf.id}
                influencer={inf}
                versionCount={(families.find((family) => family.id === influencerRootId(inf))?.versions.length ?? 1) - 1}
                onOpen={() => setDetailId(inf.id)}
                onDelete={async () => {
                  await deleteInfluencerAction(inf.id);
                  deletedIds.current.add(inf.id);
                  setInfluencers((prev) => prev.filter((i) => i.id !== inf.id));
                }}
                onRetry={async (requestKey) => {
                  const result = await retryInfluencerAction(inf.id, requestKey);
                  await refreshRef.current;
                  await refreshInfluencers();
                  router.refresh();
                  if ("error" in result) throw new Error(result.error);
                }}
                onUseMotion={() => router.push(`/app/criar-videos?influencer=${encodeURIComponent(inf.id)}`)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="big">Nenhum influencer ainda</div>
            <p>Monte o personagem em quatro etapas e gere o primeiro.</p>
            <button type="button" className="btn btn-accent" disabled={busy} onClick={() => { rollDice(); setView("create"); setStep(LAST_FORM_STEP); setCompleted(new Set([0, 1, 2])); }}>
              <Dices size={16} />
              Sortear um visual
            </button>
          </div>
        )
      ) : null}

      {importOpen ? <InfluencerImportDialog userId={userId} onClose={() => setImportOpen(false)} onImported={async (id) => {
        setImportOpen(false);
        await refreshInfluencers();
        router.refresh();
        setDetailId(id);
      }} /> : null}

      {detail ? <InfluencerDetails key={detail.id} influencer={detail} variants={families.find((family) => family.id === influencerRootId(detail))?.versions ?? [detail]} credits={credits} refreshError={refreshError} refreshing={refreshing} onRefresh={async () => {
        await refreshRef.current;
        await refreshInfluencers();
        router.refresh();
      }} onClose={() => setDetailId(null)} onRename={(id, nextName) => {
        setInfluencers((current) => current.map((item) => item.id === id ? { ...item, name: nextName } : item));
        router.refresh();
      }} /> : null}

      {viewer ? <PresetViewer preset={viewer} disabled={busy} onClose={() => setViewer(null)} onRecreate={() => recreate(viewer)} /> : null}
    </div>
  );
}

/* ---------------- subcomponentes ---------------- */

function PresetViewer({ preset, disabled, onClose, onRecreate }: {
  preset: Preset;
  disabled: boolean;
  onClose: () => void;
  onRecreate: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  function close() { dialog.current?.close(); onClose(); }
  return <dialog ref={dialog} className={`modal ${styles.presetDialog}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
    <button type="button" className="modal-close" aria-label="Fechar visualização" onClick={close}><X size={16} /></button>
    <h2 id={titleId}>{preset.name}</h2>
    <p className="modal-sub">Tipo: {TIER_LABEL[preset.tier] ?? preset.tier}</p>
    <div className={styles.presetPreview}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preset.sheet.url || preset.preview.url} alt={preset.name} />
      <button type="button" className="btn btn-accent" disabled={disabled} onClick={() => { dialog.current?.close(); onRecreate(); }}><Sparkles size={16} />Recriar este influencer</button>
    </div>
  </dialog>;
}

function InfluencerCard({
  influencer,
  versionCount,
  onOpen,
  onDelete,
  onRetry,
  onUseMotion,
}: {
  influencer: Influencer;
  versionCount: number;
  onOpen: () => void;
  onDelete: () => Promise<void>;
  onRetry: (requestKey: string) => Promise<void>;
  onUseMotion: () => void;
}) {
  const [action, setAction] = useState<"delete" | "retry" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionRef = useRef(false);
  const retryKey = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function runAction(kind: "delete" | "retry") {
    if (actionRef.current) return;
    actionRef.current = true;
    setAction(kind);
    setError(null);
    try {
      if (kind === "delete") await onDelete();
      else {
        retryKey.current ??= crypto.randomUUID();
        await onRetry(retryKey.current);
        // Keep the key: refreshing an old failed card must not create another job.
      }
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "Não foi possível concluir. Tente novamente.");
    } finally {
      actionRef.current = false;
      if (mounted.current) setAction(null);
    }
  }

  const date = displayDate(influencer.createdAt, "short");

  return (
    <div className={`gen-card ${detailStyles.card}`}>
      <button type="button" className={detailStyles.cardOpen} onClick={onOpen} aria-label={`Ver detalhes de ${influencer.name}`} />
      <div className="media">
        {influencer.status === "completed" && influencer.imageUrl ? (
          <InfluencerImage key={influencer.imageUrl} src={influencer.imageUrl} alt={influencer.name} />
        ) : influencer.status === "failed" ? (
          <div className="pending">
            <span style={{ color: "var(--danger)", fontSize: 13, padding: "0 14px", textAlign: "center" }}>
              {influencer.error ?? "A geração falhou"}
            </span>
            {!influencer.submissionUncertain ? <button type="button" className={`btn btn-sm btn-ghost ${detailStyles.cardAction}`} disabled={action !== null} onClick={() => { void runAction("retry"); }}>
              <RotateCcw size={14} />
              {action === "retry" ? "Enviando…" : `Gerar novamente · ✦ ${influencer.creditCost ?? (influencer.creationMode === "edit" ? INFLUENCER_EDIT_COST : influencer.creationMode === "prompt" ? INFLUENCER_PROMPT_COST : SHEET_COST)}`}
            </button> : null}
          </div>
        ) : (
          <div className="pending skeleton">
            <span className="spinner" />
            <span className="hint">Gerando o personagem…</span>
          </div>
        )}
        <span className="status-tag" data-status={influencer.status}>
          {influencer.status === "completed"
            ? TIER_LABEL[influencer.tier] ?? influencer.tier
            : influencer.status === "failed"
              ? "Falhou"
              : "Gerando"}
        </span>
        <div className={`actions ${detailStyles.cardAction}`}>
          {influencer.status === "completed" && influencer.imageUrl ? (
            <>
              <a href={influencer.imageUrl} target="_blank" rel="noreferrer" title="Baixar imagem" aria-label={`Baixar imagem de ${influencer.name}`}>
                <Download size={14} />
              </a>
              <button type="button" title="Usar em um vídeo" aria-label={`Usar ${influencer.name} em um vídeo`} disabled={action !== null} onClick={onUseMotion}>
                <Sparkles size={14} />
              </button>
            </>
          ) : null}
          <button type="button" title={influencer.submissionUncertain || influencer.status === "queued" || influencer.status === "processing" ? "Aguarde a confirmação desta geração para excluir" : "Excluir"} aria-label={`Excluir ${influencer.name}`} disabled={action !== null || influencer.submissionUncertain || influencer.status === "queued" || influencer.status === "processing"} onClick={() => { void runAction("delete"); }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="body">
        <b>{influencer.name}</b>
        <span>{versionCount ? `${versionCount + 1} versões` : date}</span>
      </div>
      {error ? <p className={styles.cardError} role="alert">{error}</p> : null}
    </div>
  );
}
