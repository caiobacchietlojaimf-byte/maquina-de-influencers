"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./gallery-carousel.module.css";

const AUTO_ADVANCE_MS = 3800;

export function GalleryCarousel({ items }: { items: ReadonlyArray<{ id: string; src: string; label: string }> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);

  const step = (direction: 1 | -1) => {
    const track = trackRef.current;
    const card = track?.firstElementChild as HTMLElement | null;
    if (!track || !card) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    if (direction === 1 && atEnd) track.scrollTo({ left: 0, behavior: "smooth" });
    else track.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: "smooth" });
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => {
      const max = track.scrollWidth - track.clientWidth;
      setProgress(max > 0 ? track.scrollLeft / max : 0);
    };
    onScroll();
    track.addEventListener("scroll", onScroll, { passive: true });
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(track);
    return () => { track.removeEventListener("scroll", onScroll); observer.disconnect(); };
  }, []);

  useEffect(() => {
    if (paused || !visible || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => step(1), AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [paused, visible]);

  return <div
    className={styles.carousel}
    data-visible={visible}
    onMouseEnter={() => setPaused(true)}
    onMouseLeave={() => setPaused(false)}
    onTouchStart={() => setPaused(true)}
    onFocus={() => setPaused(true)}
    onBlur={() => setPaused(false)}
  >
    <div ref={trackRef} className={styles.track} role="region" aria-label="Personagens do catálogo" tabIndex={0}>
      {items.map((item, index) => <figure key={item.id} className={styles.card} style={{ animationDelay: `${Math.min(index, 3) * 90}ms` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.src} alt={`Personagem de IA do catálogo, exemplo ${index + 1}`} loading="lazy" draggable={false} />
        <figcaption>{item.label}</figcaption>
      </figure>)}
    </div>
    <div className={styles.controls}>
      <div className={styles.progress} aria-hidden><span style={{ transform: `scaleX(${0.15 + progress * 0.85})` }} /></div>
      <button type="button" className={styles.arrow} onClick={() => step(-1)} aria-label="Personagens anteriores"><ChevronLeft size={18} /></button>
      <button type="button" className={styles.arrow} onClick={() => step(1)} aria-label="Próximos personagens"><ChevronRight size={18} /></button>
    </div>
  </div>;
}
