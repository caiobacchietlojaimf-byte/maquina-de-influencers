"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Clapperboard, Download, Package, Search, Sparkles, Upload, Users, X } from "lucide-react";

import { pollInfluencersAction } from "@/app/actions/influencers";
import { generateCharacterEditAction } from "@/app/actions/character-edit";
import { prepareEditClient, PrepareEditClientError } from "@/lib/prepare-edit-client";
import { exportEditClient, ExportEditClientError, type ExportEditPackage } from "@/lib/export-edit-client";
import { EDIT_ENGINES, type EditEngine, type EditQuote, type EditResolution, type EditTargetMode, type EditSource } from "@/lib/character-edit";
import { verifyVideoReferenceAction } from "@/app/actions/video-reference";
import { MAX_REFERENCE_BYTES, type StudioReference } from "@/lib/video-reference";
import { MOTION_PRESETS, type MotionPreset } from "@/data/motion-presets";
import { creditsToUsd } from "@/lib/credit-pricing";
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
  const [targetMode, setTargetMode] = useState<EditTargetMode>("main");
  const [scope, setScope] = useState<PresetScope>("all");
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [reference, setReference] = useState<StudioReference | null>(initialReference ?? null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [prepareMessage, setPrepareMessage] = useState("");
  const [prepareSeconds, setPrepareSeconds] = useState(0);
  const activePreparation = useRef<{ id: number; controller: AbortController; startedAt: number } | null>(null);
  const preparationSequence = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [exportSeconds, setExportSeconds] = useState(0);
  const [exportedPackage, setExportedPackage] = useState<ExportEditPackage | null>(null);
  const activeExport = useRef<{ id: number; controller: AbortController; startedAt: number } | null>(null);
  const exportSequence = useRef(0);
  const [quote, setQuote] = useState<EditQuote | null>(null);
  const [acceptedEstimate, setAcceptedEstimate] = useState(false);
  const [engine, setEngine] = useState<EditEngine>("fal-kling-pro");
  const [resolution, setResolution] = useState<EditResolution>("auto");
  const engineConfig = EDIT_ENGINES[engine];
  const modelDefinesResolution = engineConfig.resolutions.length === 1 && engineConfig.resolutions[0] === "auto";
  const referenceReady = reference ? reference.duration >= 4 && reference.duration <= 30 : Boolean(presetId);
  const busy = submitting || uploading || preparing || exporting;
  const targetReady = targetMode !== "manual" || prompt.trim().length >= 8;
  useEffect(() => { setQuote(null); setAcceptedEstimate(false); setExportedPackage(null); }, [reference, presetId, influencerId, prompt, targetMode, resolution, engine]);
  useEffect(() => () => {
    const active = activePreparation.current;
    activePreparation.current = null;
    active?.controller.abort();
    const exportRequest = activeExport.current;
    activeExport.current = null;
    exportRequest?.controller.abort();
  }, []);
  useEffect(() => {
    if (!preparing && !exporting) return;
    const timer = setInterval(() => {
      if (activePreparation.current) setPrepareSeconds(Math.floor((Date.now() - activePreparation.current.startedAt) / 1000));
      if (activeExport.current) setExportSeconds(Math.floor((Date.now() - activeExport.current.startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [preparing, exporting]);
  const hasPending = influencers.some((inf) => inf.status === "processing" || inf.status === "queued");
  const ready = useMemo(() => influencers.filter((inf) => inf.status === "completed" && inf.imageUrl), [influencers]);
  const influencer = ready.find((inf) => inf.id === influencerId);
  const preset = MOTION_PRESETS.find((item) => item.id === presetId);
  const enoughCredits = !quote || credits >= quote.creditCost;
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
    if (busy || activePreparation.current || activeExport.current || !influencer || !referenceReady) return;
    const active = { id: ++preparationSequence.current, controller: new AbortController(), startedAt: Date.now() };
    activePreparation.current = active;
    setPreparing(true); setError(null); setQuote(null); setAcceptedEstimate(false);
    setPrepareMessage("Conectando para preparar o vídeo…"); setPrepareSeconds(0);
    try {
      const result = await prepareEditClient({ influencerId: influencer.id, source: editSource(), targetMode, target: targetMode === "manual" ? prompt.trim() : undefined, resolution, engine }, {
        signal: active.controller.signal,
        onProgress: event => { if (activePreparation.current?.id === active.id) setPrepareMessage(event.message); },
      });
      if (activePreparation.current?.id !== active.id) return;
      if ("error" in result) setError(result.error); else setQuote(result.quote);
    } catch (caught) {
      if (activePreparation.current?.id !== active.id) return;
      if (caught instanceof PrepareEditClientError && caught.code === "cancelled") return;
      setError(caught instanceof Error ? caught.message : "A conexão com a preparação foi interrompida. Tente novamente; nenhuma geração foi iniciada.");
    } finally {
      if (activePreparation.current?.id === active.id) { activePreparation.current = null; setPreparing(false); }
    }
  }
  function cancelPreparation() {
    const active = activePreparation.current;
    activePreparation.current = null;
    active?.controller.abort();
    setPreparing(false); setPrepareMessage(""); setError(null);
  }
  async function exportPackage() {
    if (busy || activeExport.current || activePreparation.current || !influencer || !referenceReady || !targetReady) return;
    const active = { id: ++exportSequence.current, controller: new AbortController(), startedAt: Date.now() };
    activeExport.current = active;
    setExporting(true); setError(null); setExportedPackage(null);
    setExportMessage("Preparando os arquivos do pacote…"); setExportSeconds(0);
    try {
      const result = await exportEditClient({ influencerId: influencer.id, source: editSource(), targetMode, target: targetMode === "manual" ? prompt.trim() : undefined, resolution, engine }, {
        signal: active.controller.signal,
        onProgress: event => { if (activeExport.current?.id === active.id) setExportMessage(event.message); },
      });
      if (activeExport.current?.id !== active.id) return;
      if ("error" in result) setError(result.error); else setExportedPackage(result.package);
    } catch (caught) {
      if (activeExport.current?.id !== active.id) return;
      if (caught instanceof ExportEditClientError && caught.code === "cancelled") return;
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a exportação. Tente novamente; nenhum crédito de geração foi usado.");
    } finally {
      if (activeExport.current?.id === active.id) { activeExport.current = null; setExporting(false); }
    }
  }
  function cancelExport() {
    const active = activeExport.current;
    activeExport.current = null;
    active?.controller.abort();
    setExporting(false); setExportMessage(""); setError(null);
  }
  async function generate() {
    if (busy || activeExport.current || activePreparation.current || !quote || !acceptedEstimate) return;
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
      setReference(result.reference); setPresetId(null); setPrompt(""); setTargetMode("main");
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
            <div className={styles.titleRow}>
              <h2>Troque o personagem</h2>
            </div>
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
              <legend className={styles.fieldLabel}><span>2</span> {reference || preset ? "Vídeo de referência" : "Adicione o vídeo de referência"}</legend>
              {!reference && !preset && <>
              <label className={styles.upload}>
                <Upload size={20} aria-hidden="true" />
                <strong>{uploading ? (progress < 100 ? `Enviando vídeo… ${progress}%` : "Validando vídeo…") : "Adicionar vídeo"}</strong>
                <span>MP4 · 4 a 30 segundos · até 50 MB</span>
                <input type="file" accept="video/mp4,.mp4" aria-label="Adicionar vídeo de referência" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void addVideo(file); }} />
              </label>
              {uploading && <progress aria-label="Progresso do envio" max={100} value={progress} className={styles.progress} />}
              </>}
              {reference ? (
                <div className={styles.selection}>
                  <video key={reference.videoUrl} className={styles.preview} src={reference.videoUrl} poster={reference.thumbnail} controls playsInline preload="metadata" aria-label={`Vídeo de referência: ${reference.name}`} />
                  <b>{reference.name}</b>
                  <span>{reference.kind === "upload" ? "Vídeo enviado" : "Referência dos Vídeos Virais"} · {Math.round(reference.duration)}s</span>
                  {!referenceReady && <p className={styles.error} role="status">Esta referência tem {Math.round(reference.duration)}s. Envie um recorte de 4 a 30 segundos para trocar o personagem.</p>}
                </div>
              ) : preset ? (
                <div className={styles.selection}>
                  <PresetPreview key={preset.id} preset={preset} />
                  <b>{preset.name}</b>
                  <span>Referência selecionada</span>
                </div>
              ) : null}
              {(reference || preset) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setReference(null); setPresetId(null); setPrompt(""); setTargetMode("main"); setError(null); }}><X size={14} />Trocar vídeo</button>}
            </fieldset>

            <div className={`field ${styles.editFields}`}>
              <div className={styles.controlGroup}>
              <div className={styles.labelRow}>
                <label htmlFor={`${formId}-engine`} className={styles.fieldLabel}>Modelo de edição</label>
              </div>
              <select id={`${formId}-engine`} className="input" value={engine} disabled={busy} onChange={event => { const next = event.target.value as EditEngine; setEngine(next); setResolution(next === "higgsfield" || next === "fal-wan" ? "720p" : EDIT_ENGINES[next].resolutions[0]); if (next === "fal-wan") setTargetMode("main"); }}>
                {(Object.keys(EDIT_ENGINES) as EditEngine[]).map(key => <option key={key} value={key}>{EDIT_ENGINES[key].label}</option>)}
              </select>
              </div>
              <fieldset className={styles.fieldset} disabled={busy}>
                <legend className={`${styles.fieldLabel} ${styles.targetLegend}`}><span>3</span> Quem deve ser substituído?
                </legend>
                <label className={styles.targetChoice}><input type="radio" name={`${formId}-target`} checked={targetMode === "main"} onChange={() => setTargetMode("main")} />Personagem principal (automático)</label>
                <label className={styles.targetChoice}><input type="radio" name={`${formId}-target`} checked={targetMode === "manual"} disabled={engine === "fal-wan"} onChange={() => setTargetMode("manual")} />Indicar uma pessoa{engine === "fal-wan" ? " (use Kling)" : ""}</label>
                {targetMode === "manual" && <>
              <label htmlFor={`${formId}-prompt`} className={styles.fieldLabel}>Descreva a pessoa no vídeo</label>
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
                </>}
              </fieldset>
              {!modelDefinesResolution && <div className={styles.controlGroup}>
              <label htmlFor={`${formId}-quality`} className={styles.fieldLabel}>Qualidade do vídeo</label>
              <select id={`${formId}-quality`} className="input" value={resolution} disabled={busy} onChange={event => setResolution(event.target.value as EditResolution)}>
                {engineConfig.resolutions.map(value => <option key={value} value={value}>{`${value}${value === "480p" ? " · menor custo e definição" : value === "1080p" ? " · maior resolução" : " · qualidade padrão"}`}</option>)}
              </select>
              </div>}
            </div>
          </div>

          <div className={`builder-footer ${styles.footer}`}>
            <p className={styles.creditBalance}>Saldo: <b>{credits.toLocaleString("pt-BR")} créditos</b></p>
            {!enoughCredits && quote ? <p className={styles.error} role="status">Você precisa de {quote.creditCost} créditos. <Link href="/app/creditos">Comprar créditos</Link></p> : null}
            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            {preparing ? <div className={styles.preparation}>
              <p role="status" aria-live="polite">{prepareMessage}</p>
              <span>Tempo decorrido: {Math.floor(prepareSeconds / 60)}:{String(prepareSeconds % 60).padStart(2, "0")}. Nenhuma geração foi iniciada.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={cancelPreparation}>Cancelar preparação</button>
            </div> : null}
            {exporting ? <div className={styles.preparation}>
              <p role="status" aria-live="polite">{exportMessage}</p>
              <span>Tempo decorrido: {Math.floor(exportSeconds / 60)}:{String(exportSeconds % 60).padStart(2, "0")}. Sem usar créditos de geração.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={cancelExport}>Cancelar exportação</button>
            </div> : null}
            {quote ? (
              <div className={styles.quote} aria-live="polite">
                <b>Pronto para trocar o personagem</b>
                <span>Original: {quote.metadata.duration.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}s · {quote.metadata.width} × {quote.metadata.height}</span>
                <span>{EDIT_ENGINES[quote.engine ?? "higgsfield"].label}{quote.resolution !== "auto" ? ` · ${quote.resolution}` : ""}</span>
                {quote.segmentCount && quote.segmentCount > 1 ? <span>{quote.segmentCount} trechos serão editados e unidos em um único vídeo, com o áudio original completo.</span> : null}
                <strong>{quote.creditCost.toLocaleString("pt-BR")} créditos · US$ {creditsToUsd(quote.creditCost).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                <small>10 créditos = US$ 1. Valor arredondado para o próximo crédito inteiro.</small>
                <label className={styles.accept}><input type="checkbox" checked={acceptedEstimate} disabled={busy} onChange={e => setAcceptedEstimate(e.target.checked)} />Autorizo usar {quote.creditCost.toLocaleString("pt-BR")} créditos para gerar este vídeo.</label>
              </div>
            ) : null}
            <div className={styles.studioActions}>
              <button type="button" className="generate-btn" disabled={busy || !influencer || !referenceReady || !targetReady || !enoughCredits || (Boolean(quote) && !acceptedEstimate)} onClick={quote ? generate : prepare}>
                {submitting || uploading || preparing ? <><span className="spinner" />{uploading ? "Enviando vídeo…" : preparing ? "Preparando vídeo…" : "Enviando edição…"}</> : <><Sparkles size={16} />{quote ? "Confirmar geração" : "Gerar no site"}{quote && <span className="cost">✦ {quote.creditCost}</span>}</>}
              </button>
              <div className={styles.exportAction}>
                {exportedPackage ? <a className="btn btn-ghost" href={exportedPackage.url} download={exportedPackage.filename} target="_blank" rel="noopener noreferrer"><Download size={16} />Baixar pacote ZIP</a> : <button type="button" className="btn btn-ghost" disabled={busy || !influencer || !referenceReady || !targetReady} onClick={() => void exportPackage()}>
                  {exporting ? <><span className="spinner" />Exportando pacote…</> : <><Package size={16} />Exportar pacote</>}
                </button>}
              </div>
            </div>
            {exportedPackage && <p className="sr-only" role="status">Pacote pronto para baixar.</p>}
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
                  onPick={() => { setPresetId(item.id); setReference(null); setPrompt(""); setTargetMode("main"); setError(null); }}
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
  const [failed, setFailed] = useState(false);
  return (
    <>
      <video
        className={styles.preview}
        src={preset.drivingVideo}
        poster={preset.thumbnail}
        controls
        playsInline
        preload="metadata"
        aria-label={`Prévia de ${preset.name}`}
        onError={() => setFailed(true)}
      />
      {failed ? <p className={styles.hint} role="status">A prévia está temporariamente indisponível. Escolha outra referência para conferir o movimento.</p> : null}
    </>
  );
}
