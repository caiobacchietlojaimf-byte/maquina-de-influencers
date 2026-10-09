"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, Flame, Send, Trash2, Wand2 } from "lucide-react";

import { deleteVideoAction, pollVideosAction } from "@/app/actions/videos";
import type { Video } from "@/lib/db";
import { editModelLabel } from "@/lib/character-edit";
import { canFinalizeExistingEdit, finalizeEditClient } from "@/lib/finalize-edit-client";
import { displayDate } from "@/lib/display-date";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "motion", label: "Movimento" },
  { id: "viral", label: "Virais" },
] as const;

export function VideosGallery({ initialVideos }: { initialVideos: Video[] }) {
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [filter, setFilter] = useState<string>("all");
  const [finalizing, setFinalizing] = useState<Set<string>>(() => new Set());
  const [finalizationErrors, setFinalizationErrors] = useState<Record<string, string>>({});
  const activeFinalizations = useRef(new Map<string, AbortController>());
  const pollRevision = useRef(0);
  const pollInFlight = useRef(false);
  const [pollError, setPollError] = useState("");
  const hasPending = videos.some((v) => v.status === "processing" || v.status === "queued");

  useEffect(() => () => {
    for (const controller of activeFinalizations.current.values()) controller.abort();
    activeFinalizations.current.clear();
    pollRevision.current++;
  }, []);

  useEffect(() => {
    if (!hasPending) return;
    let disposed = false;
    const timer = setInterval(() => {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      const revision = pollRevision.current;
      pollVideosAction()
        .then(items => {
          if (disposed || revision !== pollRevision.current) return;
          setPollError("");
          setVideos(current => items.map(item => activeFinalizations.current.has(item.id) ? current.find(video => video.id === item.id) ?? item : item));
        })
        .catch(() => { if (!disposed) setPollError("Não foi possível atualizar as gerações agora. Os pedidos foram preservados; a consulta será repetida sem gerar outro vídeo."); })
        .finally(() => { pollInFlight.current = false; });
    }, 4000);
    return () => { disposed = true; clearInterval(timer); };
  }, [hasPending]);

  async function finalize(video: Video) {
    if (!canFinalizeExistingEdit(video) || activeFinalizations.current.has(video.id)) return;
    const controller = new AbortController();
    activeFinalizations.current.set(video.id, controller);
    pollRevision.current++;
    setFinalizing(current => new Set(current).add(video.id));
    setFinalizationErrors(current => ({ ...current, [video.id]: "" }));
    try {
      const result = await finalizeEditClient(video.id, { signal: controller.signal });
      if (activeFinalizations.current.get(video.id) !== controller) return;
      pollRevision.current++;
      if (result.video) setVideos(current => current.map(item => item.id === video.id ? result.video! : item));
      if (result.error) setFinalizationErrors(current => ({ ...current, [video.id]: result.error! }));
    } catch (error) {
      if (activeFinalizations.current.get(video.id) !== controller) return;
      setFinalizationErrors(current => ({ ...current, [video.id]: error instanceof Error ? error.message : "Não foi possível confirmar a finalização. Atualize a página para conferir o vídeo." }));
    } finally {
      if (activeFinalizations.current.get(video.id) === controller) {
        activeFinalizations.current.delete(video.id);
        pollRevision.current++;
        setFinalizing(current => { const next = new Set(current); next.delete(video.id); return next; });
      }
    }
  }

  const list = useMemo(
    () => (filter === "all" ? videos : videos.filter((v) => v.kind === filter)),
    [videos, filter],
  );

  if (!videos.length) {
    return (
      <div className="empty-state">
        <div className="big">Nenhum vídeo ainda</div>
        <p>Aplique um movimento no seu influencer ou duplique uma tendência viral.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/app/criar-videos" className="btn btn-accent">
            <Wand2 size={16} />
            Criar Vídeos
          </Link>
          <Link href="/app/virais" className="btn btn-ghost">
            <Flame size={16} />
            Ver tendências
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {pollError && <p role="status" style={{ color: "var(--tx2)", marginBottom: 16 }}>{pollError}</p>}
      <div className="explore-bar">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="chip" data-active={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="history-grid">
        {list.map((video) => (
          <div key={video.id} className="gen-card">
            <div className="media" style={{ aspectRatio: "9 / 12" }}>
              {finalizing.has(video.id) ? (
                <div className="pending skeleton" role="status"><span className="spinner" /><span className="hint">Finalizando vídeo e áudio…</span></div>
              ) : (video.status === "completed" || video.status === "review") && video.resultUrl ? (
                <video
                  src={video.resultUrl}
                  poster={video.thumbnailUrl}
                  controls
                  loop
                  playsInline
                  preload="metadata"
                  style={{ objectFit: "contain" }}
                  aria-label={`${video.status === "completed" ? "Vídeo completo" : "Resultado para revisão"}: ${video.presetName ?? "Vídeo"}`}
                />
              ) : video.status === "failed" || video.status === "review" ? (
                <div className="pending">
                  <span style={{ color: "var(--danger)", fontSize: 13, padding: "0 14px", textAlign: "center" }}>
                    {video.error ?? "A geração falhou"}
                  </span>
                </div>
              ) : (
                <div className="pending skeleton">
                  <span className="spinner" />
                  <span className="hint">{video.finalizationStartedAt ? "Conferindo vídeo e preservando áudio…" : "Gerando o vídeo…"}</span>
                </div>
              )}
              <span className="status-tag" data-status={video.status}>
                {finalizing.has(video.id) ? "Finalizando" : video.status === "completed" ? (
                  video.edit ? "Personagem trocado" : video.kind === "viral" ? "Viral" : "Movimento"
                ) : video.status === "review" ? (
                  "Precisa de revisão"
                ) : video.status === "failed" ? (
                  "Falhou"
                ) : (
                  "Gerando"
                )}
              </span>
              <div className="actions">
                {(video.status === "completed" || video.status === "review") && video.resultUrl ? (
                  <>
                    {video.status === "completed" && <Link href={`/app/publicar?video=${video.id}`} title="Publicar nas redes">
                      <Send size={14} />
                    </Link>}
                    <a href={video.resultUrl} target="_blank" rel="noreferrer" title={video.status === "completed" ? "Baixar vídeo completo" : "Abrir resultado para revisão"}>
                      <Download size={14} />
                    </a>
                  </>
                ) : null}
                <button
                  type="button"
                  title="Excluir"
                  disabled={finalizing.has(video.id) || Boolean((video.edit || video.requestFingerprint) && (video.status === "queued" || video.status === "processing" || (video.status === "review" && !video.resultUrl)))}
                  onClick={async () => {
                    try {
                      await deleteVideoAction(video.id);
                      setVideos((prev) => prev.filter((v) => v.id !== video.id));
                    } catch { setPollError("Não foi possível excluir este vídeo. Aguarde a confirmação do pedido e tente novamente."); }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="body">
              <b title={video.prompt}>
                <Film size={12} style={{ display: "inline", verticalAlign: "-1px", marginRight: 5 }} />
                {video.presetName ?? "Vídeo"}
              </b>
              <span>
                {displayDate(video.createdAt, "short")}
              </span>
            </div>
            {video.edit && <div style={{ padding: "0 14px 14px", display: "grid", gap: 8, fontSize: 12 }}>
              <span>{editModelLabel(video.edit.model)}{video.edit.resolution !== "auto" ? ` · ${video.edit.resolution}` : ""}</span>
              {video.edit.result && <span>Resultado: {video.edit.result.width} × {video.edit.result.height}</span>}
              <span>Original: {video.edit.source.duration.toFixed(2)}s{video.edit.result ? ` · Resultado: ${video.edit.result.duration.toFixed(2)}s` : ""}</span>
              {video.edit.audioPreserved && <span>{video.status === "review" ? "Áudio original preservado · confira o aviso da edição" : "Áudio original preservado · duração e proporção conferidas"}</span>}
              {video.error && <p role="status" style={{ color: "var(--danger)" }}>{video.error}</p>}
              {canFinalizeExistingEdit(video) && <>
                <button type="button" className="btn btn-accent btn-sm" disabled={finalizing.has(video.id)} onClick={() => void finalize(video)}>
                  {finalizing.has(video.id) ? <><span className="spinner" />Finalizando vídeo e áudio…</> : <><Film size={14} />Finalizar vídeo completo</>}
                </button>
                <p style={{ color: "var(--tx2)", lineHeight: 1.5 }}>Reúne os resultados disponíveis e restaura o áudio original. Sem nova geração ou cobrança de créditos.</p>
              </>}
              {finalizationErrors[video.id] && finalizationErrors[video.id] !== video.error && <p role="alert" style={{ color: "var(--danger)" }}>{finalizationErrors[video.id]}</p>}
              <details>
                <summary style={{ cursor: "pointer" }}>Comparar com o original</summary>
                <video src={video.edit.sourceUrl} controls playsInline preload="none" style={{ width: "100%", marginTop: 8 }} aria-label={`Original de ${video.presetName ?? "vídeo"}`} />
                <p>{video.edit.target}</p>
              </details>
              {video.edit.segments && video.edit.segments.length > 1 && <details>
                <summary style={{ cursor: "pointer" }}>Trechos gerados antes da finalização ({video.edit.segments.length})</summary>
                <p style={{ color: "var(--tx2)", marginTop: 8, lineHeight: 1.5 }}>Estes são os arquivos separados recebidos da IA. O áudio original é restaurado no vídeo completo após a finalização.</p>
                {video.edit.segments.map((part, index) => <div key={part.sourceUrl} style={{ marginTop: 8 }}>
                  <p>Trecho {index + 1} · {part.source.duration.toFixed(2)}s{part.requestId ? ` · Pedido ${part.requestId}` : ""}</p>
                  {part.resultUrl && <video src={part.resultUrl} controls playsInline preload="none" style={{ width: "100%" }} aria-label={`Resultado do trecho ${index + 1}`} />}
                </div>)}
              </details>}
            </div>}
          </div>
        ))}
      </div>
    </div>
  );
}
