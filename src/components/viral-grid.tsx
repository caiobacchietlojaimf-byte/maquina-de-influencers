"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Eye, Flame, Search, X } from "lucide-react";

import { createViralVideoAction } from "@/app/actions/videos";
import { VIDEO_COST } from "@/lib/costs";
import { buildViralPrompt } from "@/lib/prompt";
import { formatViews, VIRAL_EFFECTS, type ViralEffect } from "@/data/viral-effects";

type MiniInfluencer = { id: string; name: string; imageUrl: string };

const PLATFORMS = [
  { id: "all", label: "Todas" },
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram" },
  { id: "youtube", label: "YouTube" },
] as const;

export function ViralGrid({ influencers }: { influencers: MiniInfluencer[] }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ViralEffect | null>(null);
  const [pickedInfluencer, setPickedInfluencer] = useState<string | null>(influencers[0]?.id ?? null);
  const [extra, setExtra] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const list = useMemo(() => {
    const sorted = [...VIRAL_EFFECTS].sort((a, b) => b.views - a.views);
    return sorted.filter((effect) => {
      if (platform !== "all" && effect.platform !== platform) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        effect.name.toLowerCase().includes(q) ||
        effect.description.toLowerCase().includes(q) ||
        effect.tags.some((tag) => tag.includes(q))
      );
    });
  }, [platform, query]);

  const prompt = active ? buildViralPrompt(active.name, active.description, extra) : "";

  const duplicate = async () => {
    if (!active || !pickedInfluencer) return;
    setSubmitting(true);
    setError(null);
    const result = await createViralVideoAction({
      influencerId: pickedInfluencer,
      effectId: active.id,
      ...(extra.trim() ? { extraPrompt: extra.trim() } : {}),
    }).catch((caught: unknown) => ({ error: caught instanceof Error ? caught.message : String(caught) }));
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push("/app/videos");
  };

  return (
    <div>
      <div className="explore-bar" style={{ flexWrap: "wrap" }}>
        {PLATFORMS.map((p) => (
          <button key={p.id} type="button" className="chip" data-active={platform === p.id} onClick={() => setPlatform(p.id)}>
            {p.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: 10, color: "var(--tx3)" }} />
          <input
            className="input"
            style={{ height: 36, paddingLeft: 34, width: 220, borderRadius: 999 }}
            placeholder="Buscar tendência…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="viral-grid">
        {list.map((effect) => (
          <ViralCard key={effect.id} effect={effect} onDuplicate={() => setActive(effect)} />
        ))}
      </div>

      {active ? (
        <div className="modal-backdrop" onClick={() => setActive(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setActive(null)}>
              <X size={16} />
            </button>
            <h2>Duplicar “{active.name}”</h2>
            <p className="modal-sub">
              <Flame size={12} style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
              {formatViews(active.views)} de views na tendência · {active.platform}
            </p>

            <div style={{ display: "grid", gap: 16, marginTop: 18 }}>
              <video
                src={active.preview}
                poster={active.thumbnail}
                controls
                autoPlay
                muted
                loop
                playsInline
                style={{ borderRadius: 14, border: "1px solid var(--line)", maxHeight: 320, width: "100%", objectFit: "cover" }}
              />

              <div className="field">
                <label>Quem vai estrelar o vídeo?</label>
                {influencers.length ? (
                  <div className="influencer-pick">
                    {influencers.map((inf) => (
                      <button
                        type="button"
                        key={inf.id}
                        className="pick"
                        data-active={pickedInfluencer === inf.id}
                        onClick={() => setPickedInfluencer(inf.id)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={inf.imageUrl} alt={inf.name} />
                        <span>{inf.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--tx3)", fontSize: 13 }}>
                    Você ainda não tem influencer pronto.{" "}
                    <Link href="/app/influencers" style={{ color: "var(--accent)" }}>
                      Criar um agora →
                    </Link>
                  </p>
                )}
              </div>

              <div className="field">
                <label htmlFor="viral-extra">Toque pessoal (opcional)</label>
                <textarea
                  id="viral-extra"
                  className="input"
                  placeholder="Ex.: cenário em São Paulo à noite, roupa neon…"
                  value={extra}
                  onChange={(event) => setExtra(event.target.value)}
                />
              </div>

              <div className="field">
                <label>Prompt de duplicação (gerado automaticamente)</label>
                <div
                  style={{
                    position: "relative",
                    background: "var(--s1)",
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    padding: "12px 44px 12px 14px",
                    color: "var(--tx2)",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                  }}
                >
                  {prompt}
                  <button
                    type="button"
                    title="Copiar prompt"
                    style={{ position: "absolute", top: 10, right: 10, color: copied ? "var(--accent)" : "var(--tx3)" }}
                    onClick={() => {
                      navigator.clipboard.writeText(prompt).catch(() => undefined);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </div>

              {error ? <div className="auth-error">{error}</div> : null}

              <button
                type="button"
                className="generate-btn"
                disabled={submitting || !pickedInfluencer}
                onClick={duplicate}
              >
                {submitting ? <span className="spinner" /> : <>Duplicar vídeo <span className="cost">✦ {VIDEO_COST}</span></>}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ViralCard({ effect, onDuplicate }: { effect: ViralEffect; onDuplicate: () => void }) {
  const [hover, setHover] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (hover) videoRef.current?.play().catch(() => undefined);
    else videoRef.current?.pause();
  }, [hover]);

  return (
    <article className="viral-card" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="media">
        {hover ? (
          <video ref={videoRef} src={effect.preview} poster={effect.thumbnail} muted loop playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={effect.thumbnail} alt={effect.name} loading="lazy" />
        )}
        <span className="views">
          <Eye size={13} />
          {formatViews(effect.views)}
        </span>
        <span className="platform">{effect.platform}</span>
      </div>
      <div className="body">
        <h3>{effect.name}</h3>
        <p>{effect.description}</p>
        <div className="tags">
          {effect.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
        <div className="foot">
          <button type="button" className="btn btn-accent btn-sm" style={{ flex: 1 }} onClick={onDuplicate}>
            <Flame size={14} />
            Duplicar com meu influencer
          </button>
        </div>
      </div>
    </article>
  );
}
