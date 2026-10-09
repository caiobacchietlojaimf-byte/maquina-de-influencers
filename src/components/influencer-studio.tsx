"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BicepsFlexed,
  Blend,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Compass,
  Dices,
  Download,
  Drama,
  Eye,
  Gem,
  Glasses,
  Globe,
  MoveVertical,
  Palette,
  Proportions,
  RotateCcw,
  Ruler,
  ScanEye,
  Scissors,
  Shirt,
  Skull,
  Smile,
  SmilePlus,
  Sparkles,
  Trash2,
  VenusAndMars,
  X,
  type LucideIcon,
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
import { groupsFor, optionsFor, pruneSelection, randomSelection, type Selection, type TraitGroup } from "@/data/traits";
import type { Influencer } from "@/lib/db";
import { groupInfluencerVersions, influencerRootId } from "@/lib/influencer-versions";
import { InfluencerDetails } from "./influencer-details";
import { ReferenceUpload } from "./influencer-reference-upload";
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

type RightTab = "explore" | "history";

const TIER_LABEL: Record<string, string> = Object.fromEntries(
  CHARACTER_TYPES.map((t) => [t.id, t.label]),
);

/** Ícone de cada grupo de traços (mesma linguagem visual do Higgsfield). */
const GROUP_ICONS: Record<string, LucideIcon> = {
  gender: VenusAndMars,
  body_type: BicepsFlexed,
  hair: Scissors,
  hair_colour: Palette,
  aesthetic: Shirt,
  ethnicity_origin_base: Globe,
  age: CalendarDays,
  skin_tone: Blend,
  height: Ruler,
  proportions: Proportions,
  freak_head: Skull,
  freak_neck: MoveVertical,
  eye_shape: Eye,
  eye_color: ScanEye,
  freak_face: SmilePlus,
  facial_hair: Smile,
  distinctive: Gem,
  accessory: Glasses,
};

