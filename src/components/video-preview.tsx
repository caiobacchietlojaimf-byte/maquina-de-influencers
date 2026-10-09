"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Play, RefreshCw } from "lucide-react";
import styles from "./video-preview.module.css";

export type VideoCoverProps = {
  videoId?: string;
  thumbnailUrl?: string;
  title: string;
  className?: string;
  fit?: "cover" | "contain";
};

/** Covers never mount a video or request its media URL in the browser. */
export function VideoCover(props: VideoCoverProps) {
  return <VideoCoverImage key={`${props.videoId ?? ""}:${props.thumbnailUrl ?? ""}`} {...props} />;
}

function VideoCoverImage({ videoId, thumbnailUrl, title, className, fit = "cover" }: VideoCoverProps) {
  const endpoint = videoId ? `/api/videos/${encodeURIComponent(videoId)}/thumbnail` : undefined;
  const [source, setSource] = useState(thumbnailUrl || endpoint);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const retries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    // Cached images can finish before hydration attaches the load handler.
    if (image.current?.complete && image.current.naturalWidth > 0) {
      setLoaded(true);
      setFailed(false);
    }
  }, [source]);

  function retryCover() {
    setLoaded(false);
    setFailed(true);
    if (!endpoint || retries.current >= 2 || timer.current) return;
    const attempt = ++retries.current;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setSource(`${endpoint}?retry=${attempt}`);
      setFailed(false);
    }, attempt === 1 ? 1500 : 4000);
  }

  return <div className={`${styles.cover} ${className ?? ""}`} data-loaded={loaded}>
    {!loaded ? <span className={styles.coverFallback} role="img" aria-label={failed ? `Capa indisponível: ${title}` : `Vídeo: ${title}`}><Film size={28} strokeWidth={1.3} aria-hidden="true" /></span> : null}
    {source && !failed ? <img
      ref={image}
      src={source}
      alt={`Capa de ${title}`}
      loading="lazy"
      decoding="async"
      className={styles.coverImage}
      style={{ objectFit: fit }}
      onLoad={() => { setLoaded(true); setFailed(false); }}
      onError={retryCover}
    /> : null}
  </div>;
}

export type VideoPreviewProps = VideoCoverProps & { src: string; loop?: boolean };

/** A new source always returns to its cover, even when the previous clip was playing. */
export function VideoPreview(props: VideoPreviewProps) {
  return <VideoPreviewMedia key={`${props.videoId ?? ""}:${props.src}`} {...props} />;
}

function VideoPreviewMedia({ src, videoId, thumbnailUrl, title, className, fit = "contain", loop = false }: VideoPreviewProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "buffering" | "error">("idle");
  const [attempt, setAttempt] = useState(0);
  const activeAttempt = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const failed = useRef(false);
  const started = status !== "idle" && status !== "error";

  useEffect(() => () => { activeAttempt.current++; }, []);

  useEffect(() => {
    if (status !== "loading" && status !== "buffering") return;
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      failed.current = true;
      setStatus("error");
    }, 30_000);
    return () => { active = false; clearTimeout(timer); };
  }, [status, attempt]);

  useEffect(() => {
    if (attempt) video.current?.focus({ preventScroll: true });
    // Focus transfers once per explicit play/retry, never after media events.
  }, [attempt]);

  useEffect(() => {
    if (!started) return;
    const element = video.current;
    return () => {
      element?.pause();
      element?.removeAttribute("src");
      element?.load();
    };
  }, [started, attempt]);

  function play() {
    failed.current = false;
    setAttempt(++activeAttempt.current);
    setStatus("loading");
  }
  function ready() { if (!failed.current && attempt === activeAttempt.current) setStatus("ready"); }
  function error() {
    if (attempt !== activeAttempt.current) return;
    failed.current = true;
    setStatus("error");
  }

  return <div className={`${styles.preview} ${className ?? ""}`} data-state={status}>
    {status !== "ready" && status !== "buffering" ? <VideoCover videoId={videoId} thumbnailUrl={thumbnailUrl} title={title} fit={fit} /> : null}
    {started ? <video
      key={attempt}
      ref={video}
      src={src}
      controls
      autoPlay
      playsInline
      loop={loop}
      preload="auto"
      tabIndex={0}
      aria-label={title}
      className={styles.player}
      style={{ objectFit: fit }}
      onLoadedData={ready}
      onCanPlay={ready}
      onPlaying={ready}
      onWaiting={() => { if (!failed.current && attempt === activeAttempt.current) setStatus(current => current === "ready" ? "buffering" : current); }}
      onError={error}
    /> : null}
    {status === "idle" ? <button type="button" className={styles.playButton} onClick={play} aria-label={`Reproduzir ${title}`}>
      <span className={styles.playLabel}><Play size={18} fill="currentColor" aria-hidden="true" /><span>Reproduzir</span></span>
    </button> : null}
    {status === "loading" || status === "buffering" ? <div className={styles.loading} role="status">{status === "loading" ? "Abrindo vídeo…" : "Retomando vídeo…"}</div> : null}
    {status === "error" ? <div className={styles.failure}>
      <p role="status">Não foi possível carregar o vídeo.</p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={play}><RefreshCw size={14} aria-hidden="true" />Tentar novamente</button>
      <a href={src} target="_blank" rel="noreferrer">Abrir arquivo</a>
    </div> : null}
  </div>;
}
