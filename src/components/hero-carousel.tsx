"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./hero-carousel.module.css";

const AUTO_ADVANCE_MS = 6000;
const SWIPE_PX = 40;

export function HeroCarousel({ videos }: { videos: ReadonlyArray<{ src: string; poster: string }> }) {
  const count = videos.length;
  const [active, setActive] = useState(Math.floor(count / 2));
  const [paused, setPaused] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);
  const move = useRef({ from: active, to: active, n: 0 });

  const stepPx = () => (trackRef.current?.offsetWidth ?? 1) * 0.46 * 0.56;

  const endDrag = (clientX: number | null) => {
    if (dragStart.current === null) return;
    const dx = clientX === null ? 0 : clientX - dragStart.current;
    dragStart.current = null;
    setDragX(null);
    if (Math.abs(dx) < 6) return;
    dragged.current = true;
    const shift = Math.round(-dx / stepPx()) || (Math.abs(dx) > SWIPE_PX ? (dx < 0 ? 1 : -1) : 0);
    if (shift) go(active + shift);
  };

  const go = useCallback((index: number) => setActive(((index % count) + count) % count), [count]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      if (index === active && !reduced) video.play().catch(() => undefined);
      else video.pause();
    });
  }, [active]);

  useEffect(() => {
    if (paused || dragX !== null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => go(active + 1), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, paused, dragX, go]);

  const circular = (value: number) => {
    let d = value;
    if (d > count / 2) d -= count;
    if (d < -count / 2) d += count;
    return d;
  };
  const offsetOf = (index: number) => circular(index - active);

  if (move.current.to !== active) move.current = { from: move.current.to, to: active, n: move.current.n + 1 };
  const { from, n: moveCount } = move.current;
  const shift = circular(active - from);
  const wraps = (index: number) => from !== active && offsetOf(index) !== circular(index - from) - shift;

  return <div
    className={styles.carousel}
    role="region"
    aria-roledescription="carrossel"
    aria-label="Personagens de IA em movimento"
    onMouseEnter={() => setPaused(true)}
    onMouseLeave={() => setPaused(false)}
    onFocus={() => setPaused(true)}
    onBlur={() => setPaused(false)}
    onKeyDown={(event) => {
      if (event.key === "ArrowLeft") go(active - 1);
      if (event.key === "ArrowRight") go(active + 1);
    }}
  >
    <div
      ref={trackRef}
      className={styles.track}
      data-dragging={dragX !== null}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") event.preventDefault();
        dragStart.current = event.clientX;
        dragged.current = false;
      }}
      onPointerMove={(event) => {
        if (dragStart.current === null) return;
        const dx = event.clientX - dragStart.current;
        if (dragX === null && Math.abs(dx) <= 4) return;
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
        setDragX(dx);
      }}
      onPointerUp={(event) => endDrag(event.clientX)}
      onPointerCancel={() => endDrag(null)}
    >
      {videos.map((video, index) => {
        const d = offsetOf(index);
        const pos = d + (dragX ?? 0) / stepPx();
        const abs = Math.min(Math.abs(pos), 3);
        const teleport = wraps(index);
        return <button
          key={video.src}
          type="button"
          className={styles.card}
          data-active={d === 0}
          aria-label={`Personagem ${index + 1} de ${count}`}
          aria-current={d === 0}
          tabIndex={d === 0 ? 0 : -1}
          style={{
            transform: `translate(-50%, -50%) translateX(${pos * 56}%) scale(${1 - abs * 0.13}) rotate(${pos * 3}deg)`,
            zIndex: Math.round(100 - abs * 10),
            opacity: abs > 2.4 ? 0 : 1,
            filter: abs < 0.05 ? "none" : `brightness(${1 - Math.min(abs, 2.5) * 0.28}) saturate(.85)`,
            ...(teleport ? { transition: "none", animation: `${moveCount % 2 ? styles.fadeA : styles.fadeB} .45s ease` } : null),
          }}
          onClick={() => { if (!dragged.current && d !== 0) go(index); }}
        >
          <video
            ref={(node) => { videoRefs.current[index] = node; }}
            src={video.src}
            poster={video.poster}
            muted
            loop
            playsInline
            preload={d === 0 ? "auto" : "none"}
            aria-hidden
          />
        </button>;
      })}
    </div>

    <div className={styles.controls}>
      <button type="button" className={styles.arrow} onClick={() => go(active - 1)} aria-label="Personagem anterior"><ChevronLeft size={18} /></button>
      <div className={styles.dots}>
        {videos.map((video, index) => <button
          key={video.src}
          type="button"
          className={styles.dot}
          data-active={index === active}
          onClick={() => go(index)}
          aria-label={`Ir para o personagem ${index + 1}`}
        />)}
      </div>
      <button type="button" className={styles.arrow} onClick={() => go(active + 1)} aria-label="Próximo personagem"><ChevronRight size={18} /></button>
    </div>
  </div>;
}
