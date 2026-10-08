"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Film, Flame, Send, Trash2, Wand2 } from "lucide-react";

import { deleteVideoAction, pollVideosAction } from "@/app/actions/videos";
import type { Video } from "@/lib/db";
import { editModelLabel } from "@/lib/character-edit";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "motion", label: "Movimento" },
  { id: "viral", label: "Virais" },
] as const;

export function VideosGallery({ initialVideos }: { initialVideos: Video[] }) {
  const [videos, setVideos] = useState<Video[]>(initialVideos);
  const [filter, setFilter] = useState<string>("all");
  const hasPending = videos.some((v) => v.status === "processing" || v.status === "queued");

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => {
      pollVideosAction()
        .then(setVideos)
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [hasPending]);

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
              {(video.status === "completed" || video.status === "review") && video.resultUrl ? (
                <video
                  src={video.resultUrl}
                  poster={video.thumbnailUrl}
                  controls
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  style={{ objectFit: "contain" }}
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
                {video.status === "completed" ? (
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
                    <a href={video.resultUrl} target="_blank" rel="noreferrer" title="Baixar vídeo">
                      <Download size={14} />
                    </a>
                  </>
                ) : null}
                <button
                  type="button"
                  title="Excluir"
                  disabled={Boolean(video.edit && (video.status === "queued" || video.status === "processing" || (video.status === "review" && !video.resultUrl)))}
                  onClick={async () => {
                    await deleteVideoAction(video.id);
                    setVideos((prev) => prev.filter((v) => v.id !== video.id));
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
                {new Date(video.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
              </span>
            </div>
            {video.edit && <div style={{ padding: "0 14px 14px", display: "grid", gap: 8, fontSize: 12 }}>
              <span>{editModelLabel(video.edit.model)}{video.edit.resolution !== "auto" ? ` · ${video.edit.resolution}` : ""}</span>
              {video.edit.result && <span>Resultado: {video.edit.result.width} × {video.edit.result.height}</span>}
              <span>Original: {video.edit.source.duration.toFixed(2)}s{video.edit.result ? ` · Resultado: ${video.edit.result.duration.toFixed(2)}s` : ""}</span>
              {video.edit.audioPreserved && <span>Áudio original preservado · duração e proporção conferidas</span>}
              {video.error && <p role="status" style={{ color: "var(--danger)" }}>{video.error}</p>}
              <details>
                <summary style={{ cursor: "pointer" }}>Comparar com o original</summary>
                <video src={video.edit.sourceUrl} controls playsInline preload="none" style={{ width: "100%", marginTop: 8 }} aria-label={`Original de ${video.presetName ?? "vídeo"}`} />
                <p>{video.edit.target}</p>
              </details>
              {video.edit.segments && video.edit.segments.length > 1 && <details>
                <summary style={{ cursor: "pointer" }}>Trechos da edição ({video.edit.segments.length})</summary>
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
