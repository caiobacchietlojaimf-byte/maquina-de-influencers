"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Play, RotateCw } from "lucide-react";
import styles from "./tiktok-reference-player.module.css";

const PLAYER_ORIGIN = "https://www.tiktok.com";
const READY_TIMEOUT_MS = 15_000;

export type TikTokReferencePlayerProps = {
  id: string;
  title: string;
  poster?: string;
  sourceUrl: string;
  active: boolean;
  onPlay: () => void;
};

function pause(frame: HTMLIFrameElement | null) {
  frame?.contentWindow?.postMessage({ "x-tiktok-player": true, type: "pause" }, PLAYER_ORIGIN);
}

function originalUrl(sourceUrl: string, id: string): string {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol === "https:" && ["www.tiktok.com", "tiktok.com"].includes(url.hostname) && !url.username && !url.password) return url.href;
  } catch { /* Use the official player as the safe fallback. */ }
  return /^\d+$/.test(id) ? `${PLAYER_ORIGIN}/player/v1/${id}` : PLAYER_ORIGIN;
}

function errorMessage(value: unknown): string {
  const code = typeof value === "object" && value !== null && "errorCode" in value ? value.errorCode : value;
  if (code === 1001) return "O TikTok não disponibilizou este vídeo no player integrado.";
  if (code === 2001) return "O TikTok não conseguiu carregar o vídeo agora.";
  if (code === 3002) return "O navegador interrompeu a reprodução. Carregue o player novamente e toque em reproduzir.";
  return "Não foi possível reproduzir este vídeo pelo TikTok agora.";
}

/** Official TikTok player, loaded only after an explicit click. */
export function TikTokReferencePlayer(props: TikTokReferencePlayerProps) {
  return <TikTokPlayerSession key={props.id} {...props} />;
}

function TikTokPlayerSession({ id, title, poster, sourceUrl, active, onPlay }: TikTokReferencePlayerProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef({ active, onPlay });
  const [phase, setPhase] = useState<"cover" | "loading" | "ready" | "failed">("cover");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const [playback, setPlayback] = useState(-1);
  const validId = /^\d{1,22}$/.test(id);
  const mounted = validId && (phase === "loading" || phase === "ready");
  const fallbackUrl = originalUrl(sourceUrl, id);

  useEffect(() => {
    latest.current = { active, onPlay };
    if (!active) pause(frame.current);
  }, [active, onPlay]);

  useEffect(() => {
    if (!mounted) return;
    const currentFrame = frame.current;
    const timer = window.setTimeout(() => {
      pause(currentFrame);
      setError("O player do TikTok não respondeu. Tente novamente ou assista na origem.");
      setPhase("failed");
    }, READY_TIMEOUT_MS);

    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== PLAYER_ORIGIN || event.source !== currentFrame?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object" || !("x-tiktok-player" in data) || data["x-tiktok-player"] !== true || !("type" in data)) return;
      const value = "value" in data ? data.value : undefined;
      if (data.type === "onPlayerReady") {
        window.clearTimeout(timer);
        setPhase("ready");
        if (!latest.current.active) pause(currentFrame);
      } else if (data.type === "onStateChange" && typeof value === "number" && [-1, 0, 1, 2, 3].includes(value)) {
        setPlayback(value);
        if (value === 1) latest.current.onPlay();
      } else if (data.type === "onPlayerError" || data.type === "onError") {
        window.clearTimeout(timer);
        pause(currentFrame);
        setError(errorMessage(value));
        setPhase("failed");
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
      pause(currentFrame);
    };
  }, [mounted, attempt]);

  const load = () => {
    if (!validId) { setError("A referência não possui um identificador válido do TikTok."); setPhase("failed"); return; }
    setError(null);
    setPlayback(-1);
    setAttempt((value) => value + 1);
    setPhase("loading");
    onPlay();
  };

  return <div className={styles.player} data-playback={playback} aria-label={`Referência do TikTok: ${title}`}>
    {mounted ? <iframe
      key={attempt}
      ref={frame}
      src={`${PLAYER_ORIGIN}/player/v1/${id}?controls=1&rel=0`}
      title={`Player do TikTok: ${title}`}
      allow="fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      onError={() => { setError("Não foi possível abrir o player do TikTok."); setPhase("failed"); }}
    /> : <>
      {poster && !posterFailed ? <img className={styles.poster} src={poster} alt="" loading="lazy" onError={() => setPosterFailed(true)} /> : null}
      <div className={styles.cover}>
        {phase === "failed" ? <>
          <p className={styles.error} role="status">{error}</p>
          {validId ? <button type="button" className="btn btn-sm" onClick={load}><RotateCw size={15} />Tentar novamente</button> : null}
          <a className="btn btn-sm" href={fallbackUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Assistir no TikTok</a>
        </> : <button type="button" className={`btn btn-accent ${styles.load}`} onClick={load}><Play size={19} fill="currentColor" /><span>Assistir no TikTok integrado</span></button>}
      </div>
    </>}
    {phase === "loading" ? <span className={styles.loading} role="status">Carregando player do TikTok…</span> : null}
  </div>;
}
