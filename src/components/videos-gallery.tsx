"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Ban, Download, Eye, Film, Flame, Info, MoreHorizontal, Play, RotateCcw, Search, Send, Trash2, Wand2, X } from "lucide-react";

import { cancelVideoAction, deleteVideoAction, pollVideosAction } from "@/app/actions/videos";
import { canDeleteVideo } from "@/lib/video-deletion";
import type { Video, VideoKind } from "@/lib/db";
import { editModelLabel } from "@/lib/character-edit";
import { canFinalizeExistingEdit, finalizeEditClient } from "@/lib/finalize-edit-client";
import { displayDate } from "@/lib/display-date";
import {
  activeFilterCount, canDownload, countByStatus, DEFAULT_FILTERS, durationLabel, filterVideos, hasReviewResult,
  KIND_LABEL, LIBRARY_STATUS_LABEL, libraryStatus, resultDuration, statusLabel, videoTitle, videoWarning,
  type LibraryFilters, type LibraryStatus,
} from "@/lib/video-library";
import { VideoCover, VideoPreview } from "@/components/video-preview";
import styles from "./videos-gallery.module.css";

/* Biblioteca "Meus vídeos": cartões com capa, estado real e ações; detalhes
   (resultado, comparação com o original, informações, trechos) em um modal.
   Toda a lógica de geração, finalização, cancelamento, exclusão e atualização
   automática é a mesma de antes; só a apresentação mudou. */

export type LibraryInfluencer = { id: string; name: string };
type Confirmation = { kind: "delete" | "cancel"; video: Video };

const STATUS_FILTERS: Array<"all" | LibraryStatus> = ["all", "generating", "completed", "failed", "review"];

