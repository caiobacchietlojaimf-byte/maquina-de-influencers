"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Check, Download, ImageIcon, Pencil, RotateCcw, Save, Shirt, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { createInfluencerVariantAction, deleteInfluencerAction, renameInfluencerAction, retryInfluencerAction } from "@/app/actions/influencers";
import { CHARACTER_TYPES } from "@/data/character-types";
import { TRAIT_GROUPS } from "@/data/traits";
import type { Influencer } from "@/lib/db";
import { INFLUENCER_EDIT_COST, INFLUENCER_PROMPT_COST, SHEET_COST } from "@/lib/costs";
import { influencerVersionLabel } from "@/lib/influencer-versions";
import { displayDateTime } from "@/lib/display-date";
import { ReferenceUpload } from "./influencer-reference-upload";
import styles from "./influencer-details.module.css";

const STATUS = { queued: "Na fila", processing: "Gerando", completed: "Pronto", failed: "Falhou" };
type EditKind = "outfit" | "details";

export function InfluencerDetails({ influencer, variants = [influencer], credits, refreshError, refreshing = false, onClose, onRename, onRefresh }: {
  influencer: Influencer;
  variants?: Influencer[];
  credits: number;
  refreshError?: string | null;
  refreshing?: boolean;
  onClose: () => void;
  onRename: (id: string, name: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  const actionRef = useRef(false);
  const requestRef = useRef<{ signature: string; key: string } | null>(null);
  const retryKeys = useRef<Record<string, string>>({});
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(influencer.name);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState(influencer.id);
  const [selectedImage, setSelectedImage] = useState(0);
  const [editKind, setEditKind] = useState<EditKind | null>(null);
  const [prompt, setPrompt] = useState("");
  const [variantName, setVariantName] = useState("");
  const [styleReference, setStyleReference] = useState<string | null>(null);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = variants.find((item) => item.id === selectedId) ?? influencer;
  const images = Array.from(new Set([selected.imageUrl, ...(selected.gallery ?? [])].filter((url): url is string => Boolean(url))));
  const image = images[selectedImage] ?? images[0];
  const tier = CHARACTER_TYPES.find((type) => type.id === selected.tier)?.label ?? selected.tier;
  const traits = Object.entries(selected.selection).filter(([, values]) => values.length).map(([groupId, values]) => {
    const group = TRAIT_GROUPS.find((item) => item.id === groupId);
    return { id: groupId, label: group?.label ?? groupId, values: values.map((value) => group?.options.find((option) => option.id === value)?.label ?? value).join(", ") };
  });
  const busy = saving || generating || retrying || referenceLoading || deleting;
  const ready = selected.status === "completed" && Boolean(selected.imageUrl);
  const retryCost = selected.creditCost ?? (selected.creationMode === "edit" ? INFLUENCER_EDIT_COST : selected.creationMode === "prompt" ? INFLUENCER_PROMPT_COST : SHEET_COST);

  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { mounted.current = false; element?.close(); document.body.style.overflow = overflow; };
  }, []);

  useEffect(() => { if (editing) input.current?.select(); }, [editing]);
  useEffect(() => { if (editKind) promptInput.current?.focus(); }, [editKind]);

  function closeDetails() {
    if (busy) return;
    dialog.current?.close();
    onClose();
  }

  function chooseVersion(versionId: string) {
    if (busy) return;
    setSelectedId(versionId);
    setSelectedImage(0);
    setEditKind(null);
    setConfirmDelete(false);
    setError(null);
    setNotice("");
  }

  function openEditor(kind: EditKind) {
    if (editKind === kind) { promptInput.current?.focus(); return; }
    setEditKind(kind);
    setPrompt("");
    setVariantName("");
    setStyleReference(null);
    setError(null);
    setNotice("");
    setConfirmDelete(false);
  }

  async function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || actionRef.current) return;
    actionRef.current = true;
    setSaving(true);
    setNameError(null);
    try {
      const result = await renameInfluencerAction(influencer.id, name);
      if (!mounted.current) return;
      if ("error" in result) { setNameError(result.error); return; }
      onRename(influencer.id, result.name);
      setName(result.name);
      setEditing(false);
      setNotice("Nome salvo.");
      requestAnimationFrame(() => editButton.current?.focus());
    } catch {
      if (mounted.current) setNameError("Não foi possível salvar o nome. Tente novamente.");
    } finally { actionRef.current = false; if (mounted.current) setSaving(false); }
  }

  async function createVersion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionRef.current || busy || !ready || !editKind || !prompt.trim()) return;
    actionRef.current = true;
    setGenerating(true);
    setError(null);
    const request = {
      influencerId: selected.id,
      kind: editKind,
      prompt: prompt.trim(),
      ...(variantName.trim() ? { name: variantName.trim() } : {}),
      ...(editKind === "outfit" && styleReference ? { styleReferenceUrl: styleReference } : {}),
    };
    const signature = JSON.stringify(request);
    if (requestRef.current?.signature !== signature) requestRef.current = { signature, key: crypto.randomUUID() };
    try {
      const result = await createInfluencerVariantAction({ ...request, requestKey: requestRef.current.key });
      if (!mounted.current) return;
      if ("error" in result) {
        setError(result.error);
        if (result.retryable === true) requestRef.current = null;
        await onRefresh();
        return;
      }
      requestRef.current = null;
      setSelectedId(result.id);
      setSelectedImage(0);
      setEditKind(null);
      setNotice("Nova versão enviada. Ela aparecerá aqui quando estiver pronta.");
      await onRefresh();
    } catch {
      if (mounted.current) setError("A conexão foi interrompida. Tente novamente para conferir o mesmo pedido sem duplicá-lo.");
    } finally {
      actionRef.current = false;
      if (mounted.current) setGenerating(false);
    }
  }

  async function retryVersion() {
    if (actionRef.current || busy) return;
    actionRef.current = true;
    setRetrying(true);
    setError(null);
    retryKeys.current[selected.id] ??= crypto.randomUUID();
    try {
      const result = await retryInfluencerAction(selected.id, retryKeys.current[selected.id]);
      if (!mounted.current) return;
      if ("error" in result) setError(result.error);
      else { setSelectedId(result.id); setSelectedImage(0); setNotice("Nova tentativa enviada."); }
      await onRefresh();
    } catch {
      if (mounted.current) setError("Não foi possível conferir a nova tentativa. Tente novamente para consultar o mesmo pedido.");
    } finally { actionRef.current = false; if (mounted.current) setRetrying(false); }
  }

  async function deleteVersion() {
    if (actionRef.current || busy || !selected.rootInfluencerId || selected.id === influencer.id) return;
    actionRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      await deleteInfluencerAction(selected.id);
      if (!mounted.current) return;
      setSelectedId(influencer.id);
      setSelectedImage(0);
      setConfirmDelete(false);
      setNotice("Versão excluída. As outras imagens continuam salvas.");
      await onRefresh();
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "Não foi possível excluir esta versão.");
    } finally { actionRef.current = false; if (mounted.current) setDeleting(false); }
  }

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); closeDetails(); }}>
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>Meus Influencers</span><h2 id={`${id}-title`}>{influencer.name}</h2></div>
        <button type="button" className="btn btn-ghost" aria-label="Fechar detalhes" onClick={closeDetails} disabled={busy}><X size={22} /></button>
      </header>
      <div className={styles.content}>
        <section className={styles.visual} aria-label="Imagens do influencer">
          <div className={styles.stage}>
            {image ? <img src={image} alt={`${influencer.name} — ${influencerVersionLabel(selected)} — imagem ${selectedImage + 1}`} /> : <div className={styles.placeholder} role="status">{selected.status === "queued" || selected.status === "processing" ? <span className="spinner" aria-hidden="true" /> : <ImageIcon size={40} />}<p>{selected.pendingImageUrl ? "Salvando a imagem gerada…" : selected.status === "failed" ? "Esta versão não foi gerada." : "Gerando sua nova imagem…"}</p></div>}
          </div>
          {images.length > 1 ? <div className={styles.thumbnails} aria-label="Escolher imagem">{images.map((url, index) => <button key={url} type="button" aria-label={`Ver imagem ${index + 1}`} aria-pressed={selectedImage === index} onClick={() => setSelectedImage(index)}><img src={url} alt="" /></button>)}</div> : null}
          {image ? <a className="btn btn-ghost" href={image} target="_blank" rel="noreferrer"><Download size={16} />Abrir imagem desta versão</a> : null}
        </section>
        <section className={styles.details} aria-label="Gerenciar influencer">
          {refreshError ? <div className={styles.refreshNotice} role="status"><p>{refreshError}</p><button type="button" className="btn btn-sm btn-ghost" disabled={busy || refreshing} onClick={() => { void onRefresh(); }}><RotateCcw size={14} />{refreshing ? "Atualizando…" : "Atualizar versões"}</button></div> : null}
          <div className={styles.section}>
            <div className={styles.sectionHeading}><h3>Nome do influencer</h3>{!editing ? <button ref={editButton} type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => { setName(influencer.name); setNameError(null); setNotice(""); setEditing(true); }}><Pencil size={15} />Editar nome</button> : null}</div>
            {editing ? <form onSubmit={saveName} className={styles.nameForm}>
              <label className="sr-only" htmlFor={`${id}-name`}>Novo nome do influencer</label>
              <input ref={input} id={`${id}-name`} className="input" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required disabled={busy} aria-describedby={nameError ? `${id}-name-error` : undefined} />
              <div className={styles.formActions}><button className="btn btn-accent" type="submit" disabled={busy || !name.trim()}><Save size={16} />{saving ? "Salvando…" : "Salvar nome"}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setEditing(false); setNameError(null); requestAnimationFrame(() => editButton.current?.focus()); }}>Cancelar</button></div>
              {nameError ? <p id={`${id}-name-error`} className="auth-error" role="alert">{nameError}</p> : null}
            </form> : <p className={styles.name}>{influencer.name}</p>}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeading}><h3>Roupas e versões</h3><span className={styles.muted}>{variants.length} {variants.length === 1 ? "versão" : "versões"}</span></div>
            <div className={styles.versions} role="group" aria-label="Escolher roupa ou versão">
              {variants.map((version) => <button type="button" key={version.id} className={styles.version} aria-pressed={selected.id === version.id} disabled={busy} onClick={() => chooseVersion(version.id)}>
                <span className={styles.versionImage}>{version.imageUrl ? <img src={version.imageUrl} alt="" loading="lazy" /> : version.status === "queued" || version.status === "processing" ? <span className="spinner" aria-hidden="true" /> : <ImageIcon size={24} />}{selected.id === version.id ? <Check className={styles.versionCheck} size={18} aria-hidden="true" /> : null}</span>
                <strong>{influencerVersionLabel(version)}</strong><small>{STATUS[version.status]}</small>
              </button>)}
            </div>
          </div>

          <div className={styles.versionActions}>
            <div className={styles.selectedHeading}><h3>{influencerVersionLabel(selected)}</h3><span className={styles.muted}>{STATUS[selected.status]}</span></div>
            {selected.error ? <p className="auth-error" role="alert">{selected.error}</p> : null}
            {selected.pendingImageUrl && selected.status === "processing" ? <button type="button" className="btn btn-ghost" disabled={busy || refreshing} onClick={() => { void onRefresh(); }}><RotateCcw size={16} />{refreshing ? "Conferindo imagem…" : "Tentar salvar novamente"}</button> : null}
            {ready ? <>
              <Link className="btn btn-accent" href={`/app/criar-videos?influencer=${encodeURIComponent(selected.id)}`}><Sparkles size={17} />Criar vídeo com esta versão</Link>
              <div className={styles.editChoices}><button type="button" className="btn btn-ghost" aria-pressed={editKind === "outfit"} disabled={busy} onClick={() => openEditor("outfit")}><Shirt size={17} />Editar roupa</button><button type="button" className="btn btn-ghost" aria-pressed={editKind === "details"} disabled={busy} onClick={() => openEditor("details")}><SlidersHorizontal size={17} />Corrigir detalhes</button></div>
            </> : selected.status === "failed" && !selected.submissionUncertain ? <button type="button" className="btn btn-ghost" disabled={busy || credits < retryCost} onClick={() => { void retryVersion(); }}><RotateCcw size={16} />{retrying ? "Enviando…" : `Gerar novamente · ✦ ${retryCost}`}</button> : null}
            {!ready && selected.status === "failed" && !selected.submissionUncertain && credits < retryCost ? <p className={styles.muted}>Você precisa de {retryCost} créditos para tentar novamente.</p> : null}
          </div>

          {editKind && ready ? <form onSubmit={createVersion} className={styles.editor} aria-labelledby={`${id}-editor`}>
            <h3 id={`${id}-editor`}>{editKind === "outfit" ? "Uma nova roupa" : "Ajustar este visual"}</h3>
            <div className="field"><label htmlFor={`${id}-edit-prompt`}>{editKind === "outfit" ? "Como deve ser a roupa?" : "O que você quer corrigir?"}</label><textarea ref={promptInput} id={`${id}-edit-prompt`} className="input" rows={4} required maxLength={3000} value={prompt} disabled={busy} onChange={(event) => setPrompt(event.target.value)} placeholder={editKind === "outfit" ? "Troque o terno por camiseta branca, jeans azul e tênis preto. Mantenha o rosto e o cabelo." : "Mude apenas a cor do cabelo para castanho escuro. Preserve o rosto, a roupa e os outros detalhes."} /></div>
            {editKind === "outfit" ? <ReferenceUpload label="Adicionar referência da roupa" previewLabel="Roupa de referência" value={styleReference} disabled={busy} onChange={setStyleReference} onLoadingChange={setReferenceLoading} /> : null}
            <div className="field"><label htmlFor={`${id}-version-name`}>Nome da versão <span className={styles.muted}>(opcional)</span></label><input id={`${id}-version-name`} className="input" value={variantName} onChange={(event) => setVariantName(event.target.value)} maxLength={80} disabled={busy} placeholder={editKind === "outfit" ? "Ex.: Look casual" : "Ex.: Cabelo castanho"} /></div>
            <p className={styles.muted}>A imagem atual continua salva. A edição cria uma nova versão.</p>
            <div className={styles.formActions}><button type="submit" className="btn btn-accent" disabled={busy || !prompt.trim() || credits < INFLUENCER_EDIT_COST}>{generating ? <><span className="spinner" aria-hidden="true" />Enviando…</> : <><Sparkles size={16} />Salvar nova versão · ✦ {INFLUENCER_EDIT_COST}</>}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setEditKind(null); setError(null); }}>Cancelar</button></div>
            {credits < INFLUENCER_EDIT_COST ? <p className={styles.muted}>Você precisa de {INFLUENCER_EDIT_COST} créditos. <Link href="/app/creditos">Comprar créditos</Link></p> : null}
          </form> : null}
          {error ? <p className="auth-error" role="alert">{error}</p> : null}
          <p className={styles.notice} role="status">{notice}</p>

          <details className={styles.moreDetails}>
            <summary>Ver mais detalhes</summary>
            <div className={styles.expandedDetails}>
              <dl className={styles.summary}><div><dt>Tipo de personagem</dt><dd>{selected.creationMode === "prompt" ? "Imagem + prompt" : tier}</dd></div><div><dt>Status</dt><dd>{STATUS[selected.status]}</dd></div><div><dt>Criado em</dt><dd>{displayDateTime(selected.createdAt, "long")}</dd></div></dl>
              {traits.length ? <div className={styles.section}><h3>Características de origem</h3><dl className={styles.traits}>{traits.map((trait) => <div key={trait.id}><dt>{trait.label}</dt><dd>{trait.values}</dd></div>)}</dl></div> : null}
              {selected.prompt ? <div className={styles.section}><h3>{selected.creationMode === "edit" ? "Alteração solicitada" : "Instruções da criação"}</h3><p className={styles.promptText}>{selected.prompt}</p></div> : null}
              {selected.referenceUrl ? <div className={styles.section}><h3>Imagem de referência</h3><a href={selected.referenceUrl} target="_blank" rel="noreferrer"><img className={styles.reference} src={selected.referenceUrl} alt="Imagem usada como referência nesta versão" /></a></div> : null}
              {selected.styleReferenceUrl ? <div className={styles.section}><h3>Referência da roupa</h3><a href={selected.styleReferenceUrl} target="_blank" rel="noreferrer"><img className={styles.reference} src={selected.styleReferenceUrl} alt="Roupa usada como referência nesta versão" /></a></div> : null}
              {selected.brief ? <details className={styles.brief}><summary>Descrição completa da geração</summary><p>{selected.brief}</p><span className={styles.muted}>Seed: {selected.seed}</span></details> : null}
              {selected.rootInfluencerId && selected.id !== influencer.id && (selected.status === "completed" || selected.status === "failed") && !selected.submissionUncertain ? <div className={styles.deleteVersion}>
                {confirmDelete ? <><p>Excluir “{influencerVersionLabel(selected)}”? As outras versões serão mantidas.</p><div className={styles.formActions}><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { void deleteVersion(); }}><Trash2 size={15} />{deleting ? "Excluindo…" : "Confirmar exclusão"}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancelar</button></div></> : <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Excluir esta versão</button>}
              </div> : null}
            </div>
          </details>
        </section>
      </div>
    </dialog>
  );
}
