"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Clock3,
  Download as DownloadIcon,
  ExternalLink,
  Eye,
  Flame,
  Heart,
  Link2,
  Music2,
  Pickaxe,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

import {
  duplicateMinedViralAction,
  getMinedViralsAction,
  importViralAction,
  refreshViralsAction,
} from "@/app/actions/virals";
import { toggleFollowAction } from "@/app/actions/profiles";
import { VIDEO_COST } from "@/lib/costs";
import { AI_PROFILES } from "@/data/ai-profiles";
import { formatViews } from "@/data/viral-effects";
import type { Viral } from "@/lib/db";
import { ViralGrid } from "./viral-grid";

type MiniInfluencer = { id: string; name: string; imageUrl: string };

const REGIONS = [
  { id: "BR", label: "🇧🇷 Brasil" },
  { id: "US", label: "🇺🇸 EUA" },
  { id: "ES", label: "🇪🇸 Espanha" },
  { id: "JP", label: "🇯🇵 Japão" },
] as const;

export function MinedVirals({
  initialVirals,
  influencers,
  initialFollows,
}: {
  initialVirals: Viral[];
  influencers: MiniInfluencer[];
  initialFollows: string[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"mined" | "effects" | "profiles">("mined");
  const [region, setRegion] = useState("BR");
  const [virals, setVirals] = useState<Viral[]>(initialVirals);
  const [follows, setFollows] = useState<string[]>(initialFollows);
  const [mining, startMining] = useTransition();

  // Mineração em background: a página carrega na hora com o cache do banco e
  // o feed fresco chega sozinho (sem travar o primeiro render).
  useEffect(() => {
    getMinedViralsAction("BR")
      .then((result) => {
        if (result.virals.length) setVirals(result.virals);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [importUrl, setImportUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const [active, setActive] = useState<Viral | null>(null);
  const [pickedInfluencer, setPickedInfluencer] = useState<string | null>(influencers[0]?.id ?? null);
  const [extra, setExtra] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeRegion = (next: string) => {
    setRegion(next);
    startMining(async () => {
      const result = await getMinedViralsAction(next);
      setVirals(result.virals);
      setNotice(result.error ?? null);
    });
  };

  const refresh = () => {
    startMining(async () => {
      const result = await refreshViralsAction(region);
      setVirals(result.virals);
      setNotice(result.error ?? null);
    });
  };

  const importByUrl = () => {
    if (!importUrl.trim()) return;
    startMining(async () => {
      const result = await importViralAction(importUrl);
      setVirals(result.virals);
      setNotice(result.error ?? null);
      if (!result.error) setImportUrl("");
    });
  };

  const duplicate = async () => {
    if (!active || !pickedInfluencer) return;
    setSubmitting(true);
    setError(null);
    const result = await duplicateMinedViralAction({
      viralId: active.id,
      influencerId: pickedInfluencer,
      ...(extra.trim() ? { extraPrompt: extra.trim() } : {}),
    }).catch((caught: unknown) => ({ error: caught instanceof Error ? caught.message : String(caught) }));
    setSubmitting(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    router.push("/app/videos");
  };

  const list = useMemo(() => virals, [virals]);

  return (
    <div>
      <div className="explore-bar" style={{ flexWrap: "wrap" }}>
        <button type="button" className="chip" data-active={tab === "mined"} onClick={() => setTab("mined")}>
          <Pickaxe size={14} />
          Tendências agora
        </button>
        <button type="button" className="chip" data-active={tab === "effects"} onClick={() => setTab("effects")}>
          <Sparkles size={14} />
          Efeitos virais
        </button>
        <button type="button" className="chip" data-active={tab === "profiles"} onClick={() => setTab("profiles")}>
          <Heart size={14} />
          Perfis de IA em alta
          {follows.length ? <span className="badge-new">{follows.length}</span> : null}
        </button>
      </div>

      {tab === "profiles" ? (
        <ProfilesGrid follows={follows} onToggle={async (handle) => {
          const updated = await toggleFollowAction(handle).catch(() => null);
          if (updated) setFollows(updated);
        }} />
      ) : null}

      {tab === "effects" ? (
        <ViralGrid influencers={influencers} />
      ) : null}

      {tab === "mined" ? (
        <>
          <div className="explore-bar" style={{ flexWrap: "wrap" }}>
            {REGIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                className="chip"
                data-active={region === r.id}
                onClick={() => changeRegion(r.id)}
              >
                {r.label}
              </button>
            ))}
            <button type="button" className="chip" onClick={refresh} disabled={mining} title="Minerar de novo">
              <RefreshCw size={14} className={mining ? "spin" : undefined} />
              {mining ? "Minerando…" : "Minerar agora"}
            </button>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <Link2 size={15} style={{ position: "absolute", left: 12, top: 10, color: "var(--tx3)" }} />
                <input
                  className="input"
                  style={{ height: 36, paddingLeft: 34, width: 280, borderRadius: 999 }}
                  placeholder="Colar link do TikTok ou .mp4…"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") importByUrl();
                  }}
                />
              </div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={importByUrl} disabled={mining}>
                Importar
              </button>
            </div>
          </div>

          {notice ? <div className="notice">{notice}</div> : null}

          {list.length ? (
            <div className="viral-grid">
              {list.map((viral) => (
                <MinedCard key={viral.id} viral={viral} onDuplicate={() => setActive(viral)} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="big">Nada minerado ainda</div>
              <p>Aperte “Minerar agora” para puxar as tendências do TikTok dessa região.</p>
              <button type="button" className="btn btn-accent" onClick={refresh} disabled={mining}>
                <Pickaxe size={16} />
                Minerar tendências
              </button>
            </div>
          )}
        </>
      ) : null}

      {active ? (
        <div className="modal-backdrop" onClick={() => setActive(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setActive(null)}>
              <X size={16} />
            </button>
            <h2>Duplicar esse viral</h2>
            <p className="modal-sub">
              @{active.authorHandle || active.authorName} · <Eye size={12} style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
              {formatViews(active.views)} views · {active.duration ? `${active.duration}s` : "—"}
            </p>

            <div style={{ display: "grid", gap: 16, marginTop: 18 }}>
              <video
                src={active.playUrl}
                poster={active.coverUrl || undefined}
                controls
                autoPlay
                muted
                loop
                playsInline
                style={{
                  borderRadius: 14,
                  border: "1px solid var(--line)",
                  maxHeight: 340,
                  width: "100%",
                  objectFit: "contain",
                  background: "#000",
                }}
              />
              {active.duration > 30 ? (
                <div className="notice" style={{ margin: 0 }}>
                  Esse vídeo tem {active.duration}s — o motion transfer funciona melhor com
                  referências de 4 a 30 segundos.
                </div>
              ) : null}

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
                <label htmlFor="mined-extra">Toque pessoal (opcional)</label>
                <textarea
                  id="mined-extra"
                  className="input"
                  placeholder="Ex.: cenário novo, roupa diferente, iluminação neon…"
                  value={extra}
                  onChange={(event) => setExtra(event.target.value)}
                />
              </div>

              {error ? <div className="auth-error">{error}</div> : null}

              <button
                type="button"
                className="generate-btn"
                disabled={submitting || !pickedInfluencer}
                onClick={duplicate}
              >
                {submitting ? (
                  <span className="spinner" />
                ) : (
                  <>
                    Duplicar com meu influencer <span className="cost">✦ {VIDEO_COST}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MinedCard({ viral, onDuplicate }: { viral: Viral; onDuplicate: () => void }) {
  const [hover, setHover] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (hover) videoRef.current?.play().catch(() => undefined);
    else videoRef.current?.pause();
  }, [hover]);

  return (
    <article className="viral-card" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="media">
        {hover || !viral.coverUrl ? (
          <video ref={videoRef} src={viral.playUrl} poster={viral.coverUrl || undefined} muted loop playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viral.coverUrl} alt={viral.title} loading="lazy" />
        )}
        <span className="views">
          <Eye size={13} />
          {formatViews(viral.views)}
        </span>
        <span className="platform">
          {viral.source === "tiktok" ? "TikTok" : viral.source === "instagram" ? "Instagram" : "URL"}
        </span>
        {viral.duration ? (
          <span className="dur-tag">
            <Clock3 size={11} />
            {viral.duration}s
          </span>
        ) : null}
      </div>
      <div className="body">
        <h3 style={{ fontSize: 14, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {viral.title}
        </h3>
        <p style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>@{viral.authorHandle || viral.authorName}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Heart size={12} /> {formatViews(viral.likes)}
          </span>
        </p>
        {viral.musicTitle ? (
          <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
            <Music2 size={11} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {viral.musicTitle}
            </span>
          </p>
        ) : null}
        <div className="foot">
          <button type="button" className="btn btn-accent btn-sm" style={{ flex: 1 }} onClick={onDuplicate}>
            <Flame size={14} />
            Duplicar
          </button>
          <a
            className="btn btn-ghost btn-sm"
            href={viral.pageUrl}
            target="_blank"
            rel="noreferrer"
            title="Ver original"
          >
            <ExternalLink size={14} />
          </a>
          <a
            className="btn btn-ghost btn-sm"
            href={viral.playUrl}
            target="_blank"
            rel="noreferrer"
            title="Baixar vídeo sem marca d'água"
          >
            <DownloadIcon size={14} />
          </a>
        </div>
      </div>
    </article>
  );
}

function ProfilesGrid({
  follows,
  onToggle,
}: {
  follows: string[];
  onToggle: (handle: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div>
      <p style={{ color: "var(--tx2)", fontSize: 13.5, marginBottom: 16, maxWidth: 680 }}>
        Influencers de IA reais que estão performando agora. Use como referência de estilo,
        formato e ritmo de postagem — e acompanhe para voltar fácil ao perfil.
      </p>
      <div className="profiles-grid">
        {AI_PROFILES.map((profile) => {
          const following = follows.includes(profile.handle);
          return (
            <article key={profile.handle} className="profile-card" data-following={following}>
              <div className="avatar">{profile.name.charAt(0)}</div>
              <div className="info">
                <b>{profile.name}</b>
                <span className="handle">@{profile.handle}</span>
                <p>{profile.bio}</p>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className={following ? "btn btn-sm btn-ghost" : "btn btn-sm btn-accent"}
                  disabled={busy === profile.handle}
                  onClick={async () => {
                    setBusy(profile.handle);
                    await onToggle(profile.handle);
                    setBusy(null);
                  }}
                >
                  {busy === profile.handle ? (
                    <span className="spinner" style={{ width: 13, height: 13 }} />
                  ) : following ? (
                    "✓ Acompanhando"
                  ) : (
                    "Acompanhar"
                  )}
                </button>
                <a className="btn btn-sm btn-outline" href={profile.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} />
                  Ver posts
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
