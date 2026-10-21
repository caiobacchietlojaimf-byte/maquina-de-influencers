"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Eye, Flame, Sparkles, Users } from "lucide-react";
import styles from "./trending-row.module.css";

export type TrendingItem = { id: string; name: string; description: string; thumbnail: string; preview: string; views?: number; people?: number; tag?: string; href?: string; badge: "hot" | "new" | "soon" | null };

const views = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function TrendingRow({ items: baseItems, more = [], href, layout = "row" }: { items: ReadonlyArray<TrendingItem>; more?: ReadonlyArray<TrendingItem>; href: string; layout?: "row" | "grid" }) {
  const grid = layout === "grid";
  const [showMore, setShowMore] = useState(false);
  const items = showMore ? [...baseItems, ...more] : baseItems;
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const step = (direction: 1 | -1) => {
    const track = trackRef.current;
    const card = track?.firstElementChild as HTMLElement | null;
    if (!track || !card) return;
    track.scrollBy({ left: direction * (card.offsetWidth + 16) * 2, behavior: "smooth" });
  };

  const play = (card: HTMLElement, on: boolean) => {
    const video = card.querySelector("video");
    if (!video) return;
    if (on && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) { video.currentTime = 0; video.play().catch(() => undefined); }
    else video.pause();
  };

  return <div className={styles.wrap}>
    {grid ? null : <div className={styles.arrows}>
      <button type="button" onClick={() => step(-1)} aria-label="Ver anteriores"><ChevronLeft size={18} /></button>
      <button type="button" onClick={() => step(1)} aria-label="Ver próximos"><ChevronRight size={18} /></button>
    </div>}
    <div
      ref={trackRef}
      className={grid ? styles.grid : styles.track}
      role="list"
      onPointerDown={(event) => {
        if (grid || event.pointerType !== "mouse") return;
        drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, moved: false };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const dx = event.clientX - drag.current.x;
        if (!drag.current.moved && Math.abs(dx) < 5) return;
        if (!drag.current.moved) { drag.current.moved = true; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.dataset.dragging = "true"; }
        event.currentTarget.scrollLeft = drag.current.left - dx;
      }}
      onPointerUp={(event) => { delete event.currentTarget.dataset.dragging; setTimeout(() => { drag.current = null; }, 0); }}
      onPointerCancel={(event) => { delete event.currentTarget.dataset.dragging; drag.current = null; }}
      onClickCapture={(event) => { if (drag.current?.moved) { event.preventDefault(); event.stopPropagation(); } }}
    >
      {items.map((item) => {
        const soon = item.badge === "soon";
        const content = <>
          <div className={styles.media}>
            <Image src={item.thumbnail} alt="" fill sizes="(max-width: 760px) 78vw, 320px" draggable={false} />
            {soon ? null : <video src={item.preview} muted loop playsInline preload="none" aria-hidden />}
            {item.badge === "hot" ? <span className={`${styles.badge} ${styles.hot}`}><Flame size={12} /> Em alta</span> : null}
            {item.badge === "new" ? <span className={`${styles.badge} ${styles.new}`}><Sparkles size={12} /> Novo</span> : null}
            {soon ? <span className={`${styles.badge} ${styles.soon}`}><Clock size={12} /> Em breve</span> : null}
            {item.people ? <span className={styles.chip}><Users size={13} /> {item.people} {item.people === 1 ? "foto" : "fotos"}</span>
              : item.views ? <span className={styles.chip}><Eye size={13} /> {views.format(item.views)}</span>
              : <span className={styles.chip}><Users size={13} /> {item.tag ?? "Movimento"}</span>}
          </div>
          <strong>{item.name}</strong>
          <span className={styles.desc}>{item.description}</span>
        </>;
        if (soon) return <div key={item.id} role="listitem" className={styles.card} data-soon="true">{content}</div>;
        return <Link
          key={item.id}
          href={item.href ?? href}
          role="listitem"
          className={styles.card}
          draggable={false}
          onMouseEnter={(event) => play(event.currentTarget, true)}
          onMouseLeave={(event) => play(event.currentTarget, false)}
          onFocus={(event) => play(event.currentTarget, true)}
          onBlur={(event) => play(event.currentTarget, false)}
        >{content}</Link>;
      })}
    </div>
    {more.length ? <div className={styles.moreWrap}>
      <button type="button" className={styles.more} aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>
        {showMore ? "Ver menos" : <>Ver mais <span>{more.length} em breve</span></>}
        <ChevronDown size={18} className={styles.moreIcon} data-open={showMore} aria-hidden />
      </button>
    </div> : null}
  </div>;
}
