"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import styles from "./influencer-studio.module.css";

async function prepareReferenceImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Escolha uma imagem JPG, PNG ou WebP.");
  }
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("A imagem deve ter até 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const item = new window.Image();
      const timeout = window.setTimeout(() => {
        item.onload = null;
        item.onerror = null;
        item.src = "";
        reject(new Error("Não foi possível abrir esta imagem. Escolha outro arquivo."));
      }, 15_000);
      item.onload = () => { window.clearTimeout(timeout); resolve(item); };
      item.onerror = () => { window.clearTimeout(timeout); reject(new Error("A imagem está inválida ou corrompida. Escolha outro arquivo.")); };
      item.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 64_000_000) {
      throw new Error("Esta imagem é muito grande para preparar. Envie uma versão menor.");
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem neste navegador.");
    for (const maxSize of [1024, 800, 640, 512]) {
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.72, 0.58]) {
        const result = canvas.toDataURL("image/jpeg", quality);
        // Two references stay below the server action's 1 MB request limit.
        if (result.length <= 400 * 1024) return result;
      }
    }
    throw new Error("Não foi possível reduzir esta imagem. Escolha um arquivo menor.");
  } finally { URL.revokeObjectURL(url); }
}

export function ReferenceUpload({ label, previewLabel, value, disabled, required = false, onChange, onLoadingChange }: {
  label: string;
  previewLabel: string;
  value: string | null;
  disabled: boolean;
  required?: boolean;
  onChange: (value: string | null) => void;
  onLoadingChange: (loading: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const mounted = useRef(true);
  const errorId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function pick(file: File) {
    if (loadingRef.current || disabled) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    onLoadingChange(true);
    try {
      const result = await prepareReferenceImage(file);
      if (mounted.current) onChange(result);
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "Não foi possível preparar a imagem.");
    } finally {
      loadingRef.current = false;
      if (mounted.current) { setLoading(false); onLoadingChange(false); }
    }
  }

  return <div className={styles.referenceUpload}>
    <label className={`upload-box ${styles.uploadBox}`} data-disabled={disabled}>
      <span className="optional">{required ? "Obrigatória" : "Opcional"}</span>
      {loading ? <span className="spinner" aria-hidden="true" /> : value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={previewLabel} />
      ) : <ImagePlus size={20} aria-hidden="true" />}
      <b>{loading ? "Preparando imagem…" : value ? "Trocar imagem" : label}</b>
      {!value && !loading ? <span className={styles.uploadHint}>JPG, PNG ou WebP · até 10 MB</span> : null}
      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={label}
        disabled={disabled || loading} aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void pick(file);
        }} />
    </label>
    <span className="sr-only" role="status">{loading ? "Preparando imagem" : ""}</span>
    {value ? <button type="button" className="btn btn-sm btn-ghost" disabled={disabled || loading} onClick={() => { onChange(null); setError(null); }}>Remover imagem<span className="sr-only">: {previewLabel}</span></button> : null}
    {error ? <p id={errorId} className={styles.uploadError} role="alert">{error}</p> : null}
  </div>;
}
