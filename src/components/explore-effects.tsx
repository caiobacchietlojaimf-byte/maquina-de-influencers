"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Copy, Flame, Play, Search, Wand2, X } from "lucide-react";

import { createViralVideoAction } from "@/app/actions/videos";
import { EFFECT_DURATION_S, listExecutableEffects, type DiscoveredTrend, type ExecutableEffect } from "@/lib/effects-catalog";
import { PLATFORM_LABEL, relativeTime, type ExplorePlatform } from "@/lib/explore-format";
import type { ExploreItem } from "@/lib/explore-items";
import { buildViralPrompt } from "@/lib/prompt";
import { ExploreCard, PlatformMark } from "./explore-card";
import styles from "./explore-virals.module.css";

/* Efeitos virais em duas listas:
   - "Efeitos disponíveis": presets executáveis (prompt + modelo + custo validados
     pelo sistema); têm "Aplicar efeito".
   - "Tendências descobertas": vídeos recentes da coleta, só inspiração. Podem
     servir de referência de movimento quando compatíveis, nunca de "efeito". */

type MiniInfluencer = { id: string; name: string; imageUrl: string };
type PlatformFilter = "all" | ExplorePlatform;

const EFFECTS = listExecutableEffects();
const EFFECT_PLATFORMS = (() => { const seen: ExplorePlatform[] = []; for (const effect of EFFECTS) if (!seen.includes(effect.platform)) seen.push(effect.platform); return seen; })();

