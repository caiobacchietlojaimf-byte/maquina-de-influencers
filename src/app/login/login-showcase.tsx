"use client";

import { useEffect, useRef, useState } from "react";

/* Vídeo decorativo da tela de login: mudo, em loop, sem controles.
   - A capa fica sempre por baixo: cobre o carregamento e qualquer falha.
   - O <video> só entra no DOM depois de hidratar, em tela larga e sem
     "movimento reduzido": no celular (vitrine oculta) nada é baixado e, com
     movimento reduzido, a capa estática é o resultado final. */

export function LoginShowcase({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 901px)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setEnabled(wide.matches && !motion.matches);
    sync();
    wide.addEventListener("change", sync);
    motion.addEventListener("change", sync);
    return () => {
      wide.removeEventListener("change", sync);
      motion.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!video || !enabled || failed) return;
    video.muted = true;
    video.play().catch(() => setPlaying(false));
  }, [enabled, failed]);

  return (
    <div className="auth-media" aria-hidden>
      <img className="auth-media-poster" src={poster} alt="" decoding="async" />
      {enabled && !failed ? (
        <video
          ref={ref}
          className="auth-media-video"
          data-playing={playing}
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          onError={() => setFailed(true)}
          onPause={() => setPlaying(false)}
          onPlaying={() => setPlaying(true)}
        />
      ) : null}
      <div className="auth-media-shade" />
    </div>
  );
}