export function InfluencerStudio({
  initialInfluencers,
  credits,
}: {
  initialInfluencers: Influencer[];
  credits: number;
}) {
  const router = useRouter();
  const studioId = useId();
  const mounted = useRef(true);
  const submittingRef = useRef(false);
  const requestRef = useRef<{ signature: string; key: string } | null>(null);
  const refreshRef = useRef<Promise<void> | null>(null);
  const deletedIds = useRef(new Set<string>());

  /* ----- builder ----- */
  const [creationMode, setCreationMode] = useState<"form" | "prompt">("form");
  const [prompt, setPrompt] = useState("");
  const [tier, setTier] = useState<CharacterTier>("total");
  const [selection, setSelection] = useState<Selection>({});
  const [name, setName] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [styleReference, setStyleReference] = useState<string | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [styleReferenceLoading, setStyleReferenceLoading] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ gender: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ----- lado direito ----- */
  const [rightTab, setRightTab] = useState<RightTab>("explore");
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

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
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
    setOpenGroups((prev) => ({ ...prev, gender: true }));
  }, [tier]);

  const changeTier = useCallback((next: CharacterTier) => {
    setTier(next);
    setSelection((prev) => pruneSelection(prev, next));
  }, []);

  const generateSheet = useCallback(async () => {
    if (submittingRef.current || referenceLoading || styleReferenceLoading) return;
    if (creationMode === "prompt" && (!reference || !prompt.trim())) {
      setError("Adicione a imagem e descreva como quer seu influencer.");
      return;
    }
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
      setRightTab("history");
      await refreshRef.current;
      await refreshInfluencers();
      router.refresh();
    } catch {
      if (mounted.current) setError("A conexão foi interrompida. Tente novamente para conferir esta solicitação sem duplicá-la.");
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }, [name, tier, selection, creationMode, prompt, reference, styleReference, referenceLoading, styleReferenceLoading, rootInfluencers.length, refreshInfluencers, router]);

  const recreate = useCallback((preset: Preset) => {
    setCreationMode("form");
    setPrompt("");
    setTier(preset.tier as CharacterTier);
    setSelection(pruneSelection(preset.selection ?? {}, preset.tier as CharacterTier));
    setName(preset.name);
    setReference(null);
    setStyleReference(null);
    setError(null);
    setViewer(null);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, []);

  const groups = useMemo(() => groupsFor(tier), [tier]);
  /* =========================================================== */

  return (
    <div className={`studio ${styles.studio}`}>
      {/* ------------------- construtor (esquerda) ------------------- */}
      <aside className="builder">
        <div className="builder-head">
          <div className="kicker">Crie seu próprio personagem com</div>
          <h2>Influenciador de IA</h2>
        </div>
        <div className={styles.creationModes} role="group" aria-label="Como criar o influencer">
          <button type="button" aria-pressed={creationMode === "form"} disabled={busy} onClick={() => { setCreationMode("form"); setError(null); }}>Formulário</button>
          <button type="button" aria-pressed={creationMode === "prompt"} disabled={busy} onClick={() => { setCreationMode("prompt"); setError(null); }}>Imagem + prompt</button>
        </div>
        <div className="builder-scroll">
          <ReferenceUpload
            label={creationMode === "prompt" ? "Adicionar imagem do personagem" : "Envie sua foto"}
            required={creationMode === "prompt"}
            previewLabel="Sua foto de referência"
            value={reference}
            onChange={setReference}
            onLoadingChange={setReferenceLoading}
            disabled={busy}
          />

          <div className="field">
            <label htmlFor={`${studioId}-name`}>Nome do influencer</label>
            <input
              id={`${studioId}-name`}
              className="input"
              placeholder="Ex.: Lola Turbo"
              value={name}
              maxLength={80}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor={`${studioId}-prompt`}>{creationMode === "prompt" ? "Como será seu influencer?" : "Roupa e detalhes extras"}{creationMode === "form" ? <span className={styles.optionalLabel}>Opcional</span> : null}</label>
            <textarea id={`${studioId}-prompt`} className={`input ${styles.promptInput}`} rows={4} maxLength={3000} value={prompt} disabled={busy} required={creationMode === "prompt"} placeholder={creationMode === "prompt" ? "Use o rosto da imagem. Corpo inteiro, camiseta preta, calça jeans e tênis branco…" : "Ex.: jaqueta vermelha aberta, camiseta branca e calça preta."} onChange={(event) => setPrompt(event.target.value)} />
          </div>

          {creationMode === "form" ? <>
          <section className="trait-section" data-open="true">
            <div className="trait-head" style={{ cursor: "default" }}>
              <Drama size={15} style={{ color: "var(--tx3)" }} />
              <span>Tipo de personagem</span>
              <span className="count">⋅ {CHARACTER_TYPES.length}</span>
            </div>
            <div className={styles.optionGrid} role="group" aria-label="Tipo de personagem">
              {CHARACTER_TYPES.map((type) => (
                <button
                  type="button"
                  key={type.id}
                  className={styles.optionCard}
                  data-kind="media"
                  data-active={tier === type.id}
                  aria-pressed={tier === type.id}
                  disabled={busy}
                  onClick={() => changeTier(type.id)}
                >
                  <span className={styles.optionVisual}>
                    <Image src={type.icon} alt="" width={96} height={96} unoptimized />
                    {tier === type.id ? <Check className={styles.selectedMark} size={16} aria-hidden="true" /> : null}
                  </span>
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
          </section>

          {groups.map((group) => {
            const opts = optionsFor(group, tier);
            const picked = selection[group.id] ?? [];
            const open = openGroups[group.id] ?? false;
            const pickedLabels = picked
              .map((id) => opts.find((opt) => opt.id === id)?.label)
              .filter(Boolean)
              .join(", ");
            const GroupIcon = GROUP_ICONS[group.id];
            return (
              <section key={group.id} className="trait-section" data-open={open}>
                <button
                  type="button"
                  className="trait-head"
                  disabled={referenceLoading || styleReferenceLoading}
                  aria-expanded={open}
                  aria-controls={`${studioId}-${group.id}`}
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !open }))}
                >
                  {GroupIcon ? <GroupIcon size={15} style={{ color: "var(--tx3)", flexShrink: 0 }} /> : null}
                  <span>{group.label}</span>
                  <span className="count">⋅ {opts.length}</span>
                  {pickedLabels ? <span className="picked">{pickedLabels}</span> : null}
                  <ChevronDown className="chev" size={16} />
                </button>
                <div id={`${studioId}-${group.id}`} hidden={!open}>
                  {open ? <>
                  {group.max > 1 ? <p className={styles.choiceHint}>Escolha até {group.max}</p> : null}
                  {group.id === "aesthetic" ? <div className={styles.styleUpload}>
                    <ReferenceUpload
                      label="Adicionar referência de estilo"
                      previewLabel="Foto de referência de estilo"
                      value={styleReference}
                      onChange={setStyleReference}
                      onLoadingChange={setStyleReferenceLoading}
                      disabled={busy}
                    />
                  </div> : null}
                  <div className={styles.optionGrid} role="group" aria-label={group.label}>
                    {opts.map((opt) => (
                      <button
                        type="button"
                        key={opt.id}
                        className={styles.optionCard}
                        data-kind={opt.image ? "media" : opt.swatch ? "color" : "text"}
                        data-active={picked.includes(opt.id)}
                        aria-pressed={picked.includes(opt.id)}
                        disabled={busy}
                        onClick={() => toggleOption(group, opt.id)}
                      >
                        {opt.image || opt.swatch ? <span className={styles.optionVisual}>
                          {opt.image ? <Image src={opt.image} alt="" width={96} height={96} style={{ objectFit: opt.imageFit ?? "cover" }} unoptimized /> : <span className={styles.swatch} style={{ backgroundColor: opt.swatch }} />}
                          {picked.includes(opt.id) ? <Check className={styles.selectedMark} size={16} aria-hidden="true" /> : null}
                        </span> : null}
                        <span>{opt.label}</span>
                        {!opt.image && !opt.swatch && picked.includes(opt.id) ? <Check size={14} aria-hidden="true" /> : null}
                      </button>
                    ))}
                  </div>
                  </> : null}
                </div>
              </section>
            );
          })}
          </> : null}
        </div>

        <div className="builder-footer">
          {creationMode === "form" ? <button type="button" className="dice-btn" title="Sortear visual" aria-label="Sortear visual" disabled={busy} onClick={rollDice}>
            <Dices size={20} />
          </button> : null}
          <button type="button" className="generate-btn" disabled={busy || credits < generationCost || (creationMode === "prompt" && (!reference || !prompt.trim()))} onClick={generateSheet}>
            {submitting ? <><span className="spinner" aria-hidden="true" /> Enviando…</> : <>Gerar <span className="cost">✦ {generationCost}</span></>}
          </button>
        </div>
        {credits < generationCost ? <p className={styles.builderNotice}>Você precisa de {generationCost} créditos para gerar.</p> : null}
        {error ? (
          <div className="auth-error" role="alert" style={{ margin: "0 14px 14px" }}>
            {error}
          </div>
        ) : null}
      </aside>

      {/* ------------------- explorar / histórico (direita) ------------------- */}
      <section>
        <div className="explore-bar">
          <button type="button" className="chip" data-active={rightTab === "explore"} aria-pressed={rightTab === "explore"} onClick={() => setRightTab("explore")}>
            <Compass size={14} />
            Explorar
          </button>
          <button type="button" className="chip" data-active={rightTab === "history"} aria-pressed={rightTab === "history"} onClick={() => setRightTab("history")}>
            <Clock size={14} />
            Meus Influencers
          </button>
          <span style={{ marginLeft: "auto", color: "var(--tx3)", fontSize: 12.5 }}>
            ✦ {credits.toLocaleString("pt-BR")} créditos
          </span>
        </div>
        {refreshError ? <div className={styles.refreshNotice} role="status">
          <span>{refreshError}</span>
          <button type="button" className="btn btn-sm btn-ghost" disabled={refreshing} onClick={() => { void refreshInfluencers(); }}>
            <RotateCcw size={14} aria-hidden="true" />{refreshing ? "Atualizando…" : "Atualizar"}
          </button>
        </div> : null}

        {rightTab === "explore" ? (
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
                  AI Influencers
                </span>
              </div>
            </div>

              <div className="masonry">
                {(PRESETS as Preset[]).map((preset) => (
                  <figure key={preset.id} className={`preset-card ${styles.presetCard}`}>
                    <button type="button" className={styles.presetOpen} onClick={() => setViewer(preset)} aria-label={`Ver ${preset.name}`} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preset.preview.thumb || preset.preview.url} alt={preset.name} loading="lazy" />
                    <span className="tier-tag">{TIER_LABEL[preset.tier] ?? preset.tier}</span>
                    <figcaption className="overlay">
                      <span className="name">{preset.name}</span>
                      <button
                        type="button"
                        className="recreate-btn"
                        disabled={busy}
                        onClick={() => recreate(preset)}
                      >
                        Recriar
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
          </>
        ) : null}

        {rightTab === "history" ? (
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
              <p>Monte o personagem na coluna da esquerda e aperte Gerar.</p>
              <button type="button" className="btn btn-accent" disabled={busy} onClick={rollDice}>
                <Dices size={16} />
                Sortear um visual
              </button>
            </div>
          )
        ) : null}
      </section>

      {detail ? <InfluencerDetails key={detail.id} influencer={detail} variants={families.find((family) => family.id === influencerRootId(detail))?.versions ?? [detail]} credits={credits} refreshError={refreshError} refreshing={refreshing} onRefresh={async () => {
        await refreshRef.current;
        await refreshInfluencers();
        router.refresh();
      }} onClose={() => setDetailId(null)} onRename={(id, nextName) => {
        setInfluencers((current) => current.map((item) => item.id === id ? { ...item, name: nextName } : item));
        router.refresh();
      }} /> : null}

      {/* ------------------- visualizador de preset ------------------- */}
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
          // eslint-disable-next-line @next/next/no-img-element
          <img src={influencer.imageUrl} alt={influencer.name} loading="lazy" />
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
