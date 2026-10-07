"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BicepsFlexed,
  Blend,
  CalendarDays,
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
  ImagePlus,
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
import { createMotionVideoAction } from "@/app/actions/videos";
import { SHEET_COST, VIDEO_COST } from "@/lib/costs";
import { CHARACTER_TYPES, type CharacterTier } from "@/data/character-types";
import { HERO_VIDEOS } from "@/data/hero";
import { HeroReel } from "./hero-reel";
import PRESETS from "@/data/influencer-presets.json";
import { MOTION_PRESETS, type MotionKind } from "@/data/motion-presets";
import { groupsFor, optionsFor, pruneSelection, randomSelection, type Selection } from "@/data/traits";
import { VIDEO_PRESETS } from "@/data/video-presets";
import type { Influencer } from "@/lib/db";
import { RenderProbe } from "./render-probe";

type Preset = {
  id: string;
  name: string;
  tier: string;
  preview: { url: string; thumb?: string; width?: number; height?: number };
  sheet: { url?: string; thumb?: string };
  selection: Record<string, string[]>;
};

type BuilderTab = "create" | "motion";
type RightTab = "explore" | "history";
type ExploreScope = "influencers" | "presets" | "trends";

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
  initialTab,
  credits,
}: {
  initialInfluencers: Influencer[];
  initialTab: BuilderTab;
  credits: number;
}) {
  const router = useRouter();

  /* ----- builder ----- */
  const [builderTab, setBuilderTab] = useState<BuilderTab>(initialTab);
  const [tier, setTier] = useState<CharacterTier>("total");
  const [selection, setSelection] = useState<Selection>({});
  const [name, setName] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ gender: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ----- movimento ----- */
  const [motionKind, setMotionKind] = useState<MotionKind>("motion_transfer");
  const [motionPresetId, setMotionPresetId] = useState<string | null>(null);
  const [motionInfluencerId, setMotionInfluencerId] = useState<string | null>(null);
  const [motionPrompt, setMotionPrompt] = useState("");

  /* ----- lado direito ----- */
  const [rightTab, setRightTab] = useState<RightTab>("explore");
  const [scope, setScope] = useState<ExploreScope>("influencers");
  const [viewer, setViewer] = useState<Preset | null>(null);

  /* ----- dados vivos ----- */
  const [influencers, setInfluencers] = useState<Influencer[]>(initialInfluencers);
  const hasPending = influencers.some((i) => i.status === "processing" || i.status === "queued");

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => {
      pollInfluencersAction()
        .then(setInfluencers)
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [hasPending]);

  const ready = useMemo(() => influencers.filter((i) => i.status === "completed" && i.imageUrl), [influencers]);

  /* ----- handlers ----- */

  const toggleOption = useCallback(
    (groupId: string, optionId: string, max: number) => {
      setSelection((prev) => {
        const current = prev[groupId] ?? [];
        if (current.includes(optionId)) {
          return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
        }
        const next = max === 1 ? [optionId] : [...current, optionId].slice(-max);
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

  const pickReference = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 512 / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setReference(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }, []);

  const generateSheet = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    const result = await createInfluencerAction({
      name: name.trim() || `Influencer ${influencers.length + 1}`,
      tier,
      selection,
      ...(reference ? { referenceUrl: reference } : {}),
    }).catch((caught: unknown) => ({ error: caught instanceof Error ? caught.message : String(caught) }));
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setRightTab("history");
    const fresh = await pollInfluencersAction().catch(() => null);
    if (fresh) setInfluencers(fresh);
    router.refresh();
  }, [name, tier, selection, reference, influencers.length, router]);

  const generateMotion = useCallback(async () => {
    if (!motionInfluencerId || !motionPresetId) {
      setError("Escolha um influencer pronto e um preset de movimento");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createMotionVideoAction({
      influencerId: motionInfluencerId,
      presetId: motionPresetId,
      ...(motionPrompt.trim() ? { prompt: motionPrompt.trim() } : {}),
    }).catch((caught: unknown) => ({ error: caught instanceof Error ? caught.message : String(caught) }));
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push("/app/videos");
  }, [motionInfluencerId, motionPresetId, motionPrompt, router]);

  const recreate = useCallback((preset: Preset) => {
    setBuilderTab("create");
    setTier(preset.tier as CharacterTier);
    setSelection(pruneSelection(preset.selection ?? {}, preset.tier as CharacterTier));
    setName(preset.name);
    setViewer(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const groups = useMemo(() => groupsFor(tier), [tier]);
  const motionList = useMemo(
    () => MOTION_PRESETS.filter((p) => p.kind === motionKind),
    [motionKind],
  );

  /* =========================================================== */

  return (
    <div className="studio">
      <RenderProbe />
      {/* ------------------- construtor (esquerda) ------------------- */}
      <aside className="builder">
        <div className="builder-head">
          <div className="kicker">Crie seu próprio personagem com</div>
          <h2>Influenciador de IA</h2>
        </div>
        <div className="builder-tabs">
          <button type="button" data-active={builderTab === "create"} onClick={() => setBuilderTab("create")}>
            Criar Influencer
          </button>
          <button
            type="button"
            data-active={builderTab === "motion"}
            onClick={() => {
              setBuilderTab("motion");
              setRightTab("explore");
            }}
          >
            Movimento
          </button>
        </div>

        {builderTab === "create" ? (
          <>
            <div className="builder-scroll">
              <label className="upload-box">
                <span className="optional">Opcional</span>
                {reference ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={reference} alt="Sua foto de referência" />
                ) : (
                  <>
                    <ImagePlus size={20} />
                    <b style={{ color: "var(--tx)" }}>Envie sua foto</b>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) pickReference(file);
                  }}
                />
              </label>
              {reference ? (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setReference(null)}>
                  Remover foto
                </button>
              ) : null}

              <div className="field">
                <label htmlFor="inf-name">Nome do influencer</label>
                <input
                  id="inf-name"
                  className="input"
                  placeholder="Ex.: Lola Turbo"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <section className="trait-section" data-open="true">
                <div className="trait-head" style={{ cursor: "default" }}>
                  <Drama size={15} style={{ color: "var(--tx3)" }} />
                  <span>Tipo de personagem</span>
                  <span className="count">⋅ {CHARACTER_TYPES.length}</span>
                </div>
                <div className="type-grid">
                  {CHARACTER_TYPES.map((type) => (
                    <button
                      type="button"
                      key={type.id}
                      className="type-card"
                      data-active={tier === type.id}
                      onClick={() => changeTier(type.id)}
                    >
                      <Image src={type.icon} alt={type.label} width={56} height={56} unoptimized />
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
                      onClick={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !open }))}
                    >
                      {GroupIcon ? <GroupIcon size={15} style={{ color: "var(--tx3)", flexShrink: 0 }} /> : null}
                      <span>{group.label}</span>
                      <span className="count">⋅ {opts.length}</span>
                      {pickedLabels ? <span className="picked">{pickedLabels}</span> : null}
                      <ChevronDown className="chev" size={16} />
                    </button>
                    {open ? (
                      <div className="trait-body">
                        {opts.map((opt) => (
                          <button
                            type="button"
                            key={opt.id}
                            className="trait-opt"
                            data-active={picked.includes(opt.id)}
                            onClick={() => toggleOption(group.id, opt.id, group.max)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>

            <div className="builder-footer">
              <button type="button" className="dice-btn" title="Sortear visual" onClick={rollDice}>
                <Dices size={20} />
              </button>
              <button type="button" className="generate-btn" disabled={submitting} onClick={generateSheet}>
                {submitting ? <span className="spinner" /> : <>Gerar <span className="cost">✦ {SHEET_COST}</span></>}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="builder-scroll">
              <div className="genjutsu-banner">
                <h3>Higgsfield Genjutsu</h3>
                <p>Manipulação de realidade</p>
              </div>

              <div className="mode-tabs">
                <button
                  type="button"
                  data-active={motionKind === "motion_transfer"}
                  onClick={() => {
                    setMotionKind("motion_transfer");
                    setMotionPresetId(null);
                  }}
                >
                  Transferir movimento
                </button>
                <button
                  type="button"
                  data-active={motionKind === "object_swap"}
                  onClick={() => {
                    setMotionKind("object_swap");
                    setMotionPresetId(null);
                  }}
                >
                  Trocar objetos
                </button>
              </div>

              <div className="field">
                <label>Seu influencer</label>
                {ready.length ? (
                  <div className="influencer-pick">
                    {ready.map((inf) => (
                      <button
                        type="button"
                        key={inf.id}
                        className="pick"
                        data-active={motionInfluencerId === inf.id}
                        onClick={() => setMotionInfluencerId(inf.id)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={inf.imageUrl} alt={inf.name} />
                        <span>{inf.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--tx3)", fontSize: 12.5 }}>
                    Gere um influencer primeiro na aba Criar Influencer.
                  </p>
                )}
              </div>

              <div className="field">
                <label>Movimento selecionado</label>
                <p style={{ color: motionPresetId ? "var(--accent)" : "var(--tx3)", fontSize: 12.5 }}>
                  {motionPresetId
                    ? MOTION_PRESETS.find((p) => p.id === motionPresetId)?.name
                    : "Escolha um preset na galeria ao lado →"}
                </p>
              </div>

              <div className="field">
                <label htmlFor="motion-prompt">Prompt (opcional)</label>
                <textarea
                  id="motion-prompt"
                  className="input"
                  placeholder="Descreva a nova cena — ex.: 'mesmos movimentos, novo cenário: Tóquio à noite'"
                  value={motionPrompt}
                  onChange={(event) => setMotionPrompt(event.target.value)}
                />
              </div>
            </div>

            <div className="builder-footer" style={{ gridTemplateColumns: "1fr" }}>
              <button
                type="button"
                className="generate-btn"
                disabled={submitting || !motionInfluencerId || !motionPresetId}
                onClick={generateMotion}
              >
                {submitting ? <span className="spinner" /> : <>Gerar <span className="cost">✦ {VIDEO_COST}</span></>}
              </button>
            </div>
          </>
        )}
        {error ? (
          <div className="auth-error" style={{ margin: "0 14px 14px" }}>
            {error}
          </div>
        ) : null}
      </aside>

      {/* ------------------- explorar / histórico (direita) ------------------- */}
      <section>
        <div className="explore-bar">
          <button type="button" className="chip" data-active={rightTab === "explore"} onClick={() => setRightTab("explore")}>
            <Compass size={14} />
            Explorar
          </button>
          <button type="button" className="chip" data-active={rightTab === "history"} onClick={() => setRightTab("history")}>
            <Clock size={14} />
            Histórico
          </button>
          <span style={{ marginLeft: "auto", color: "var(--tx3)", fontSize: 12.5 }}>
            ✦ {credits.toLocaleString("pt-BR")} créditos
          </span>
        </div>

        {rightTab === "explore" && builderTab === "create" ? (
          <>
            <div className="studio-hero">
              <HeroReel videos={HERO_VIDEOS} className="videos" />
              <h2>
                Seu influencer,
                <br />
                seu hit viral
              </h2>
              <p>
                Monte seu influencer de IA com o rosto, corpo e estilo que você quiser. Escolha um
                movimento e veja ele performar em um vídeo pronto para compartilhar.
              </p>
              <div className="chips">
                <button type="button" className="chip" data-active={scope === "influencers"} onClick={() => setScope("influencers")}>
                  <Sparkles size={13} />
                  AI Influencers
                </button>
                <button type="button" className="chip" data-active={scope === "presets"} onClick={() => setScope("presets")}>
                  Higgsfield Presets
                </button>
                <button type="button" className="chip" data-active={scope === "trends"} onClick={() => setScope("trends")}>
                  Tendências
                </button>
              </div>
            </div>

            {scope === "influencers" ? (
              <div className="masonry">
                {(PRESETS as Preset[]).map((preset) => (
                  <figure key={preset.id} className="preset-card" onClick={() => setViewer(preset)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preset.preview.thumb || preset.preview.url} alt={preset.name} loading="lazy" />
                    <span className="tier-tag">{TIER_LABEL[preset.tier] ?? preset.tier}</span>
                    <figcaption className="overlay">
                      <span className="name">{preset.name}</span>
                      <button
                        type="button"
                        className="recreate-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          recreate(preset);
                        }}
                      >
                        Recriar
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}

            {scope === "presets" ? (
              <div className="masonry" style={{ columns: "3 280px" }}>
                {VIDEO_PRESETS.map((preset) => (
                  <figure
                    key={preset.id}
                    className="video-card"
                    onMouseEnter={(e) => e.currentTarget.querySelector("video")?.play().catch(() => undefined)}
                    onMouseLeave={(e) => e.currentTarget.querySelector("video")?.pause()}
                  >
                    <video src={preset.video} poster={preset.poster} muted loop playsInline preload="none" />
                    <div className="meta">
                      <div className="faces">
                        {preset.faces.map((face) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={face} src={face} alt="" loading="lazy" />
                        ))}
                      </div>
                      <span className="name">{preset.name}</span>
                    </div>
                  </figure>
                ))}
              </div>
            ) : null}

            {scope === "trends" ? (
              <div className="motion-grid" style={{ marginTop: 18, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                {MOTION_PRESETS.filter((p) => p.category === "trending").map((preset) => (
                  <MotionCard
                    key={preset.id}
                    name={preset.name}
                    thumbnail={preset.thumbnail}
                    preview={preset.preview}
                    active={motionPresetId === preset.id}
                    onPick={() => {
                      setBuilderTab("motion");
                      setMotionKind(preset.kind);
                      setMotionPresetId(preset.id);
                    }}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {rightTab === "explore" && builderTab === "motion" ? (
          <div>
            <p style={{ color: "var(--tx2)", fontSize: 13.5, marginBottom: 14 }}>
              Escolha o movimento que seu influencer vai performar. O vídeo final mantém câmera,
              ritmo e energia do vídeo de referência.
            </p>
            <div className="motion-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
              {motionList.map((preset) => (
                <MotionCard
                  key={preset.id}
                  name={preset.name}
                  thumbnail={preset.thumbnail}
                  preview={preset.preview}
                  active={motionPresetId === preset.id}
                  onPick={() => setMotionPresetId(preset.id)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {rightTab === "history" ? (
          influencers.length ? (
            <div className="history-grid">
              {influencers.map((inf) => (
                <InfluencerCard
                  key={inf.id}
                  influencer={inf}
                  onDelete={async () => {
                    await deleteInfluencerAction(inf.id);
                    setInfluencers((prev) => prev.filter((i) => i.id !== inf.id));
                  }}
                  onRetry={async () => {
                    await retryInfluencerAction(inf.id);
                    const fresh = await pollInfluencersAction().catch(() => null);
                    if (fresh) setInfluencers(fresh);
                  }}
                  onUseMotion={() => {
                    setBuilderTab("motion");
                    setMotionInfluencerId(inf.id);
                    setRightTab("explore");
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="big">Nenhum influencer ainda</div>
              <p>Monte o personagem na coluna da esquerda e aperte Gerar.</p>
              <button type="button" className="btn btn-accent" onClick={rollDice}>
                <Dices size={16} />
                Sortear um visual
              </button>
            </div>
          )
        ) : null}
      </section>

      {/* ------------------- visualizador de preset ------------------- */}
      {viewer ? (
        <div className="modal-backdrop" onClick={() => setViewer(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setViewer(null)}>
              <X size={16} />
            </button>
            <h2>{viewer.name}</h2>
            <p className="modal-sub">Tipo: {TIER_LABEL[viewer.tier] ?? viewer.tier}</p>
            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewer.sheet.url || viewer.preview.url}
                alt={viewer.name}
                style={{ borderRadius: 14, border: "1px solid var(--line)" }}
              />
              <button type="button" className="btn btn-accent" onClick={() => recreate(viewer)}>
                <Sparkles size={16} />
                Recriar este influencer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- subcomponentes ---------------- */

function MotionCard({
  name,
  thumbnail,
  preview,
  active,
  onPick,
}: {
  name: string;
  thumbnail: string;
  preview: string;
  active: boolean;
  onPick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (hover) videoRef.current?.play().catch(() => undefined);
    else videoRef.current?.pause();
  }, [hover]);

  return (
    <button
      type="button"
      className="motion-card"
      data-active={active}
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {hover ? (
        <video ref={videoRef} src={preview} poster={thumbnail} muted loop playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt={name} loading="lazy" />
      )}
      <span className="label">{name}</span>
    </button>
  );
}

function InfluencerCard({
  influencer,
  onDelete,
  onRetry,
  onUseMotion,
}: {
  influencer: Influencer;
  onDelete: () => void;
  onRetry: () => void;
  onUseMotion: () => void;
}) {
  const date = new Date(influencer.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="gen-card">
      <div className="media">
        {influencer.status === "completed" && influencer.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={influencer.imageUrl} alt={influencer.name} loading="lazy" />
        ) : influencer.status === "failed" ? (
          <div className="pending">
            <span style={{ color: "var(--danger)", fontSize: 13, padding: "0 14px", textAlign: "center" }}>
              {influencer.error ?? "A geração falhou"}
            </span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onRetry}>
              <RotateCcw size={14} />
              Tentar de novo
            </button>
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
        <div className="actions">
          {influencer.status === "completed" && influencer.imageUrl ? (
            <>
              <a href={influencer.imageUrl} target="_blank" rel="noreferrer" title="Baixar imagem">
                <Download size={14} />
              </a>
              <button type="button" title="Usar em um vídeo" onClick={onUseMotion}>
                <Sparkles size={14} />
              </button>
            </>
          ) : null}
          <button type="button" title="Excluir" onClick={onDelete}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="body">
        <b>{influencer.name}</b>
        <span>{date}</span>
      </div>
    </div>
  );
}
