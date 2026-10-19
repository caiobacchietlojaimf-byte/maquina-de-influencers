"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import { importInfluencerAction } from "@/app/actions/influencers";
import styles from "./influencer-details.module.css";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_BYTES = 15 * 1024 * 1024;

type Picked = { file: File; preview: string } | null;

function ImagePicker({ label, hint, value, disabled, onChange }: { label: string; hint: string; value: Picked; disabled: boolean; onChange: (value: Picked, error?: string) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <label htmlFor={id} style={{ display: "grid", placeItems: "center", gap: 6, minHeight: 150, padding: 12, border: "1px dashed var(--line)", borderRadius: 14, cursor: disabled ? "not-allowed" : "pointer", textAlign: "center", color: "var(--tx2)", fontSize: 12.5, overflow: "hidden" }}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.preview} alt="" style={{ maxHeight: 220, maxWidth: "100%", objectFit: "contain", borderRadius: 10 }} />
        ) : (
          <><ImagePlus size={22} aria-hidden="true" /><span>{hint}</span><span>PNG, JPG ou WebP · até 15 MB</span></>
        )}
      </label>
      <input id={id} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} className="sr-only" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        if (!TYPES[file.type]) return onChange(null, "Escolha uma imagem PNG, JPG ou WebP.");
        if (file.size > MAX_BYTES) return onChange(null, "A imagem deve ter até 15 MB.");
        onChange({ file, preview: URL.createObjectURL(file) });
      }} />
      {value ? <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => onChange(null)}>Remover</button> : null}
    </div>
  );
}

export function InfluencerImportDialog({ userId, onClose, onImported }: { userId: string; onClose: () => void; onImported: (id: string) => Promise<void> | void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState("");
  const [image, setImage] = useState<Picked>(null);
  const [face, setFace] = useState<Picked>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.preview); }, [image]);
  useEffect(() => () => { if (face) URL.revokeObjectURL(face.preview); }, [face]);

  function close() { if (!busy) onClose(); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !image || name.trim().length < 2) return;
    setError(null);
    try {
      const { upload } = await import("@vercel/blob/client");
      const send = async (picked: NonNullable<Picked>, step: string) => {
        const path = `influencer-imports/${userId}/${crypto.randomUUID()}.${TYPES[picked.file.type]}`;
        await upload(path, picked.file, { access: "public", contentType: picked.file.type, handleUploadUrl: "/api/influencer-import/upload", onUploadProgress: ({ percentage }) => setProgress(`${step} ${Math.round(percentage)}%`) });
        return path;
      };
      const imagePath = await send(image, "Enviando imagem…");
      const facePath = face ? await send(face, "Enviando rosto…") : undefined;
      setProgress("Conferindo as imagens…");
      const result = await importInfluencerAction({ name, imagePath, ...(facePath ? { facePath } : {}) });
      if ("error" in result) { setError(result.error); return; }
      await onImported(result.id);
    } catch {
      setError("Não foi possível enviar as imagens. Confira a conexão e tente novamente.");
    } finally { setProgress(null); }
  }

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close(); }}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>Meus Influencers</span><h2 id={titleId}>Importar influencer pronto</h2></div>
        <button type="button" className="btn btn-ghost" aria-label="Fechar" onClick={close} disabled={busy}><X size={22} /></button>
      </header>
      <form onSubmit={submit} style={{ display: "grid", gap: 18, maxWidth: 760, margin: "0 auto", padding: "28px 24px 48px" }}>
        <p style={{ color: "var(--tx2)", lineHeight: 1.6, margin: 0 }}>Use um personagem que você já tem. Nada é gerado e nenhum crédito é cobrado: ele aparece em Meus Influencers pronto para criar vídeos.</p>
        <div className="field">
          <label htmlFor={`${titleId}-name`}>Nome do influencer</label>
          <input id={`${titleId}-name`} className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required disabled={busy} placeholder="Ex.: Dante Ribeiro" />
        </div>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <ImagePicker label="Imagem do personagem (obrigatória)" hint="Corpo inteiro, de frente, fundo limpo e com a roupa que ele vai usar" value={image} disabled={busy} onChange={(value, message) => { setImage(value); setError(message ?? null); }} />
          <ImagePicker label="Close do rosto (opcional, recomendado)" hint="Rosto de frente e nítido. Melhora muito a fidelidade nos vídeos" value={face} disabled={busy} onChange={(value, message) => { setFace(value); setError(message ?? null); }} />
        </div>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <p role="status" className={styles.muted} style={{ margin: 0 }}>{progress ?? ""}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-accent" disabled={busy || !image || name.trim().length < 2}>{busy ? <span className="spinner" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}Importar influencer</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>Cancelar</button>
        </div>
      </form>
    </dialog>
  );
}
