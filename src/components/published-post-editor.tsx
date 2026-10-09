"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, RefreshCw, Save, Undo2, WandSparkles, X } from "lucide-react";
import { getPublishedPostEditorAction, savePublishedCaptionDraftAction, syncPublishedPostCaptionAction } from "@/app/actions/published-post-editor";
import { improvePublicationAction } from "@/app/actions/publication-assistant";
import type { PublishedPostEditorSnapshot } from "@/lib/published-post-editor";
import type { PublicationSuggestion } from "@/lib/publication-assistant-types";
import { CAPTION_GOALS, CAPTION_LIMIT, type CaptionGoal } from "@/lib/publish-caption";
import { displayDateTime } from "@/lib/display-date";
import styles from "./published-post-editor.module.css";

type Props = {
  postId: string;
  onClose: () => void;
  onSynced: (editor: PublishedPostEditorSnapshot) => void;
};
type Operation = "loading" | "saving" | "syncing" | "improving";
type Improvement = { suggestion: PublicationSuggestion; originalCaption: string; selectedCaption: string; revision: number };
type Undo = { originalCaption: string; appliedCaption: string; revision: number };

export function publishedInstagramUrl(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["instagram.com", "www.instagram.com"].includes(url.hostname) || !/^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return;
    return `${url.origin}${url.pathname}`;
  } catch { return; }
}

function alternatives(suggestion: PublicationSuggestion) {
  const options = [{ label: "Principal", caption: suggestion.caption }, ...suggestion.alternatives];
  return options.filter((option, index) => options.findIndex(other => other.caption === option.caption) === index).slice(0, 3);
}

/** Editing a published caption prepares a local draft; the user applies it in Instagram. */
export function PublishedPostEditor(props: Props) {
  return <PublishedPostEditorDialog key={props.postId} {...props} />;
}

