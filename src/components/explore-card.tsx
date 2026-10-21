"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Clock3, Download as DownloadIcon, ExternalLink, Eye, Heart, MessageCircle, Play, RefreshCw, X } from "lucide-react";

import { refreshViralMediaAction } from "@/app/actions/virals";
import { formatViews } from "@/data/viral-effects";
import { displayDate } from "@/lib/display-date";
import { durationLabel, PLATFORM_LABEL, relativeTime } from "@/lib/explore-format";
import type { ExploreItem } from "@/lib/explore-items";
import { TikTokReferencePlayer } from "./tiktok-reference-player";
import styles from "./explore-virals.module.css";

/* Card, modal e players compartilhados pelas três áreas de Explorar virais. */

export function PlatformMark({ platform, size = 13 }: { platform: ExploreItem["platform"]; size?: number }) {
  if (platform === "instagram") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    );
  }
  if (platform === "youtube") {
    return (
      <svg width={size + 2} height={size} viewBox="0 0 24 17" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M23.5 2.7a3 3 0 0 0-2.1-2.1C19.5 0 12 0 12 0S4.5 0 2.6.6A3 3 0 0 0 .5 2.7 31 31 0 0 0 0 8.5a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-5.8 31 31 0 0 0-.5-5.8zM9.6 12.1V4.9l6.2 3.6-6.2 3.6z" />
      </svg>
    );
  }
  if (platform === "tiktok") {
    return (
      <svg width={size} height={size + 1} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M16.5 2h-3.2v13.1a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.1a6.1 6.1 0 1 0 5.2 6V8.6a7.3 7.3 0 0 0 4.3 1.4V6.8A4.3 4.3 0 0 1 16.5 2z" />
      </svg>
    );
  }
  return <ExternalLink size={size} aria-hidden="true" />;
}

export function Metrics({ item, detailed = false }: { item: ExploreItem; detailed?: boolean }) {
  const entries = [
    item.views ? { icon: <Eye size={13} aria-hidden="true" />, label: "visualizações", value: formatViews(item.views) } : null,
    item.likes ? { icon: <Heart size={13} aria-hidden="true" />, label: "curtidas", value: formatViews(item.likes) } : null,
    item.comments ? { icon: <MessageCircle size={13} aria-hidden="true" />, label: "comentários", value: formatViews(item.comments) } : null,
  ].filter((entry): entry is { icon: React.ReactElement; label: string; value: string } => entry !== null);
  if (!entries.length) return <span className={styles.metricsNone}>{detailed ? "Métricas não informadas pela fonte" : "Sem métricas"}</span>;
  return (
    <span className={styles.metrics}>
      {entries.map((entry) => <span key={entry.label} title={entry.label}>{entry.icon}{entry.value}<span className="sr-only"> {entry.label}</span></span>)}
    </span>
  );
}

export function originLabel(item: ExploreItem, now: number): string {
  if (item.origin === "catalog") return "Catálogo verificado";
  return `${PLATFORM_LABEL[item.platform]} · descoberto ${item.discoveredAt ? relativeTime(item.discoveredAt, now) : ""}`.trim();
}