export function VideosGallery({ initialVideos, influencers = [] }: { initialVideos: Video[]; influencers?: LibraryInfluencer[] }) {
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [finalizing, setFinalizing] = useState<Set<string>>(() => new Set());
  const [finalizationErrors, setFinalizationErrors] = useState<Record<string, string>>({});
  const activeFinalizations = useRef(new Map<string, AbortController>());
  const pollRevision = useRef(0);
  const pollInFlight = useRef(false);
  const [pollError, setPollError] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const hasPending = videos.some((v) => v.status === "processing" || v.status === "queued");
  const influencerName = useMemo(() => new Map(influencers.map((item) => [item.id, item.name])), [influencers]);

  useEffect(() => () => {
    for (const controller of activeFinalizations.current.values()) controller.abort();
    activeFinalizations.current.clear();
    pollRevision.current++;
  }, []);

  // Atualização automática das gerações em andamento: só troca os registros, sem mexer em filtros ou players.
  useEffect(() => {
    if (!hasPending) return;
    let disposed = false;
    const timer = setInterval(() => {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      const revision = pollRevision.current;
      pollVideosAction()
        .then(items => {
          if (disposed || revision !== pollRevision.current) return;
          setPollError("");
          setVideos(current => items.map(item => activeFinalizations.current.has(item.id) ? current.find(video => video.id === item.id) ?? item : item));
        })
        .catch(() => { if (!disposed) setPollError("Não foi possível atualizar as gerações agora. Os pedidos foram preservados; a consulta será repetida sem gerar outro vídeo."); })
        .finally(() => { pollInFlight.current = false; });
    }, 4000);
    return () => { disposed = true; clearInterval(timer); };
  }, [hasPending]);

  async function cancel(video: Video) {
    if (cancelling) return;
    setCancelling(video.id);
    try {
      const result = await cancelVideoAction(video.id);
      if ("error" in result) { setPollError(result.error); return; }
      pollRevision.current++;
      setVideos(await pollVideosAction());
    } catch { setPollError("Não foi possível cancelar agora. Tente novamente."); }
    finally { setCancelling(null); }
  }

  async function remove(video: Video) {
    try {
      await deleteVideoAction(video.id);
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
      if (activeId === video.id) setActiveId(null);
    } catch { setPollError("Não foi possível excluir este vídeo. Aguarde a confirmação do pedido e tente novamente."); }
  }

  async function finalize(video: Video) {
    if (!canFinalizeExistingEdit(video) || activeFinalizations.current.has(video.id)) return;
    const controller = new AbortController();
    activeFinalizations.current.set(video.id, controller);
    pollRevision.current++;
    setFinalizing(current => new Set(current).add(video.id));
    setFinalizationErrors(current => ({ ...current, [video.id]: "" }));
    try {
      const result = await finalizeEditClient(video.id, { signal: controller.signal });
      if (activeFinalizations.current.get(video.id) !== controller) return;
      pollRevision.current++;
      if (result.video) setVideos(current => current.map(item => item.id === video.id ? result.video! : item));
      if (result.error) setFinalizationErrors(current => ({ ...current, [video.id]: result.error! }));
    } catch (error) {
      if (activeFinalizations.current.get(video.id) !== controller) return;
      setFinalizationErrors(current => ({ ...current, [video.id]: error instanceof Error ? error.message : "Não foi possível confirmar a finalização. Atualize a página para conferir o vídeo." }));
    } finally {
      if (activeFinalizations.current.get(video.id) === controller) {
        activeFinalizations.current.delete(video.id);
        pollRevision.current++;
        setFinalizing(current => { const next = new Set(current); next.delete(video.id); return next; });
      }
    }
  }

  const titleOf = useCallback((video: Video) => videoTitle(video), []);
  const list = useMemo(() => filterVideos(videos, filters, titleOf), [videos, filters, titleOf]);
  const counts = useMemo(() => countByStatus(videos), [videos]);
  const kinds = useMemo(() => (["motion", "viral", "custom"] as VideoKind[]).filter((kind) => videos.some((video) => video.kind === kind)), [videos]);
  const usedInfluencers = useMemo(() => influencers.filter((item) => videos.some((video) => video.influencerId === item.id)), [influencers, videos]);
  const active = activeId ? videos.find((video) => video.id === activeId) ?? null : null;
  const activeFilters = activeFilterCount(filters);

  const open = (video: Video, trigger: HTMLElement | null) => { returnFocus.current = trigger; setActiveId(video.id); };
  const close = () => { setActiveId(null); const target = returnFocus.current; returnFocus.current = null; target?.focus(); };
  const set = (patch: Partial<LibraryFilters>) => setFilters((current) => ({ ...current, ...patch }));

  if (!videos.length) {
    return (
      <div className={styles.empty}>
        <Film size={28} aria-hidden="true" />
        <b>Nenhum vídeo ainda</b>
        <p>Aplique um movimento no seu influencer ou duplique uma tendência viral.</p>
        <div className={styles.emptyActions}>
          <Link href="/app/criar-videos" className="btn btn-accent"><Wand2 size={16} aria-hidden="true" /> Criar meu primeiro vídeo</Link>
          <Link href="/app/virais" className="btn btn-ghost"><Flame size={16} aria-hidden="true" /> Ver tendências</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.library}>
      {pollError ? <p role="status" className={styles.pollError}>{pollError}</p> : null}

      <div className={styles.filters}>
        <div className={styles.chips} role="group" aria-label="Estado">
          {STATUS_FILTERS.filter((status) => status === "all" || status !== "review" || counts.review > 0).map((status) => (
            <button key={status} type="button" className={styles.chip} data-active={filters.status === status} aria-pressed={filters.status === status} onClick={() => set({ status })}>
              {status === "all" ? "Todos" : LIBRARY_STATUS_LABEL[status]}
              <span className={styles.count}>{status === "all" ? videos.length : counts[status]}</span>
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input className="input" aria-label="Buscar por título" placeholder="Buscar por título" value={filters.query} onChange={(event) => set({ query: event.target.value })} />
        </label>
        {usedInfluencers.length ? (
          <label className={styles.select}>
            <span className="sr-only">Influencer</span>
            <select className="input" value={filters.influencerId} onChange={(event) => set({ influencerId: event.target.value })}>
              <option value="">Todos os influencers</option>
              {usedInfluencers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        ) : null}
        {kinds.length > 1 ? (
          <label className={styles.select}>
            <span className="sr-only">Tipo</span>
            <select className="input" value={filters.kind} onChange={(event) => set({ kind: event.target.value as LibraryFilters["kind"] })}>
              <option value="all">Todos os tipos</option>
              {kinds.map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
            </select>
          </label>
        ) : null}
        <label className={styles.select}>
          <span className="sr-only">Ordenar</span>
          <select className="input" value={filters.sort} onChange={(event) => set({ sort: event.target.value as LibraryFilters["sort"] })}>
            <option value="newest">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
          </select>
        </label>
      </div>

      <div className={styles.resultsRow} aria-live="polite">
        <span>{list.length} de {videos.length} {videos.length === 1 ? "vídeo" : "vídeos"}{hasPending ? " · gerações em andamento atualizam sozinhas" : ""}</span>
        {activeFilters ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters(DEFAULT_FILTERS)}><X size={14} aria-hidden="true" /> Limpar filtros ({activeFilters})</button> : null}
      </div>

      {list.length ? (
        <ul className={styles.grid} aria-label="Vídeos">
          {list.map((video) => (
            <li key={video.id}>
              <VideoCard
                video={video}
                influencer={video.influencerId ? influencerName.get(video.influencerId) : undefined}
                finalizing={finalizing.has(video.id)}
                cancelling={cancelling === video.id}
                onOpen={(trigger) => open(video, trigger)}
                onFinalize={() => void finalize(video)}
                onCancel={() => setConfirmation({ kind: "cancel", video })}
                onDelete={() => setConfirmation({ kind: "delete", video })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <Search size={24} aria-hidden="true" />
          <b>Nenhum vídeo com esses filtros</b>
          <p>Ajuste a busca, o estado, o influencer ou o tipo.</p>
          <div className={styles.emptyActions}><button type="button" className="btn btn-ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>Limpar filtros</button></div>
        </div>
      )}

      {active ? (
        <VideoDetailDialog
          video={active}
          influencer={active.influencerId ? influencerName.get(active.influencerId) : undefined}
          finalizing={finalizing.has(active.id)}
          finalizationError={finalizationErrors[active.id] && finalizationErrors[active.id] !== active.error ? finalizationErrors[active.id] : undefined}
          cancelling={cancelling === active.id}
          onClose={close}
          onFinalize={() => void finalize(active)}
          onCancel={() => setConfirmation({ kind: "cancel", video: active })}
          onDelete={() => setConfirmation({ kind: "delete", video: active })}
        />
      ) : null}

      {confirmation ? (
        <ConfirmDialog
          title={confirmation.kind === "delete" ? "Excluir vídeo?" : "Cancelar esta geração?"}
          description={confirmation.kind === "delete"
            ? `"${videoTitle(confirmation.video)}" de ${displayDate(confirmation.video.createdAt, "short")} sairá da sua biblioteca. Esta ação não pode ser desfeita.`
            : "Se a IA ainda não tiver começado, os créditos voltam. Se já começou, ela pode cobrar o que processou."}
          confirmLabel={confirmation.kind === "delete" ? "Excluir" : "Cancelar geração"}
          danger={confirmation.kind === "delete"}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => { const { kind, video } = confirmation; setConfirmation(null); if (kind === "delete") void remove(video); else void cancel(video); }}
        />
      ) : null}
    </div>
  );
}

function canCancel(video: Video): boolean {
  return Boolean(video.edit && video.edit.provider === "fal" && !video.edit.cancelledAt && (video.status === "queued" || video.status === "processing") && !video.finalizationStartedAt);
}

function VideoCard({ video, influencer, finalizing, cancelling, onOpen, onFinalize, onCancel, onDelete }: {
  video: Video; influencer?: string; finalizing: boolean; cancelling: boolean;
  onOpen: (trigger: HTMLElement | null) => void; onFinalize: () => void; onCancel: () => void; onDelete: () => void;
}) {
  const status = libraryStatus(video);
  const title = videoTitle(video);
  const duration = resultDuration(video);
  const playable = Boolean(video.resultUrl) && (status === "completed" || status === "review");
  const label = statusLabel(video, finalizing);
  const deletable = !finalizing && canDeleteVideo(video);
  const menuId = useId();
  return (
    <article className={styles.card} data-status={status}>
      <div className={styles.media}>
        {playable ? (
          <button type="button" className={styles.coverButton} onClick={(event) => onOpen(event.currentTarget)} aria-label={`Ver vídeo: ${title}`}>
            <VideoCover videoId={video.id} thumbnailUrl={video.thumbnailSourceUrl === video.resultUrl ? video.thumbnailUrl : undefined} title={title} />
            <span className={styles.play} aria-hidden="true"><Play size={16} fill="currentColor" /></span>
          </button>
        ) : (
          <div className={styles.placeholder} role="img" aria-label={`${label}: ${title}`}>
            {status === "generating" || finalizing ? <><span className="spinner" aria-hidden="true" /><span>{finalizing ? "Finalizando vídeo e áudio…" : video.finalizationStartedAt ? "Conferindo vídeo e preservando áudio…" : "Gerando o vídeo…"}</span></> : <><Film size={24} strokeWidth={1.3} aria-hidden="true" /><span>{status === "failed" ? "Sem resultado" : "Resultado pendente"}</span></>}
          </div>
        )}
        <span className={styles.status} data-status={finalizing ? "generating" : status}>{label}</span>
        {duration !== undefined ? <span className={styles.duration}>{durationLabel(duration)}</span> : null}
      </div>
      <div className={styles.body}>
        <h3 title={video.prompt}>{title}</h3>
        <p className={styles.meta}>
          {influencer ? <span>{influencer}</span> : null}
          <span>{displayDate(video.createdAt, "short")}</span>
          {video.edit ? <span>{editModelLabel(video.edit.model)}</span> : <span>{KIND_LABEL[video.kind] ?? "Vídeo"}</span>}
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={(event) => onOpen(event.currentTarget)}><Eye size={15} aria-hidden="true" /> {status === "generating" ? "Acompanhar" : "Ver vídeo"}</button>
          {canDownload(video) ? (
            <a className={styles.secondary} href={video.resultUrl} download target="_blank" rel="noreferrer" aria-label={`Baixar vídeo: ${title}`}><Download size={15} aria-hidden="true" /> Baixar</a>
          ) : hasReviewResult(video) ? (
            <a className={styles.secondary} href={video.resultUrl} target="_blank" rel="noreferrer" aria-label={`Abrir resultado para revisão: ${title}`}><Eye size={15} aria-hidden="true" /> Revisar</a>
          ) : null}
          <details className={styles.menu}>
            <summary aria-label={`Mais ações: ${title}`} aria-haspopup="menu" title="Mais ações"><MoreHorizontal size={16} aria-hidden="true" /></summary>
            <div className={styles.menuList} role="menu" id={menuId}>
              {canDownload(video) ? <Link role="menuitem" href={`/app/publicar?video=${video.id}`}><Send size={14} aria-hidden="true" /> Preparar publicação</Link> : null}
              {canFinalizeExistingEdit(video) ? <button type="button" role="menuitem" disabled={finalizing} onClick={onFinalize}><Film size={14} aria-hidden="true" /> Finalizar vídeo completo</button> : null}
              {canCancel(video) ? <button type="button" role="menuitem" disabled={cancelling} onClick={onCancel}><Ban size={14} aria-hidden="true" /> {cancelling ? "Cancelando…" : "Cancelar geração"}</button> : null}
              {video.edit?.cancelledAt && video.influencerId ? <Link role="menuitem" href={`/app/criar-videos?influencer=${encodeURIComponent(video.influencerId)}`}><RotateCcw size={14} aria-hidden="true" /> Gerar de novo</Link> : null}
              <button type="button" role="menuitem" className={styles.menuDanger} disabled={!deletable} title={deletable ? undefined : "Aguarde a confirmação do pedido para excluir"} onClick={onDelete}><Trash2 size={14} aria-hidden="true" /> Excluir</button>
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

type Tab = "result" | "compare" | "info";

export function VideoDetailDialog({ video, influencer, finalizing, finalizationError, cancelling, onClose, onFinalize, onCancel, onDelete }: {
  video: Video; influencer?: string; finalizing: boolean; finalizationError?: string; cancelling: boolean;
  onClose: () => void; onFinalize: () => void; onCancel: () => void; onDelete: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tab, setTab] = useState<Tab>("result");
  const status = libraryStatus(video);
  const title = videoTitle(video);
  const warning = videoWarning(video);
  const duration = resultDuration(video);
  const playable = Boolean(video.resultUrl) && (status === "completed" || status === "review");
  const deletable = !finalizing && canDeleteVideo(video);

  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);
  // Trocar de vídeo volta para o resultado; o player antigo é desmontado (para de tocar).
  useEffect(() => { setTab("result"); }, [video.id]);

  const close = () => { dialog.current?.close(); onClose(); };
  const tabs: Array<[Tab, string]> = [["result", "Resultado"], ...(video.edit ? [["compare", "Comparar original"] as [Tab, string]] : []), ["info", "Informações"]];

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}>
      <div className={styles.dialogHead}>
        <div className={styles.dialogTitle}>
          <span className={styles.status} data-status={finalizing ? "generating" : status} data-inline="true">{statusLabel(video, finalizing)}</span>
          <h2 id={titleId}>{title}</h2>
          <p className={styles.meta}>
            {influencer ? <span>{influencer}</span> : null}
            <span>{displayDate(video.createdAt, "short")}</span>
            {duration !== undefined ? <span>{durationLabel(duration)}</span> : null}
          </p>
        </div>
        <button type="button" className={styles.dialogClose} aria-label="Fechar" onClick={close}><X size={16} aria-hidden="true" /></button>
      </div>

      {warning ? <p role={status === "failed" || status === "review" ? "alert" : "status"} className={styles.warning} data-level={status === "failed" ? "danger" : "warn"}>{warning}</p> : null}
      {finalizationError ? <p role="alert" className={styles.warning} data-level="danger">{finalizationError}</p> : null}

      <div className={styles.tabs} role="tablist" aria-label="Detalhes do vídeo">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-active={tab === id} className={styles.tab} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className={styles.dialogBody}>
        {tab === "result" ? (
          <div className={styles.stage}>
            {finalizing ? (
              <div className={styles.placeholder} role="status"><span className="spinner" aria-hidden="true" /><span>Finalizando vídeo e áudio…</span></div>
            ) : playable ? (
              <VideoPreview key={`${video.id}:${video.resultUrl}`} videoId={video.id} src={video.resultUrl!} thumbnailUrl={video.thumbnailSourceUrl === video.resultUrl ? video.thumbnailUrl : undefined} loop title={`${status === "completed" ? "Vídeo completo" : "Resultado para revisão"}: ${title}`} />
            ) : (
              <div className={styles.placeholder} role="status">
                {status === "generating" ? <><span className="spinner" aria-hidden="true" /><span>{video.finalizationStartedAt ? "Conferindo vídeo e preservando áudio…" : "Gerando o vídeo… esta janela atualiza sozinha."}</span></> : <><Film size={24} strokeWidth={1.3} aria-hidden="true" /><span>Não há arquivo de resultado para este vídeo.</span></>}
              </div>
            )}
          </div>
        ) : null}

        {tab === "compare" && video.edit ? (
          <div className={styles.compare}>
            <figure>
              <figcaption>Original</figcaption>
              <div className={styles.stage}><VideoPreview src={video.edit.sourceUrl} title={`Original de ${title}`} /></div>
            </figure>
            <figure>
              <figcaption>{status === "completed" ? "Resultado" : "Resultado para revisão"}</figcaption>
              <div className={styles.stage}>
                {playable ? <VideoPreview videoId={video.id} src={video.resultUrl!} thumbnailUrl={video.thumbnailSourceUrl === video.resultUrl ? video.thumbnailUrl : undefined} title={`Resultado de ${title}`} /> : <div className={styles.placeholder} role="status"><Film size={24} strokeWidth={1.3} aria-hidden="true" /><span>Resultado ainda não disponível.</span></div>}
              </div>
            </figure>
            <p className={styles.target}><strong>Alvo da edição:</strong> {video.edit.target}</p>
          </div>
        ) : null}

        {tab === "info" ? (
          <div className={styles.info}>
            <dl>
              <dt>Estado</dt><dd>{statusLabel(video, finalizing)}</dd>
              <dt>Criado em</dt><dd>{displayDate(video.createdAt, "short")}</dd>
              <dt>Tipo</dt><dd>{video.edit ? "Troca de personagem" : KIND_LABEL[video.kind] ?? "Vídeo"}</dd>
              {influencer ? <><dt>Influencer</dt><dd>{influencer}</dd></> : null}
              {video.edit ? <>
                <dt>Modelo</dt><dd>{editModelLabel(video.edit.model)}</dd>
                <dt>Resolução</dt><dd>{video.edit.resolution === "auto" ? "automática" : video.edit.resolution}{video.edit.result ? ` · resultado ${video.edit.result.width} × ${video.edit.result.height}` : ""}</dd>
                <dt>Duração</dt><dd>Original {video.edit.source.duration.toFixed(2)} s{video.edit.result ? ` · resultado ${video.edit.result.duration.toFixed(2)} s` : ""}</dd>
                <dt>Áudio</dt><dd>{video.edit.audioPreserved ? (status === "review" ? "Original preservado · confira o aviso da edição" : "Original preservado · duração e proporção conferidas") : "Sem confirmação de áudio preservado"}</dd>
                {video.edit.provider ? <><dt>Provedor</dt><dd>{video.edit.provider}</dd></> : null}
              </> : null}
              {video.presetName && video.prompt ? <><dt>Instrução</dt><dd className={styles.prompt}>{video.prompt}</dd></> : null}
              {video.requestId && video.requestId !== "demo" ? <><dt>Pedido</dt><dd className={styles.mono}>{video.requestId}</dd></> : null}
            </dl>
            {video.edit?.segments && video.edit.segments.length > 1 ? (
              <section className={styles.segments} aria-labelledby={`${titleId}-segments`}>
                <h3 id={`${titleId}-segments`}>Trechos gerados antes da finalização ({video.edit.segments.length})</h3>
                <p>Estes são os arquivos separados recebidos da IA. Não são o vídeo completo: o áudio original é restaurado no vídeo completo após a finalização.</p>
                <ul>
                  {video.edit.segments.map((part, index) => (
                    <li key={part.sourceUrl}>
                      <p>Trecho {index + 1} · {part.source.duration.toFixed(2)} s{part.requestId ? ` · Pedido ${part.requestId}` : ""}{part.resultUrl ? "" : " · sem resultado ainda"}</p>
                      {part.resultUrl ? <div className={styles.segmentStage}><VideoPreview src={part.resultUrl} title={`Resultado do trecho ${index + 1}`} /></div> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={styles.dialogActions}>
        {canDownload(video) ? <a className="btn btn-accent" href={video.resultUrl} download target="_blank" rel="noreferrer"><Download size={16} aria-hidden="true" /> Baixar vídeo completo</a> : null}
        {canDownload(video) ? <Link className="btn btn-ghost" href={`/app/publicar?video=${video.id}`}><Send size={16} aria-hidden="true" /> Preparar publicação</Link> : null}
        {hasReviewResult(video) ? <a className="btn btn-ghost" href={video.resultUrl} target="_blank" rel="noreferrer"><Eye size={16} aria-hidden="true" /> Abrir resultado para revisão</a> : null}
        {canFinalizeExistingEdit(video) ? <button type="button" className="btn btn-accent" disabled={finalizing} onClick={onFinalize}>{finalizing ? <><span className="spinner" aria-hidden="true" /> Finalizando vídeo e áudio…</> : <><Film size={16} aria-hidden="true" /> Finalizar vídeo completo</>}</button> : null}
        {canCancel(video) ? <button type="button" className="btn btn-ghost" disabled={cancelling} onClick={onCancel}><Ban size={16} aria-hidden="true" /> {cancelling ? "Cancelando…" : "Cancelar geração"}</button> : null}
        {video.edit?.cancelledAt && video.influencerId ? <Link className="btn btn-accent" href={`/app/criar-videos?influencer=${encodeURIComponent(video.influencerId)}`}><RotateCcw size={16} aria-hidden="true" /> Gerar de novo</Link> : null}
        <button type="button" className={`btn btn-ghost ${styles.deleteButton}`} disabled={!deletable} title={deletable ? undefined : "Aguarde a confirmação do pedido para excluir"} onClick={onDelete}><Trash2 size={16} aria-hidden="true" /> Excluir</button>
      </div>
      {canFinalizeExistingEdit(video) ? <p className={styles.footnote}><Info size={13} aria-hidden="true" /> Finalizar reúne os resultados disponíveis e restaura o áudio original. Sem nova geração ou cobrança de créditos.</p> : null}
    </dialog>
  );
}

function ConfirmDialog({ title, description, confirmLabel, danger, onConfirm, onCancel }: { title: string; description: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return (
    <dialog ref={dialog} className={styles.confirm} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onCancel(); }}>
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
      <div className={styles.confirmActions}>
        <button type="button" className="btn btn-ghost" onClick={onCancel} autoFocus>Voltar</button>
        <button type="button" className={`btn ${danger ? styles.dangerButton : "btn-accent"}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