function PublishedPostEditorDialog({ postId, onClose, onSynced }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const alive = useRef(true);
  const request = useRef<{ kind: Operation; timer: ReturnType<typeof setTimeout> } | null>(null);
  const loaded = useRef(false);
  const revision = useRef(0);
  const [editor, setEditor] = useState<PublishedPostEditorSnapshot | null>(null);
  const [caption, setCaption] = useState("");
  const [goal, setGoal] = useState<CaptionGoal>("comments");
  const [operation, setOperation] = useState<Operation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [improvement, setImprovement] = useState<Improvement | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [context, setContext] = useState<PublicationSuggestion | null>(null);
  const instagramUrl = publishedInstagramUrl(editor?.permalink);
  const validCaption = Boolean(caption.trim()) && caption.length <= CAPTION_LIMIT;
  const hasUnsavedChanges = Boolean(editor && caption !== (editor.draft?.caption ?? editor.currentCaption));
  const canUndo = Boolean(undo && undo.revision === revision.current && undo.appliedCaption === caption);

  useEffect(() => {
    alive.current = true;
    const element = dialog.current;
    element?.showModal();
    return () => {
      alive.current = false;
      if (request.current) clearTimeout(request.current.timer);
      request.current = null;
      element?.close();
    };
  }, []);

  useEffect(() => { loadEditor(); }, []);

  function run<T>(kind: Operation, action: () => Promise<T>, accept: (result: T) => void, failure: string) {
    if (request.current || !alive.current) return;
    setOperation(kind);
    setError(null);
    setConflict(false);
    setNotice(null);
    const current = { kind, timer: setTimeout(() => {
      if (!alive.current || request.current !== current) return;
      request.current = null;
      setOperation(null);
      setError(kind === "saving" ? "A confirmação demorou. Seu texto foi mantido. Recarregue os dados para conferir se a edição foi salva." : "A consulta demorou. Seu texto foi mantido. Tente novamente.");
      if (kind === "saving") setConflict(true);
    }, 80_000) };
    request.current = current;
    startTransition(() => {
      void action().then(result => {
        if (alive.current && request.current === current) accept(result);
      }).catch(() => {
        if (alive.current && request.current === current) {
          setError(failure);
          if (kind === "saving" || (kind === "loading" && loaded.current)) setConflict(true);
        }
      }).finally(() => {
        clearTimeout(current.timer);
        if (alive.current && request.current === current) { request.current = null; setOperation(null); }
      });
    });
  }

  function acceptEditor(next: PublishedPostEditorSnapshot): boolean {
    if (next.postId !== postId || next.platform !== "instagram") {
      setError("Não foi possível conferir os dados desta publicação.");
      return false;
    }
    setEditor(next);
    if (!loaded.current) {
      setCaption(next.draft?.caption ?? next.currentCaption);
      loaded.current = true;
    }
    return true;
  }

  function loadEditor() {
    run("loading", () => getPublishedPostEditorAction(postId), result => {
      if ("error" in result) { setError(result.error); return; }
      const alreadyLoaded = loaded.current;
      if (acceptEditor(result.editor) && alreadyLoaded) setNotice("Dados recarregados. Seu texto em edição foi preservado.");
    }, "Não foi possível abrir a edição desta publicação. Tente novamente.");
  }

  function editCaption(value: string) {
    revision.current++;
    setCaption(value);
    setUndo(null);
    setNotice(null);
  }

  function improve() {
    if (!editor?.canImprove || !validCaption || request.current) return;
    const originalCaption = caption;
    const sentRevision = revision.current;
    setImprovement(null);
    setUndo(null);
    run("improving", () => improvePublicationAction({ videoId: editor.videoId, platform: "instagram", goal, caption: originalCaption }), result => {
      if ("error" in result) { setError(result.error); return; }
      if (result.suggestion.videoId !== editor.videoId) { setError("Não foi possível conferir a sugestão deste vídeo. Sua legenda foi mantida."); return; }
      setImprovement({ suggestion: result.suggestion, originalCaption, selectedCaption: result.suggestion.caption, revision: sentRevision });
      setContext(result.suggestion);
    }, "Não foi possível melhorar o post agora. Sua legenda foi mantida.");
  }

  function applyImprovement() {
    if (!improvement || operation) return;
    const originalCaption = caption;
    editCaption(improvement.selectedCaption);
    setUndo({ originalCaption, appliedCaption: improvement.selectedCaption, revision: revision.current });
    setImprovement(null);
  }

  function undoImprovement() {
    if (!undo || operation || undo.revision !== revision.current || undo.appliedCaption !== caption) return;
    editCaption(undo.originalCaption);
  }

  function changeGoal(value: CaptionGoal) {
    if (goal === value) return;
    if (request.current?.kind === "improving") {
      clearTimeout(request.current.timer);
      request.current = null;
      setOperation(null);
    }
    setImprovement(null);
    setContext(null);
    setUndo(null);
    setGoal(value);
  }

  function saveDraft() {
    if (!editor || caption.length > CAPTION_LIMIT || request.current) return;
    const sentRevision = revision.current;
    run("saving", () => savePublishedCaptionDraftAction({ postId, caption, baseRevision: editor.revision }), result => {
      if ("error" in result) { setError(result.error); setConflict(Boolean(result.conflict)); return; }
      if (acceptEditor(result.editor)) setNotice(sentRevision === revision.current ? "Edição salva no sistema. Copie a legenda para aplicar no Instagram." : "A versão enviada foi salva. Há alterações mais recentes no campo que ainda precisam ser salvas.");
    }, "Não foi possível confirmar o salvamento. Seu texto foi mantido; recarregue os dados antes de tentar novamente.");
  }

  function syncCaption() {
    if (!editor?.canSync || request.current) return;
    const currentText = caption;
    const sentRevision = revision.current;
    run("syncing", () => syncPublishedPostCaptionAction(postId), result => {
      if ("error" in result) { setError(result.error); setConflict(Boolean(result.conflict)); return; }
      if (!acceptEditor(result.editor)) return;
      onSynced(result.editor);
      setNotice(sentRevision === revision.current && result.editor.currentCaption === currentText
        ? result.editor.currentCaption !== editor.currentCaption ? "Alteração confirmada no Instagram." : "A legenda do sistema confere com a do Instagram."
        : "Legenda conferida no Instagram. Seu texto em edição foi mantido; compare os dois antes de continuar.");
    }, "Não foi possível conferir a legenda no Instagram. Seu texto em edição foi mantido.");
  }

  async function copyCaption() {
    const sentRevision = revision.current;
    try {
      await navigator.clipboard.writeText(caption);
      if (alive.current) setNotice(sentRevision === revision.current ? "Legenda copiada." : "Texto copiado. Você fez outras alterações depois da cópia.");
    } catch {
      if (alive.current) setError("Não foi possível copiar automaticamente. Selecione a legenda e copie pelo teclado.");
    }
  }

  function close() {
    alive.current = false;
    if (request.current) clearTimeout(request.current.timer);
    request.current = null;
    onClose();
  }

  return <dialog ref={dialog} className={`modal ${styles.dialog}`} aria-labelledby="published-editor-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  }}>
    <button type="button" className="modal-close" onClick={close} aria-label="Fechar edição"><X size={16} /></button>
    <h2 id="published-editor-title" className={styles.heading}>Editar post publicado</h2>
    <p className={styles.instruction}>A legenda é aplicada no Instagram. Copie o texto, abra a publicação e escolha Editar.</p>
    {!editor ? <div className={styles.editor}>
      <div className={styles.status} role="status">{operation === "loading" ? <><span className="spinner" aria-hidden="true" />Carregando publicação…</> : null}</div>
      {error ? <><p className={styles.error} role="alert">{error}</p><button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(operation)} onClick={loadEditor}><RefreshCw size={14} />Tentar novamente</button></> : null}
    </div> : <div className={styles.editor}>
      <div className={styles.labelRow}>
        <label htmlFor="published-caption">Legenda em edição</label>
        <button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(operation) || !validCaption || !editor.canImprove} onClick={improve}><WandSparkles size={14} aria-hidden="true" />Melhorar post</button>
      </div>
      <textarea id="published-caption" className={`input ${styles.caption}`} value={caption} onChange={event => editCaption(event.target.value)} aria-describedby="published-caption-meta" />
      <div id="published-caption-meta" className={styles.counter}><span>{hasUnsavedChanges ? "Alterações ainda não salvas" : editor.draft ? "Edição salva no sistema" : "Texto da publicação"}</span><span data-warning={caption.length > CAPTION_LIMIT}>{caption.length.toLocaleString("pt-BR")} / {CAPTION_LIMIT.toLocaleString("pt-BR")}</span></div>
      {!editor.canImprove ? <p className={styles.help}>O vídeo original não está disponível para melhoria com IA. Você pode editar a legenda manualmente.</p> : null}
      <div className={styles.status} role="status" aria-live="polite">{operation ? <><span className="spinner" aria-hidden="true" />{({ loading: "Recarregando dados…", saving: "Salvando edição…", syncing: "Conferindo no Instagram…", improving: "Melhorando seu post…" })[operation]}</> : notice ? <><Check size={14} aria-hidden="true" />{notice}</> : improvement ? "Melhoria pronta para comparar." : null}</div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {conflict ? <button type="button" className={`btn btn-ghost btn-sm ${styles.checkButton}`} disabled={Boolean(operation)} onClick={loadEditor}><RefreshCw size={14} />Recarregar dados sem apagar meu texto</button> : null}
      {improvement ? <section className={styles.improvement} aria-labelledby="published-improvement-title">
        <h3 id="published-improvement-title">Sugestão de melhoria</h3>
        <div className={styles.variants} role="group" aria-label="Variações da melhoria">{alternatives(improvement.suggestion).map((option, index) => <button type="button" className="chip" key={`${index}-${option.label}`} aria-pressed={option.caption === improvement.selectedCaption} data-active={option.caption === improvement.selectedCaption} disabled={Boolean(operation)} onClick={() => setImprovement(current => current ? { ...current, selectedCaption: option.caption } : null)}>{option.label}</button>)}</div>
        <p className={styles.captionText} tabIndex={0}>{improvement.selectedCaption}</p>
        <details className={styles.details}><summary>Comparar com o texto enviado</summary><div className={styles.detailsBody}><p className={styles.captionText} tabIndex={0}>{improvement.originalCaption}</p></div></details>
        {improvement.revision !== revision.current ? <p className={styles.help}>Você editou a legenda durante a melhoria. Compare também com seu texto atual acima.</p> : null}
        <div className={styles.actions}><button type="button" className="btn btn-accent btn-sm" disabled={Boolean(operation) || !improvement.selectedCaption.trim() || improvement.selectedCaption.length > CAPTION_LIMIT} onClick={applyImprovement}>Aplicar melhoria</button><button type="button" className="btn btn-ghost btn-sm" disabled={Boolean(operation)} onClick={() => setImprovement(null)}>Descartar</button></div>
      </section> : null}
      {canUndo ? <button type="button" className={`btn btn-ghost btn-sm ${styles.checkButton}`} disabled={Boolean(operation)} onClick={undoImprovement}><Undo2 size={13} />Desfazer melhoria</button> : null}
      <details className={styles.details}><summary>{editor.checkedAt ? "Legenda conferida no Instagram" : "Legenda registrada na publicação"}</summary><div className={styles.detailsBody}><p className={styles.captionText} tabIndex={0}>{editor.currentCaption || "Sem legenda."}</p>{editor.checkedAt ? <p className={styles.help}>Última conferência: {displayDateTime(editor.checkedAt, "short")}</p> : <p className={styles.help}>Use Conferir alteração para consultar a legenda atual no Instagram.</p>}</div></details>
      {editor.draft && editor.draft.caption !== caption ? <details className={styles.details}><summary>Edição salva no sistema</summary><div className={styles.detailsBody}><p className={styles.captionText} tabIndex={0}>{editor.draft.caption}</p></div></details> : null}
      <details className={styles.details}><summary>Objetivo e contexto da melhoria</summary><div className={styles.detailsBody}>
        <div className="field"><label htmlFor="published-goal">Objetivo da publicação</label><select id="published-goal" className="input" value={goal} disabled={Boolean(operation && operation !== "improving")} onChange={event => changeGoal(event.target.value as CaptionGoal)}>{Object.entries(CAPTION_GOALS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></div>
        {context ? <><p className={styles.help}>{context.source.title}</p>{context.keywords.length ? <div className={styles.keywords} aria-label="Palavras-chave">{context.keywords.map(keyword => <span key={keyword}>{keyword}</span>)}</div> : null}{context.notice ? <p className={styles.help}>{context.notice}</p> : null}</> : null}
      </div></details>
      <div className={styles.footer}>
        <div className={styles.actions}>
          <button type="button" className="btn btn-accent btn-sm" disabled={Boolean(operation) || caption.length > CAPTION_LIMIT || !hasUnsavedChanges} onClick={saveDraft}><Save size={14} />Salvar edição no sistema</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!caption.trim() && !hasUnsavedChanges && !editor.draft} onClick={copyCaption}><Copy size={14} />Copiar legenda</button>
          {instagramUrl ? <a className="btn btn-ghost btn-sm" href={instagramUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Abrir no Instagram</a> : null}
        </div>
        <button type="button" className={`btn btn-ghost btn-sm ${styles.checkButton}`} disabled={Boolean(operation) || !editor.canSync} onClick={syncCaption}><RefreshCw size={14} />Conferir alteração</button>
        {editor.connectionMessage ? <p className={styles.help}>{editor.connectionMessage}</p> : null}
      </div>
    </div>}
  </dialog>;
}