export function ExploreCard({ item, now, badge, onOpen, onUse, compact = false }: {
  item: ExploreItem;
  now: number;
  /** Selo extra (ex.: "Inspiração"); "Novo" aparece sozinho quando é o caso. */
  badge?: string;
  onOpen: () => void;
  onUse?: (href: string) => void;
  compact?: boolean;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const useTitle = item.useHref
    ? "Usar o movimento deste vídeo com seu influencer"
    : item.unavailableAt
      ? "O vídeo não está mais disponível na origem"
      : !item.playUrl
        ? "Sem arquivo de vídeo: assista na origem"
        : "A transferência de movimento exige vídeo de 3 a 30 segundos";
  return (
    <article className={styles.card} data-new={item.isNew} data-unavailable={Boolean(item.unavailableAt)} data-compact={compact}>
      <div className={styles.media}>
        <button type="button" className={styles.cover} onClick={onOpen} aria-label={`Assistir: ${item.title}`}>
          {item.coverUrl && !coverFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.coverUrl} alt="" loading="lazy" decoding="async" onError={() => setCoverFailed(true)} />
          ) : <span className={styles.coverFallback} aria-hidden="true"><Play size={22} /></span>}
          <span className={styles.play} aria-hidden="true"><Play size={16} fill="currentColor" /></span>
        </button>
        <span className={styles.platform} title={PLATFORM_LABEL[item.platform]}><PlatformMark platform={item.platform} /><span className="sr-only">{PLATFORM_LABEL[item.platform]}</span></span>
        {item.isNew ? <span className={styles.newBadge}>Novo</span> : badge ? <span className={styles.softBadge}>{badge}</span> : null}
        {item.duration ? <span className={styles.duration}>{durationLabel(item.duration)}</span> : null}
        {item.unavailableAt ? <span className={styles.unavailable}>Indisponível na origem</span> : !item.playUrl && !item.embed ? <span className={styles.originOnly}>Ver na origem</span> : null}
      </div>
      <div className={styles.body}>
        <h3 title={item.title}>{item.title}</h3>
        <a className={styles.author} href={item.pageUrl} target="_blank" rel="noreferrer">@{item.authorHandle || item.authorName}</a>
        <Metrics item={item} />
        <span className={styles.origin}>{originLabel(item, now)}</span>
        {onUse ? (
          <div className={styles.actions}>
            <button type="button" className={styles.use} disabled={!item.useHref} onClick={() => item.useHref && onUse(item.useHref)} title={useTitle}>
              Usar referência <ArrowUpRight size={15} aria-hidden="true" />
            </button>
            <a className={styles.iconLink} href={item.pageUrl} target="_blank" rel="noreferrer" aria-label={`Abrir publicação original de @${item.authorHandle || item.authorName}`} title="Abrir publicação original">
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ExploreDialog({ item, now, onClose, onUse, children }: {
  item: ExploreItem;
  now: number;
  onClose: () => void;
  onUse?: (href: string) => void;
  /** Conteúdo extra abaixo dos metadados (ex.: aviso de inspiração). */
  children?: React.ReactNode;
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
  const close = () => { dialog.current?.close(); onClose(); };
  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}>
      <button type="button" className={styles.dialogClose} aria-label="Fechar vídeo" onClick={close}><X size={16} aria-hidden="true" /></button>
      <div className={styles.dialogBody}>
        <div className={styles.dialogPlayer}>
          <ItemPlayer key={item.id} item={item} />
        </div>
        <div className={styles.dialogInfo}>
          <span className={styles.dialogPlatform}><PlatformMark platform={item.platform} size={14} /> {PLATFORM_LABEL[item.platform]} · {item.origin === "catalog" ? "catálogo verificado" : "coleta automática"}</span>
          <h2 id={titleId}>{item.title}</h2>
          <a href={item.pageUrl} target="_blank" rel="noreferrer" className={styles.author}>@{item.authorHandle || item.authorName}</a>
          <Metrics item={item} detailed />
          <dl className={styles.dialogMeta}>
            {item.duration ? <><dt><Clock3 size={13} aria-hidden="true" /> Duração</dt><dd>{durationLabel(item.duration)}</dd></> : null}
            {item.publishedAt ? <><dt>Publicado</dt><dd>{displayDate(item.publishedAt, "short")}</dd></> : null}
            <dt>Descoberto</dt><dd>{item.discoveredAt ? relativeTime(item.discoveredAt, now) : "catálogo verificado (sem data de coleta)"}</dd>
            {item.metricsAt ? <><dt>Métricas</dt><dd>observadas {relativeTime(item.metricsAt, now)}</dd></> : null}
            {item.musicTitle ? <><dt>Música</dt><dd>{item.musicTitle}</dd></> : null}
          </dl>
          {item.unavailableAt ? <p className={styles.dialogWarning}>A origem deixou de devolver este vídeo em {displayDate(item.unavailableAt, "short")}. O arquivo salvo pode ainda tocar, mas não serve mais como referência.</p> : null}
          {children}
          <div className={styles.dialogActions}>
            {onUse ? <button type="button" className="btn btn-accent" disabled={!item.useHref} onClick={() => { if (item.useHref) { close(); onUse(item.useHref); } }} title={item.useHref ? undefined : item.playUrl ? "A transferência de movimento exige vídeo de 3 a 30 segundos" : "Sem arquivo de vídeo para usar como referência"}>Usar referência <ArrowUpRight size={15} aria-hidden="true" /></button> : null}
            <a className="btn btn-ghost" href={item.pageUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden="true" /> Abrir original</a>
            {item.playUrl ? <a className="btn btn-ghost" href={item.playUrl} target="_blank" rel="noreferrer"><DownloadIcon size={15} aria-hidden="true" /> Baixar</a> : null}
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** Arquivo próprio → player interno; sem arquivo → player oficial (TikTok/YouTube) ou capa + origem. */
function ItemPlayer({ item }: { item: ExploreItem }) {
  if (item.playUrl) return <FileVideo item={item} />;
  if (item.embed?.kind === "youtube") {
    return (
      <div className={styles.player} data-embed="youtube">
        <iframe src={`https://www.youtube-nocookie.com/embed/${item.embed.id}?autoplay=1&playsinline=1&rel=0`} title={item.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    );
  }
  if (item.embed?.kind === "tiktok") {
    return (
      <div className={styles.player} data-embed="tiktok">
        <TikTokReferencePlayer id={item.embed.id} title={item.title} poster={item.coverUrl} sourceUrl={item.pageUrl} active onPlay={() => undefined} />
      </div>
    );
  }
  return (
    <div className={styles.player} data-embed="none">
      {item.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.coverUrl} alt="" />
      ) : null}
      <div className={styles.playerOverlay} role="status">
        <span>Este vídeo não tem arquivo nem player embutido aqui.</span>
        <a className="btn btn-ghost btn-sm" href={item.pageUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" />Assistir no {PLATFORM_LABEL[item.platform]}</a>
      </div>
    </div>
  );
}

/** Controles nativos funcionam no toque e no teclado. Links do TikTok que expiram ganham uma renovação automática. */
function FileVideo({ item }: { item: ExploreItem }) {
  const [src, setSrc] = useState(item.playUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const attempted = useRef(false);
  const video = useRef<HTMLVideoElement>(null);

  const renew = async () => {
    if (refreshing || !item.viralId) return;
    attempted.current = true;
    setRefreshing(true);
    setMessage(null);
    try {
      const result = await refreshViralMediaAction(item.viralId);
      if ("error" in result) { setMessage(result.error); return; }
      setSrc(result.viral.playUrl);
      if (video.current) {
        video.current.src = result.viral.playUrl;
        video.current.load();
        void video.current.play().catch(() => undefined);
      }
    } catch { setMessage("Não foi possível carregar o vídeo agora."); }
    finally { setRefreshing(false); }
  };

  const failed = () => {
    if (item.platform === "tiktok" && item.viralId && !attempted.current) { void renew(); return; }
    setMessage("O arquivo deste vídeo não carregou. Tente novamente ou abra o original.");
  };

  return (
    <div className={styles.player}>
      <video ref={video} src={src} poster={item.coverUrl || undefined} controls preload="metadata" playsInline autoPlay onError={failed}
        onPlay={() => { document.querySelectorAll("video").forEach((other) => { if (other !== video.current) other.pause(); }); }}
        aria-label={item.title} />
      {refreshing || message ? (
        <div role="status" className={styles.playerOverlay}>
          {refreshing ? <><span className="spinner" />Atualizando o vídeo…</> : <>
            <span>{message}</span>
            {item.viralId ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => void renew()}><RefreshCw size={14} aria-hidden="true" />Tentar novamente</button> : null}
            <a className="btn btn-ghost btn-sm" href={item.pageUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" />Ver original</a>
          </>}
        </div>
      ) : null}
    </div>
  );
}
