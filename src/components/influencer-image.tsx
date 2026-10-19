"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

/** A provider link can expire before it was copied to storage; say so instead of a broken image. */
export function InfluencerImage({ src, alt, loading = "lazy" }: { src: string; alt: string; loading?: "lazy" | "eager" }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span role="img" aria-label={alt ? `${alt}: imagem indisponível` : "Imagem indisponível"} style={{ display: "grid", placeItems: "center", alignContent: "center", gap: 6, width: "100%", height: "100%", minHeight: 80, padding: 8, textAlign: "center", fontSize: 11, lineHeight: 1.3, color: "var(--tx2)", background: "var(--s1, #16181b)" }}>
        <ImageOff size={20} aria-hidden="true" />
        Imagem expirada
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={loading} onError={() => setFailed(true)} />;
}
