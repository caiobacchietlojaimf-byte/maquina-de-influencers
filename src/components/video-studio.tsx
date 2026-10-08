"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowRight, Clapperboard, Search, Sparkles, Users } from "lucide-react";

import { pollInfluencersAction } from "@/app/actions/influencers";
import { createMotionVideoAction } from "@/app/actions/videos";
import { MOTION_PRESETS, type MotionKind, type MotionPreset } from "@/data/motion-presets";
import { VIDEO_COST } from "@/lib/costs";
import type { Influencer } from "@/lib/db";
import { MotionPresetCard } from "./motion-preset-card";
import styles from "./video-studio.module.css";

type PresetScope = "all" | "trending" | "higgsfield";

export function VideoStudio({
  initialInfluencers,
  initialInfluencerId,
  initialPresetId,
  credits,
}: {
  initialInfluencers: Influencer[];
  initialInfluencerId?: string;
  initialPresetId?: string;
  credits: number;
}) {
  const router = useRouter();
  const formId = useId();
  const initialPreset = MOTION_PRESETS.find((preset) => preset.id === initialPresetId);
  const [influencers, setInfluencers] = useState(initialInfluencers);
  const [motionKind, setMotionKind] = useState<MotionKind>(initialPreset?.kind ?? "motion_transfer");
  const [presetId, setPresetId] = useState<string | null>(initialPreset?.id ?? null);
  const [influencerId, setInfluencerId] = useState<string | null>(() => {
    if (initialInfluencerId) return initialInfluencerId;
    return initialInfluencers.find((inf) => inf.status === "completed" && inf.imageUrl)?.id ?? null;
  });
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState<PresetScope>("all");
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPending = influencers.some((inf) => inf.status === "processing" || inf.status === "queued");
  const ready = useMemo(() => influencers.filter((inf) => inf.status === "completed" && inf.imageUrl), [influencers]);
  const influencer = ready.find((inf) => inf.id === influencerId);
  const preset = MOTION_PRESETS.find((item) => item.id === presetId);
  const enoughCredits = credits >= VIDEO_COST;
  const list = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    return MOTION_PRESETS.filter((item) =>
      item.kind === motionKind &&
      (scope === "all" || item.category === scope) &&
      (!search || item.name.toLocaleLowerCase("pt-BR").includes(search)),
    );
  }, [motionKind, scope, query]);

  useEffect(() => {
    if (!hasPending) return;
    let disposed = false;
    const timer = setInterval(() => {
      void pollInfluencersAction()
        .then((items) => { if (!disposed) setInfluencers(items); })
        .catch(() => undefined);
    }, 4000);
    return () => { disposed = true; clearInterval(timer); };
  }, [hasPending]);

  async function generate() {
    if (submitting) return;
    if (!influencer || !preset) {
      setError("Escolha um influencer pronto e um movimento para criar o vídeo.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createMotionVideoAction({
      influencerId: influencer.id,
      presetId: preset.id,
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
    }).catch((caught: unknown) => ({ error: caught instanceof Error ? caught.message : "Não foi possível iniciar o vídeo. Tente novamente." }));
    if ("error" in result) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.push("/app/videos");
    router.refresh();
  }

  function changeKind(kind: MotionKind) {
    setMotionKind(kind);
    setPresetId(null);
    setError(null);
  }

  return (
    <div className={styles.root}>
      <header className={`page-head ${styles.pageHead}`}>
        <div>
          <h1>Criar <span className={styles.accent}>Vídeos</span></h1>
          <p className="sub">Dê movimento ao seu personagem de IA. Escolha seu influencer, use uma referência e crie sua próxima cena.</p>
        </div>
        <Link href="/app/videos" className="btn btn-ghost"><Clapperboard size={16} /> Meus vídeos</Link>
      </header>

      <div className={`studio ${styles.layout}`}>
        <aside className={`builder ${styles.builder}`} aria-label="Configurar vídeo">
          <div className="builder-head">
            <div className="kicker">Seu personagem em uma nova cena</div>
            <h2>Monte seu vídeo</h2>
          </div>
          <div className="builder-scroll">
            <fieldset className={styles.fieldset} disabled={submitting}>
              <legend className={styles.fieldLabel}><span>1</span> Escolha seu influencer</legend>
              {ready.length ? (
                <>
                  <div className="influencer-pick">
                    {ready.map((inf) => (
                      <button
                        type="button"
                        key={inf.id}
                        className="pick"
                        data-active={influencerId === inf.id}
                        aria-pressed={influencerId === inf.id}
                        title={inf.name}
                        onClick={() => { setInfluencerId(inf.id); setError(null); }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={inf.imageUrl} alt="" loading="lazy" />
                        <span>{inf.name}</span>
                      </button>
                    ))}
                  </div>
                  <p className={styles.hint}>{influencer ? `${influencer.name} será o protagonista.` : "Selecione um dos seus influencers prontos."}</p>
                </>
              ) : (
                <div className={styles.emptyInfluencers}>
                  <Users size={22} />
                  <p>{hasPending ? "Seu influencer ainda está sendo gerado. Ele aparecerá aqui quando estiver pronto." : "Crie seu primeiro influencer para dar vida a ele em vídeo."}</p>
                  <Link href="/app/influencers" className="btn btn-sm btn-ghost">Criar influencer <ArrowRight size={14} /></Link>
                </div>
              )}
            </fieldset>

            <fieldset className={styles.fieldset} disabled={submitting}>
              <legend className={styles.fieldLabel}><span>2</span> Escolha o movimento</legend>
              <div className="mode-tabs">
                <button type="button" data-active={motionKind === "motion_transfer"} aria-pressed={motionKind === "motion_transfer"} onClick={() => changeKind("motion_transfer")}>Transferir movimento</button>
                <button type="button" data-active={motionKind === "object_swap"} aria-pressed={motionKind === "object_swap"} onClick={() => changeKind("object_swap")}>Trocar objetos</button>
              </div>
              {preset ? (
                <div className={styles.selection}>
                  <PresetPreview key={preset.id} preset={preset} />
                  <b>{preset.name}</b>
                  <span>Referência selecionada</span>
                </div>
              ) : (
                <p className={styles.hint}>Selecione uma referência na galeria de movimentos.</p>
              )}
            </fieldset>

            <div className="field">
              <label htmlFor={`${formId}-prompt`} className={styles.fieldLabel}><span>3</span> Personalize a cena <small>Opcional</small></label>
              <textarea
                id={`${formId}-prompt`}
                className="input"
                placeholder="Ex.: mesmos movimentos, novo cenário: Tóquio à noite"
                value={prompt}
                rows={4}
                disabled={submitting}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </div>
          </div>

          <div className={`builder-footer ${styles.footer}`}>
            <p className={styles.creditBalance}>Saldo: <b>{credits.toLocaleString("pt-BR")} créditos</b></p>
            {!enoughCredits ? <p className={styles.error} role="status">Você precisa de {VIDEO_COST} créditos para gerar um vídeo.</p> : null}
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            <button type="button" className="generate-btn" disabled={submitting || !influencer || !preset || !enoughCredits} onClick={generate}>
              {submitting ? <><span className="spinner" /> Gerando vídeo…</> : <><Sparkles size={16} /> Gerar vídeo <span className="cost">✦ {VIDEO_COST}</span></>}
            </button>
            <p className={styles.hint} aria-live="polite">{submitting ? "Iniciando sua geração…" : !influencer ? "Escolha um influencer para começar." : !preset ? "Selecione um movimento na galeria." : "Acompanhe o resultado em Meus vídeos."}</p>
          </div>
        </aside>

        <section className={styles.gallery} aria-labelledby={`${formId}-gallery`} aria-busy={submitting}>
          <div className={styles.galleryHead}>
            <div>
              <h2 id={`${formId}-gallery`}>Galeria de movimentos</h2>
              <p>Escolha o ritmo, a câmera e a energia da sua cena.</p>
            </div>
            <span className={styles.count} aria-live="polite">{list.length} referência{list.length !== 1 ? "s" : ""}</span>
          </div>
          <div className={styles.toolbar}>
            <div className={styles.filters} aria-label="Filtrar referências">
              {([{ id: "all", label: "Todos" }, { id: "trending", label: "Em alta" }, { id: "higgsfield", label: "Higgsfield" }] as const).map((filter) => (
                <button type="button" key={filter.id} className="chip" data-active={scope === filter.id} aria-pressed={scope === filter.id} onClick={() => setScope(filter.id)}>{filter.label}</button>
              ))}
            </div>
            <label className={styles.search}>
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Buscar movimento</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar movimento" />
            </label>
          </div>
          {list.length ? (
            <div className={`motion-grid ${styles.grid}`}>
              {list.map((item) => (
                <MotionPresetCard
                  key={item.id}
                  name={item.name}
                  thumbnail={item.thumbnail}
                  preview={item.preview}
                  active={presetId === item.id}
                  disabled={submitting}
                  onPick={() => { setPresetId(item.id); setError(null); }}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="big">Nenhum movimento encontrado</div>
              <p>Tente outro nome ou veja todas as referências deste modo.</p>
              <button type="button" className="btn btn-ghost" onClick={() => { setQuery(""); setScope("all"); }}>Limpar filtros</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PresetPreview({ preset }: { preset: MotionPreset }) {
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <video
        className={styles.preview}
        src={fallback ? preset.drivingVideo : preset.preview}
        poster={preset.thumbnail}
        controls
        playsInline
        preload="metadata"
        aria-label={`Prévia de ${preset.name}`}
        onError={() => fallback ? setFailed(true) : setFallback(true)}
      />
      {failed ? <p className={styles.hint} role="status">A prévia está temporariamente indisponível. Escolha outra referência para conferir o movimento.</p> : null}
    </>
  );
}
