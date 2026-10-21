"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./gallery-carousel.module.css";

const SPEED_PX_PER_S = 28;
const RESUME_AFTER_MS = 1600;

export function GalleryCarousel({ items }: { items: ReadonlyArray<{ id: string; src: string; label: string }> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const hovering = useRef(false);
  const resumeAt = useRef(0);
  const barRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);

  const holdAuto = () => { resumeAt.current = performance.now() + RESUME_AFTER_MS; };

  const step = (direction: 1 | -1) => {
    const track = trackRef.current;
    const card = track?.firstElementChild as HTMLElement | null;
    if (!track || !card) return;
    holdAuto();
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    track.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: "smooth" });
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !visible) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pos = track.scrollLeft;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      const half = track.scrollWidth / 2;
      if (Math.abs(track.scrollLeft - pos) > 2) pos = track.scrollLeft;
      if (!reduced && !hovering.current && now > resumeAt.current) {
        pos += SPEED_PX_PER_S * dt;
        track.scrollLeft = pos;
      }
      if (half > 0 && track.scrollLeft >= half) { pos = track.scrollLeft - half; track.scrollLeft = pos; }
      if (half > 0 && track.scrollLeft <= 0 && pos < 0) { pos = half; track.scrollLeft = pos; }
      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.max(half > 0 ? (track.scrollLeft % half) / half : 0, 0.04)})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const loop = [...items, ...items];

  return <div
    className={styles.carousel}
    data-visible={visible}
    onMouseEnter={() => { hovering.current = true; }}
    onMouseLeave={() => { hovering.current = false; }}
    onTouchStart={holdAuto}
    onWheel={holdAuto}
  >
    <div
      ref={trackRef}
      className={styles.track}
      role="region"
      aria-label="Personagens do catálogo"
      tabIndex={0}
      onKeyDown={holdAuto}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") return;
        event.preventDefault();
        drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.dragging = "true";
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        holdAuto();
        const half = event.currentTarget.scrollWidth / 2;
        let target = drag.current.left - (event.clientX - drag.current.x);
        if (target < 0) { drag.current.left += half; target += half; }
        if (target >= half) { drag.current.left -= half; target -= half; }
        event.currentTarget.scrollLeft = target;
      }}
      onPointerUp={(event) => { drag.current = null; delete event.currentTarget.dataset.dragging; }}
      onPointerCancel={(event) => { drag.current = null; delete event.currentTarget.dataset.dragging; }}
    >
      {loop.map((item, index) => <figure key={`${item.id}-${index}`} className={styles.card} aria-hidden={index >= items.length} style={{ animationDelay: `${Math.min(index, 3) * 90}ms` }}>
        <Image src={item.src} alt={index < items.length ? `Personagem de IA do catálogo, exemplo ${index + 1}` : ""} fill sizes="(max-width: 760px) 72vw, 400px" draggable={false} />
        <figcaption>{item.label}</figcaption>
      </figure>)}
    </div>
    <div className={styles.controls}>
      <div className={styles.progress} aria-hidden><span ref={barRef} /></div>
      <button type="button" className={styles.arrow} onClick={() => step(-1)} aria-label="Personagens anteriores"><ChevronLeft size={18} /></button>
      <button type="button" className={styles.arrow} onClick={() => step(1)} aria-label="Próximos personagens"><ChevronRight size={18} /></button>
    </div>
  </div>;
}