export function EffectsTab({ influencers, trends, trendItems, now, trendStatus, onOpen, onUse }: {
  influencers: MiniInfluencer[];
  trends: DiscoveredTrend[];
  trendItems: Map<string, ExploreItem>;
  now: number;
  trendStatus: string;
  onOpen: (item: ExploreItem) => void;
  onUse: (href: string) => void;
}) {
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ExecutableEffect | null>(null);

  const effects = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    return EFFECTS.filter((effect) => (platform === "all" || effect.platform === platform)
      && (!q || effect.name.toLocaleLowerCase("pt-BR").includes(q) || effect.description.toLocaleLowerCase("pt-BR").includes(q) || effect.tags.some((tag) => tag.includes(q))));
  }, [platform, query]);

  const visibleTrends = useMemo(() => trends.filter((trend) => platform === "all" || trend.viral.source === platform), [trends, platform]);

  return (
    <>
      <div className={styles.filters}>
        <div className={styles.platforms} role="group" aria-label="Plataforma">
          {(["all", ...EFFECT_PLATFORMS] as PlatformFilter[]).map((id) => (
            <button key={id} type="button" className={styles.platformChip} data-active={platform === id} aria-pressed={platform === id} onClick={() => setPlatform(id)}>
              {id !== "all" ? <PlatformMark platform={id} size={14} /> : null}
              {id === "all" ? "Todas" : PLATFORM_LABEL[id]}
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input className="input" aria-label="Buscar efeito" placeholder="Buscar efeito, estilo ou tag" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      <div className={styles.statusRow} aria-live="polite">
        <span><strong>Efeitos disponíveis:</strong> {EFFECTS.length} presets do catálogo local, com prompt, modelo e custo validados (sem atualização automática)</span>
        <span><strong>Tendências descobertas:</strong> {trendStatus}</span>
      </div>

      <div className={styles.resultsRow}>
        <h2><Wand2 size={16} aria-hidden="true" /> Efeitos disponíveis</h2>
        <span>{effects.length} {effects.length === 1 ? "efeito" : "efeitos"} · {EFFECT_DURATION_S} s · {EFFECTS[0]?.cost ?? 0} créditos cada</span>
      </div>
      {effects.length ? (
        <div className={styles.grid}>
          {effects.map((effect) => <EffectCard key={effect.id} effect={effect} onApply={() => setActive(effect)} />)}
        </div>
      ) : (
        <div className={styles.empty}>
          <b>Nenhum efeito com esses filtros</b>
          <p>Ajuste a busca ou a plataforma.</p>
          <div className={styles.emptyActions}><button type="button" className="btn btn-ghost" onClick={() => { setPlatform("all"); setQuery(""); }}>Limpar filtros</button></div>
        </div>
      )}

      <div className={styles.resultsRow}>
        <h2><Flame size={16} aria-hidden="true" /> Tendências descobertas</h2>
        <span>inspiração da coleta automática · sem botão de aplicar</span>
      </div>
      <p className={styles.sectionHint}>Critério: vídeo real da coleta cujo título, legenda ou música cita um efeito do catálogo (nome ou tag) ou vocabulário de efeito visual (clone, transição, slow motion, flutuar, derreter…). Métricas e datas vêm da origem. Virar efeito exige validar prompt, modelo e custo; até lá, os compatíveis (arquivo de 3 a 30 s) só servem de referência de movimento.</p>
      {visibleTrends.length ? (
        <div className={styles.grid}>
          {visibleTrends.map((trend) => {
            const item = trendItems.get(trend.viral.id);
            return item ? (
              <div key={item.id} className={styles.trend}>
                <ExploreCard item={item} now={now} badge="Inspiração" onOpen={() => onOpen(item)} onUse={trend.usableAsReference ? onUse : undefined} />
                <p className={styles.trendWhy}>
                  {trend.relatedEffects.length ? <>Relacionado a <b>{trend.relatedEffects.map((effect) => effect.name).join(", ")}</b> · </> : null}
                  cita: {trend.matchedTerms.join(", ")}
                </p>
              </div>
            ) : null;
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <b>Nenhuma tendência de efeito descoberta{platform !== "all" ? ` no ${PLATFORM_LABEL[platform]}` : ""} ainda</b>
          <p>Só entram vídeos da coleta que citam um efeito do catálogo ou vocabulário de efeito visual. O catálogo verificado e vídeos sem esse sinal ficam de fora.</p>
        </div>
      )}

      {active ? <ApplyEffectDialog effect={active} influencers={influencers} onClose={() => setActive(null)} /> : null}
    </>
  );
}

function EffectCard({ effect, onApply }: { effect: ExecutableEffect; onApply: () => void }) {
  return (
    <article className={styles.card} data-effect="true">
      <div className={styles.media}>
        <button type="button" className={styles.cover} onClick={onApply} aria-label={`Ver prévia e aplicar: ${effect.name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={effect.thumbnail} alt="" loading="lazy" decoding="async" />
          <span className={styles.play} aria-hidden="true"><Play size={16} fill="currentColor" /></span>
        </button>
        <span className={styles.platform} title={PLATFORM_LABEL[effect.platform]}><PlatformMark platform={effect.platform} /><span className="sr-only">{PLATFORM_LABEL[effect.platform]}</span></span>
        <span className={styles.softBadge}>Executável</span>
        <span className={styles.duration}>00:0{effect.durationSeconds}</span>
      </div>
      <div className={styles.body}>
        <h3 title={effect.name}>{effect.name}</h3>
        <p className={styles.effectDescription}>{effect.description}</p>
        <div className={styles.tags}>{effect.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
        <span className={styles.origin}>Prévia do catálogo Higgsfield · sem métricas de alcance</span>
        <div className={styles.actions}>
          <button type="button" className={styles.use} onClick={onApply}><Flame size={14} aria-hidden="true" /> Aplicar efeito <span className={styles.cost}>✦ {effect.cost}</span></button>
        </div>
      </div>
    </article>
  );
}

function ApplyEffectDialog({ effect, influencers, onClose }: { effect: ExecutableEffect; influencers: MiniInfluencer[]; onClose: () => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pickedInfluencer, setPickedInfluencer] = useState<string | null>(influencers[0]?.id ?? null);
  const [extra, setExtra] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  const submissionBusy = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  const close = () => { dialog.current?.close(); onClose(); };

  const prompt = buildViralPrompt(effect.name, effect.description, extra);

  const generate = async () => {
    if (!pickedInfluencer || submissionBusy.current) return;
    submissionBusy.current = true;
    const fingerprint = JSON.stringify([effect.id, pickedInfluencer, extra.trim()]);
    if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, key: crypto.randomUUID() };
    setSubmitting(true);
    setError(null);
    const result = await createViralVideoAction({
      requestKey: submission.current.key,
      influencerId: pickedInfluencer,
      effectId: effect.id,
      ...(extra.trim() ? { extraPrompt: extra.trim() } : {}),
    }).catch((caught: unknown) => ({ error: caught instanceof Error ? caught.message : String(caught) }));
    setSubmitting(false);
    submissionBusy.current = false;
    if ("error" in result) {
      if ("retryable" in result && result.retryable) submission.current = null;
      setError(result.error);
      return;
    }
    router.push("/app/videos");
  };

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}>
      <button type="button" className={styles.dialogClose} aria-label="Fechar" onClick={close}><X size={16} aria-hidden="true" /></button>
      <div className={styles.dialogBody}>
        <div className={styles.dialogPlayer}>
          <div className={styles.player}>
            <video src={effect.preview} poster={effect.thumbnail} controls autoPlay muted loop playsInline aria-label={`Prévia do efeito ${effect.name}`} />
          </div>
        </div>
        <div className={styles.dialogInfo}>
          <span className={styles.dialogPlatform}><PlatformMark platform={effect.platform} size={14} /> {PLATFORM_LABEL[effect.platform]} · efeito executável</span>
          <h2 id={titleId}>Aplicar efeito “{effect.name}”</h2>
          <p className={styles.dialogText}>{effect.description}</p>
          <dl className={styles.dialogMeta}>
            <dt>Modelo</dt><dd>Kling motion control</dd>
            <dt>Duração</dt><dd>{effect.durationSeconds} segundos</dd>
            <dt>Custo</dt><dd>{effect.cost} créditos por geração</dd>
            <dt>Prévia</dt><dd>catálogo Higgsfield (sem métricas de alcance)</dd>
          </dl>

          <div className="field">
            <label>Quem vai estrelar o vídeo?</label>
            {influencers.length ? (
              <div className="influencer-pick">
                {influencers.map((influencer) => (
                  <button type="button" key={influencer.id} className="pick" data-active={pickedInfluencer === influencer.id} onClick={() => setPickedInfluencer(influencer.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={influencer.imageUrl} alt={influencer.name} />
                    <span>{influencer.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className={styles.dialogText}>Você ainda não tem influencer pronto. <Link href="/app/influencers" style={{ color: "var(--accent-text)" }}>Criar um agora →</Link></p>
            )}
          </div>

          <div className="field">
            <label htmlFor={`${titleId}-extra`}>Toque pessoal (opcional)</label>
            <textarea id={`${titleId}-extra`} className="input" placeholder="Ex.: cenário em São Paulo à noite, roupa neon…" value={extra} onChange={(event) => setExtra(event.target.value)} />
          </div>

          <div className="field">
            <label>Prompt do efeito (gerado automaticamente)</label>
            <div className={styles.promptBox}>
              {prompt}
              <button type="button" title="Copiar prompt" aria-label="Copiar prompt" data-copied={copied} onClick={() => { navigator.clipboard.writeText(prompt).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                <Copy size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          {error ? <div className="auth-error" role="alert">{error}</div> : null}

          <button type="button" className="generate-btn" disabled={submitting || !pickedInfluencer} onClick={generate}>
            {submitting ? <span className="spinner" /> : <>Gerar com este efeito <span className="cost">✦ {effect.cost}</span></>}
          </button>
        </div>
      </div>
    </dialog>
  );
}
