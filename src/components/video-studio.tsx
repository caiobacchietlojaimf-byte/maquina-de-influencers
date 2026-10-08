"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowRight, Clapperboard, Search, Sparkles, Upload, Users, X } from "lucide-react";

import { pollInfluencersAction } from "@/app/actions/influencers";
import { prepareCharacterEditAction, generateCharacterEditAction } from "@/app/actions/character-edit";
import { EDIT_PRICE_DATE, type EditQuote, type EditResolution, type EditSource } from "@/lib/character-edit";
import { verifyVideoReferenceAction } from "@/app/actions/video-reference";
import { MAX_REFERENCE_BYTES, type StudioReference } from "@/lib/video-reference";
import { MOTION_PRESETS, type MotionPreset } from "@/data/motion-presets";
import { VIDEO_COST } from "@/lib/costs";
import type { Influencer } from "@/lib/db";
import { MotionPresetCard } from "./motion-preset-card";
import styles from "./video-studio.module.css";

type PresetScope = "all" | "trending" | "higgsfield";

export function VideoStudio({
  initialInfluencers,
  initialInfluencerId,
  initialPresetId,
  initialReference,
  initialError,
  uploadUserId,
  credits,
}: {
  initialInfluencers: Influencer[];
  initialInfluencerId?: string;
  initialPresetId?: string;
  initialReference?: StudioReference;
  initialError?: string;
  uploadUserId: string;
  credits: number;
}) {
  const router = useRouter();
  const formId = useId();
  const initialPreset = MOTION_PRESETS.find((preset) => preset.id === initialPresetId);
  const [influencers, setInfluencers] = useState(initialInfluencers);
  const [presetId, setPresetId] = useState<string | null>(initialPreset?.id ?? null);
  const [influencerId, setInfluencerId] = useState<string | null>(() => {
    if (initialInfluencerId) return initialInfluencerId;
    return initialInfluencers.find((inf) => inf.status === "completed" && inf.imageUrl)?.id ?? null;
  });
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState<PresetScope>("all");
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [reference, setReference] = useState<StudioReference | null>(initialReference ?? null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [quote, setQuote] = useState<EditQuote | null>(null);
  const [acceptedEstimate, setAcceptedEstimate] = useState(false);
  const [resolution, setResolution] = useState<EditResolution>("720p");
  const referenceReady = reference ? reference.duration >= 4 && reference.duration <= 30 : Boolean(presetId);
  const busy = submitting || uploading || preparing;
  useEffect(() => { setQuote(null); setAcceptedEstimate(false); }, [reference, presetId, influencerId, prompt, resolution]);
  const hasPending = influencers.some((inf) => inf.status === "processing" || inf.status === "queued");
  const ready = useMemo(() => influencers.filter((inf) => inf.status === "completed" && inf.imageUrl), [influencers]);
  const influencer = ready.find((inf) => inf.id === influencerId);
  const preset = MOTION_PRESETS.find((item) => item.id === presetId);
  const enoughCredits = credits >= VIDEO_COST;
  const list = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    return MOTION_PRESETS.filter((item) =>
      (scope === "all" || item.category === scope) &&
      (!search || item.name.toLocaleLowerCase("pt-BR").includes(search)),
    );
  }, [scope, query]);

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

  function editSource(): EditSource {
    if (reference?.kind === "profile") return { kind: "profile", handle: reference.handle!, id: reference.id };
    if (reference?.kind === "viral") return { kind: "viral", id: reference.id };
    if (reference?.kind === "upload") return { kind: "upload", token: reference.token! };
    return { kind: "preset", id: presetId! };
  }
  async function prepare() {
    if (busy || !influencer || !referenceReady) return;
    setPreparing(true); setError(null); setQuote(null); setAcceptedEstimate(false);
    try {
      const result = await prepareCharacterEditAction({ influencerId: influencer.id, source: editSource(), target: prompt.trim(), resolution });
      if ("error" in result) setError(result.error); else setQuote(result.quote);
    } catch { setError("Não foi possível preparar a troca. Tente novamente."); }
    finally { setPreparing(false); }
  }
  async function generate() {
    if (busy || !quote || !acceptedEstimate) return;
    setSubmitting(true); setError(null);
    try {
      const result = await generateCharacterEditAction({ quoteToken: quote.token, acceptedEstimate });
      if ("error" in result) { setError(result.error); setQuote(null); setAcceptedEstimate(false); return; }
      router.push("/app/videos"); router.refresh();
    } catch { setError("A confirmação não chegou. Confira Meus vídeos antes de tentar novamente."); }
    finally { setSubmitting(false); }
  }

  async function addVideo(file: File) {
    if (busy) return;
    setError(null);
    if (!file.name.toLowerCase().endsWith(".mp4") || (file.type && file.type !== "video/mp4")) { setError("Escolha um arquivo MP4."); return; }
    if (file.size > MAX_REFERENCE_BYTES) { setError("O vídeo deve ter até 50 MB."); return; }
    setUploading(true); setProgress(0);
    const localUrl = URL.createObjectURL(file);
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const probe = document.createElement("video");
        const timer = setTimeout(() => { cleanup(); reject(new Error("Não foi possível ler o vídeo.")); }, 15000);
        const cleanup = () => { clearTimeout(timer); probe.onerror = null; probe.onloadedmetadata = null; probe.removeAttribute("src"); probe.load(); };
        probe.preload = "metadata";
        probe.onloadedmetadata = () => { const seconds = probe.duration; const hasVideo = probe.videoWidth > 0; cleanup(); hasVideo ? resolve(seconds) : reject(new Error("O arquivo não possui imagem de vídeo.")); };
        probe.onerror = () => { cleanup(); reject(new Error("Esse vídeo não pode ser reproduzido. Exporte como MP4 H.264.")); };
        probe.src = localUrl;
      });
      if (!Number.isFinite(duration) || duration < 4 || duration > 30) throw new Error("Envie um vídeo de 4 a 30 segundos para trocar o personagem sem cortes automáticos.");
      const { upload } = await import("@vercel/blob/client");
      const blob = await upload(`video-references/${uploadUserId}/${crypto.randomUUID()}.mp4`, file, { access: "public", contentType: "video/mp4", handleUploadUrl: "/api/video-reference/upload", onUploadProgress: event => setProgress(Math.round(event.percentage)) });
      const result = await verifyVideoReferenceAction(blob.pathname, file.name);
      if ("error" in result) throw new Error(result.error);
      setReference(result.reference); setPresetId(null); setPrompt("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha no envio. Tente novamente."); }
    finally { URL.revokeObjectURL(localUrl); setUploading(false); }
  }

  return (
    <div className={styles.root}>
      <header className={`page-head ${styles.pageHead}`}>
        <div>
          <h1>Criar <span className={styles.accent}>Vídeos</span></h1>
          <p className="sub">Troque o personagem do vídeo pelo seu influencer, preservando o restante da cena. Confira a referência e o custo antes de gerar.</p>
        </div>
        <Link href="/app/videos" className="btn btn-ghost"><Clapperboard size={16} /> Meus vídeos</Link>
      </header>

      <div className={`studio ${styles.layout}`}>
        <aside className={`builder ${styles.builder}`} aria-label="Configurar vídeo">
          <div className="builder-head">
            <div className="kicker">Seu influencer no vídeo original</div>
            <h2>Troque o personagem</h2>
          </div>
          <div className="builder-scroll">
            <fieldset className={styles.fieldset} disabled={busy}>
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

            <fieldset className={styles.fieldset} disabled={busy}>
              <legend className={styles.fieldLabel}><span>2</span> Adicione o vídeo de referência</legend>
              <label className={styles.upload}>
                <Upload size={20} aria-hidden="true" />
                <strong>{uploading ? (progress < 100 ? `Enviando vídeo… ${progress}%` : "Validando vídeo…") : "Adicionar vídeo"}</strong>
                <span>MP4 · 4 a 30 segundos · até 50 MB</span>
                <input type="file" accept="video/mp4,.mp4" aria-label="Adicionar vídeo de referência" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void addVideo(file); }} />
              </label>
              {uploading && <progress aria-label="Progresso do envio" max={100} value={progress} className={styles.progress} />}
              <p className={styles.hint}>Envie o vídeo original ou escolha uma referência. O upload e a preparação não iniciam uma geração paga.</p>
              <p className={styles.hint}>Troca localizada de personagem · Genjutsu Object Swap</p>
              {reference ? (
                <div className={styles.selection}>
                  <video key={reference.videoUrl} className={styles.preview} src={reference.videoUrl} poster={reference.thumbnail} controls playsInline preload="metadata" aria-label={`Vídeo de referência: ${reference.name}`} />
                  <b>{reference.name}</b>
                  <span>{reference.kind === "upload" ? "Vídeo enviado" : "Referência dos Vídeos Virais"} · {Math.round(reference.duration)}s</span>
                  {!referenceReady && <p className={styles.error} role="status">Esta referência tem {Math.round(reference.duration)}s. Envie um recorte de 4 a 30 segundos para trocar o personagem.</p>}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setReference(null); setError(null); }}><X size={14} />Remover referência</button>
                </div>
              ) : preset ? (
                <div className={styles.selection}>
                  <PresetPreview key={preset.id} preset={preset} />
                  <b>{preset.name}</b>
                  <span>Referência selecionada</span>
                </div>
              ) : (
                <p className={styles.hint}>Selecione um vídeo original na galeria ou envie um arquivo.</p>
              )}
            </fieldset>

            <div className="field">
              <label htmlFor={`${formId}-prompt`} className={styles.fieldLabel}><span>3</span> Quem deve ser substituído? <small>Obrigatório</small></label>
              <textarea
                id={`${formId}-prompt`}
                className="input"
                placeholder="Ex.: o homem de bigode, casaco roxo e calça escura, dançando no centro. Manter todas as outras pessoas."
                maxLength={500} minLength={8} required
                value={prompt}
                rows={4}
                disabled={busy}
                onChange={(event) => setPrompt(event.target.value)}
              />
              <p className={styles.hint}>Descreva roupa, posição e aparência de uma única pessoa no original. A imagem do influencer define a identidade e a roupa da substituição.</p>
              <label htmlFor={`${formId}-quality`} className={styles.fieldLabel}>Qualidade do vídeo</label>
              <select id={`${formId}-quality`} className="input" value={resolution} disabled={busy} onChange={event => setResolution(event.target.value as EditResolution)}>
                <option value="720p">720p · qualidade padrão</option>
                <option value="1080p">1080p · maior resolução e custo</option>
              </select>
              <p className={styles.hint}>Preservação solicitada: duração, câmera, cenário e demais pessoas. O áudio original é recolocado no arquivo final. A fidelidade visual ainda depende da IA.</p>
            </div>
          </div>

          <div className={`builder-footer ${styles.footer}`}>
            <p className={styles.creditBalance}>Saldo: <b>{credits.toLocaleString("pt-BR")} créditos</b></p>
            {!enoughCredits ? <p className={styles.error} role="status">Você precisa de {VIDEO_COST} créditos para gerar um vídeo.</p> : null}
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            {quote ? (
              <div className={styles.quote} aria-live="polite">
                <b>Pronto para trocar o personagem</b>
                <span>Original: {quote.metadata.duration.toFixed(2)}s · {quote.metadata.width} × {quote.metadata.height}</span>
                <span>Genjutsu Object Swap · {quote.resolution}</span>
                <strong>Estimativa da API: US$ {quote.estimatedUsd.toFixed(2)}</strong>
                <small>Preço de tabela de {EDIT_PRICE_DATE}, antes de descontos da sua conta. A Higgsfield cobra por segundo do vídeo de entrada, arredondado para cima. Consulte o valor vigente no provedor.</small>
                <label className={styles.accept}><input type="checkbox" checked={acceptedEstimate} disabled={busy} onChange={e => setAcceptedEstimate(e.target.checked)} />Li a estimativa em dólares e quero gerar este vídeo.</label>
              </div>
            ) : null}
            <button type="button" className="generate-btn" disabled={busy || !influencer || !referenceReady || prompt.trim().length < 8 || !enoughCredits || (Boolean(quote) && !acceptedEstimate)} onClick={quote ? generate : prepare}>
              {busy ? <><span className="spinner" />{uploading ? "Enviando vídeo…" : preparing ? "Conferindo original…" : "Enviando edição…"}</> : <><Sparkles size={16} />{quote ? "Gerar troca de personagem" : "Preparar troca e ver custo"}{quote && <span className="cost">✦ {VIDEO_COST}</span>}</>}
            </button>
            <p className={styles.hint}>A preparação é gratuita. Uma geração usa {VIDEO_COST} créditos do sistema e saldo da sua API. Resultados com duração ou proporção divergentes serão sinalizados para revisão.</p>
          </div>
        </aside>

        <section className={styles.gallery} aria-labelledby={`${formId}-gallery`} aria-busy={submitting}>
          <div className={styles.galleryHead}>
            <div>
              <h2 id={`${formId}-gallery`}>Vídeos de referência</h2>
              <p>O vídeo escolhido será a base da edição.</p>
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
                  active={!reference && presetId === item.id}
                  disabled={busy}
                  onPick={() => { setPresetId(item.id); setReference(null); setPrompt(""); setError(null); }}
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
