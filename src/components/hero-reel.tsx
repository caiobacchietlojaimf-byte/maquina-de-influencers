"use client";

import { useEffect, useRef } from "react";

/* Faixa de vídeos do hero que só toca o que está visível: IntersectionObserver
   dá play/pause por vídeo. Evita 5 decodificações simultâneas fora da tela —
   em máquinas modestas isso sobrecarrega o compositor do Chrome a ponto de
   ele parar de pintar outras partes da página. */

export function HeroReel({
  videos,
  className = "hero-strip",
}: {
  videos: ReadonlyArray<{ src: string; poster: string }>;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            video.play().catch(() => undefined);
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.25 },
    );
    wrap.querySelectorAll("video").forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className={className} aria-hidden>
      {videos.map((video) => (
        <video
          key={video.src}
          src={video.src}
          poster={video.poster}
          muted
          loop
          playsInline
          preload="none"
        />
      ))}
    </div>
  );
}
