"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Film, Flame, Trash2, Wand2 } from "lucide-react";

import { deleteVideoAction, pollVideosAction } from "@/app/actions/videos";
import type { Video } from "@/lib/db";

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
          <Link href="/app/influencers?aba=movimento" className="btn btn-accent">
            <Wand2 size={16} />
            Aplicar movimento
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
              {video.status === "completed" && video.resultUrl ? (
                <video
                  src={video.resultUrl}
                  poster={video.thumbnailUrl}
                  controls
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
              ) : video.status === "failed" ? (
                <div className="pending">
                  <span style={{ color: "var(--danger)", fontSize: 13, padding: "0 14px", textAlign: "center" }}>
                    {video.error ?? "A geração falhou"}
                  </span>
                </div>
              ) : (
                <div className="pending skeleton">
                  <span className="spinner" />
                  <span className="hint">Gerando o vídeo…</span>
                </div>
              )}
              <span className="status-tag" data-status={video.status}>
                {video.status === "completed" ? (
                  video.kind === "viral" ? "Viral" : "Movimento"
                ) : video.status === "failed" ? (
                  "Falhou"
                ) : (
                  "Gerando"
                )}
              </span>
              <div className="actions">
                {video.status === "completed" && video.resultUrl ? (
                  <a href={video.resultUrl} target="_blank" rel="noreferrer" title="Baixar vídeo">
                    <Download size={14} />
                  </a>
                ) : null}
                <button
                  type="button"
                  title="Excluir"
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
          </div>
        ))}
      </div>
    </div>
  );
}
