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
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);

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
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => go(active + 1), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, paused, go]);

  const offsetOf = (index: number) => {
    let d = index - active;
    if (d > count / 2) d -= count;
    if (d < -count / 2) d += count;
    return d;
  };

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
      className={styles.track}
      onPointerDown={(event) => { dragStart.current = event.clientX; dragged.current = false; }}
      onPointerUp={(event) => {
        if (dragStart.current === null) return;
        const dx = event.clientX - dragStart.current;
        dragStart.current = null;
        if (Math.abs(dx) < SWIPE_PX) return;
        dragged.current = true;
        go(dx < 0 ? active + 1 : active - 1);
      }}
      onPointerCancel={() => { dragStart.current = null; }}
    >
      {videos.map((video, index) => {
        const d = offsetOf(index);
        const abs = Math.abs(d);
        return <button
          key={video.src}
          type="button"
          className={styles.card}
          data-active={d === 0}
          aria-label={`Personagem ${index + 1} de ${count}`}
          aria-current={d === 0}
          tabIndex={d === 0 ? 0 : -1}
          style={{
            transform: `translate(-50%, -50%) translateX(${d * 56}%) scale(${1 - abs * 0.13}) rotate(${d * 3}deg)`,
            zIndex: 10 - abs,
            opacity: abs > 2 ? 0 : 1,
            filter: d === 0 ? "none" : `brightness(${1 - abs * 0.28}) saturate(.85)`,
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
