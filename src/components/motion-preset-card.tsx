"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

import styles from "./video-studio.module.css";

export function MotionPresetCard({
  name,
  thumbnail,
  preview,
  active,
  disabled = false,
  onPick,
}: {
  name: string;
  thumbnail: string;
  preview: string;
  active: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playing = hovered || focused;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || failed) return;
    if (playing && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
    return () => video.pause();
  }, [playing, failed]);

  return (
    <button
      type="button"
      className={`motion-card ${styles.presetCard}`}
      data-active={active}
      disabled={disabled}
      aria-pressed={active}
      aria-label={`${active ? "Selecionado: " : "Selecionar "}${name}`}
      onClick={onPick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {playing && !failed ? (
        <video
          ref={videoRef}
          src={preview}
          poster={thumbnail}
          muted
          loop
          playsInline
          preload="none"
          onError={() => setFailed(true)}
          aria-hidden="true"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt="" loading="lazy" />
      )}
      <span className={styles.playIcon} aria-hidden="true"><Play size={15} fill="currentColor" /></span>
      <span className="label">{name}</span>
    </button>
  );
}
