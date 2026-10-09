"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Download, ImageIcon, Pencil, Save, Sparkles, X } from "lucide-react";
import { renameInfluencerAction } from "@/app/actions/influencers";
import { CHARACTER_TYPES } from "@/data/character-types";
import { TRAIT_GROUPS } from "@/data/traits";
import type { Influencer } from "@/lib/db";
import { displayDateTime } from "@/lib/display-date";
import styles from "./influencer-details.module.css";

const STATUS = { queued: "Na fila", processing: "Gerando", completed: "Pronto", failed: "Falhou" };

export function InfluencerDetails({ influencer, onClose, onRename }: {
  influencer: Influencer;
  onClose: () => void;
  onRename: (id: string, name: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(influencer.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);
  const images = Array.from(new Set([influencer.imageUrl, ...(influencer.gallery ?? [])].filter((url): url is string => Boolean(url))));
  const image = images[selectedImage] ?? images[0];
  const tier = CHARACTER_TYPES.find((type) => type.id === influencer.tier)?.label ?? influencer.tier;
  const traits = Object.entries(influencer.selection).filter(([, values]) => values.length).map(([id, values]) => {
    const group = TRAIT_GROUPS.find((item) => item.id === id);
    return { id, label: group?.label ?? id, values: values.map((value) => group?.options.find((option) => option.id === value)?.label ?? value).join(", ") };
  });

  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; };
  }, []);

  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  function closeDetails() {
    // Close before unmounting so the browser restores focus to the opening card.
    dialog.current?.close();
    onClose();
  }

  async function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await renameInfluencerAction(influencer.id, name);
      if ("error" in result) { setError(result.error); return; }
      onRename(influencer.id, result.name);
      setName(result.name);
      setEditing(false);
      setNotice("Nome salvo.");
      requestAnimationFrame(() => editButton.current?.focus());
    } catch {
      setError("Não foi possível salvar o nome. Tente novamente.");
    } finally { setSaving(false); }
  }

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="influencer-detail-title" onCancel={(event) => { event.preventDefault(); if (!saving) closeDetails(); }}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>Meus Influencers</span><h2 id="influencer-detail-title">{influencer.name}</h2></div>
        <button type="button" className="btn btn-ghost" aria-label="Fechar detalhes" onClick={closeDetails} disabled={saving}><X size={22} /></button>
      </header>
      <div className={styles.content}>
        <section className={styles.visual} aria-label="Imagens do influencer">
          <div className={styles.stage}>
            {image ? <img src={image} alt={`${influencer.name} — imagem ${selectedImage + 1}`} /> : <div className={styles.placeholder}><ImageIcon size={40} /><p>{influencer.status === "failed" ? "A imagem não foi gerada." : "A imagem aparecerá aqui quando estiver pronta."}</p></div>}
          </div>
          {images.length > 1 ? <div className={styles.thumbnails} aria-label="Escolher imagem">{images.map((url, index) => <button key={url} type="button" aria-label={`Ver imagem ${index + 1}`} aria-pressed={selectedImage === index} onClick={() => setSelectedImage(index)}><img src={url} alt="" /></button>)}</div> : null}
          {image ? <a className="btn btn-ghost" href={image} target="_blank" rel="noreferrer"><Download size={16} />Abrir imagem original</a> : null}
        </section>
        <section className={styles.details} aria-label="Ficha do influencer">
          <div className={styles.section}>
            <div className={styles.sectionHeading}><h3>Nome do influencer</h3>{!editing ? <button ref={editButton} type="button" className="btn btn-sm btn-ghost" onClick={() => { setName(influencer.name); setError(null); setNotice(""); setEditing(true); }}><Pencil size={15} />Editar nome</button> : null}</div>
            {editing ? <form onSubmit={saveName} className={styles.nameForm}>
              <label className="sr-only" htmlFor="influencer-detail-name">Novo nome do influencer</label>
              <input ref={input} id="influencer-detail-name" className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required disabled={saving} aria-describedby={error ? "influencer-name-error" : undefined} />
              <div className={styles.formActions}><button className="btn btn-accent" type="submit" disabled={saving || !name.trim()}><Save size={16} />{saving ? "Salvando…" : "Salvar nome"}</button><button type="button" className="btn btn-ghost" disabled={saving} onClick={() => { setEditing(false); setError(null); requestAnimationFrame(() => editButton.current?.focus()); }}>Cancelar</button></div>
              {error ? <p id="influencer-name-error" className="auth-error" role="alert">{error}</p> : null}
            </form> : <p className={styles.name}>{influencer.name}</p>}
            <p className={styles.notice} role="status">{notice}</p>
          </div>
          <dl className={styles.summary}><div><dt>Tipo de personagem</dt><dd>{tier}</dd></div><div><dt>Status</dt><dd>{STATUS[influencer.status]}</dd></div><div><dt>Criado em</dt><dd>{displayDateTime(influencer.createdAt, "long")}</dd></div></dl>
          {influencer.error ? <p className="auth-error">{influencer.error}</p> : null}
          {influencer.status === "completed" && influencer.imageUrl ? <Link className="btn btn-accent" href={`/app/criar-videos?influencer=${encodeURIComponent(influencer.id)}`}><Sparkles size={17} />Criar vídeo com este influencer</Link> : null}
          <div className={styles.section}><h3>Características</h3>{traits.length ? <dl className={styles.traits}>{traits.map((trait) => <div key={trait.id}><dt>{trait.label}</dt><dd>{trait.values}</dd></div>)}</dl> : <p className={styles.muted}>Nenhuma característica foi selecionada na criação.</p>}</div>
          {influencer.referenceUrl ? <div className={styles.section}><h3>Foto de referência</h3><a href={influencer.referenceUrl} target="_blank" rel="noreferrer"><img className={styles.reference} src={influencer.referenceUrl} alt="Foto usada como referência na criação" /></a></div> : null}
          {influencer.brief ? <details className={styles.brief}><summary>Descrição usada na criação</summary><p>{influencer.brief}</p><span className={styles.muted}>Seed: {influencer.seed}</span></details> : null}
        </section>
      </div>
    </dialog>
  );
}
