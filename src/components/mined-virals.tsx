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
  MessageCircle,
  Music2,
  Pickaxe,
  RefreshCw,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react";

import {
  duplicateMinedViralAction,
  getMinedViralsAction,
  importViralAction,
  refreshViralsAction,
  duplicateProfilePostAction,
} from "@/app/actions/virals";
import { VIDEO_COST } from "@/lib/costs";
import { AI_PROFILES, type AiProfile, type ProfilePost } from "@/data/ai-profiles";
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
}: {
  initialVirals: Viral[];
  influencers: MiniInfluencer[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"mined" | "effects" | "profiles">("profiles");
  const [region, setRegion] = useState("BR");
  const [virals, setVirals] = useState<Viral[]>(initialVirals);
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
        <button type="button" className="chip" data-active={tab === "profiles"} onClick={() => setTab("profiles")}>
          <Sparkles size={14} />
          Perfis de IA em alta
        </button>
        <button type="button" className="chip" data-active={tab === "mined"} onClick={() => setTab("mined")}>
          <Pickaxe size={14} />
          Tendências agora
        </button>
        <button type="button" className="chip" data-active={tab === "effects"} onClick={() => setTab("effects")}>
          <Sparkles size={14} />
          Efeitos virais
        </button>
      </div>

      {tab === "profiles" ? <ProfileVideos influencers={influencers} /> : null}

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

/* ---------- vídeos dos perfis de IA: cards tela cheia com insights ---------- */

function timeAgo(timestamp?: number): string | null {
  if (!timestamp) return null;
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 3600) return `há ${Math.max(1, Math.floor(seconds / 60))} min`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)} h`;
  const days = Math.floor(seconds / 86400);
  if (days < 30) return `há ${days} dia${days > 1 ? "s" : ""}`;
  const months = Math.floor(days / 30);
  return `há ${months} ${months > 1 ? "meses" : "mês"}`;
}

function ProfileVideos({ influencers }: { influencers: MiniInfluencer[] }) {
  const router = useRouter();
  const [handle, setHandle] = useState(AI_PROFILES[0].handle);
  /* Player do IG montado sob demanda (1 clique) — carregar 8 embeds de uma
     vez toma rate limit do Instagram ("link quebrado"). O valor é um contador
     de reload: o ↻ remonta o iframe (resolve o "assista novamente"). */
  const [players, setPlayers] = useState<Record<string, number>>({});
  /* Vídeos nativos (public/reel-videos): quando o reel acaba, mostramos o
     botão grande de reiniciar por cima — nada de "Assista no Instagram". */
  const [ended, setEnded] = useState<Record<string, boolean>>({});
  const restart = (code: string) => {
    const v = document.getElementById(`rv-${code}`) as HTMLVideoElement | null;
    if (v) {
      v.currentTime = 0;
      void v.play();
    }
    setEnded((prev) => ({ ...prev, [code]: false }));
  };
  const [active, setActive] = useState<{ profile: AiProfile; post: ProfilePost } | null>(null);
  const [pickedInfluencer, setPickedInfluencer] = useState<string | null>(influencers[0]?.id ?? null);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = AI_PROFILES.find((p) => p.handle === handle) ?? AI_PROFILES[0];

  const open = (post: ProfilePost) => {
    setActive({ profile, post });
    setPrompt(post.prompt);
    setError(null);
  };

  const duplicate = async () => {
    if (!active || !pickedInfluencer) return;
    setSubmitting(true);
    setError(null);
    const result = await duplicateProfilePostAction({
      influencerId: pickedInfluencer,
      handle: active.profile.handle,
      code: active.post.code,
      prompt,
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
        {AI_PROFILES.map((p) => (
          <button
            key={p.handle}
            type="button"
            className="chip"
            data-active={handle === p.handle}
            onClick={() => { setHandle(p.handle); setPlayers({}); setEnded({}); }}
            style={{ paddingLeft: 6 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.avatar} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
            @{p.handle}
          </button>
        ))}
      </div>

      <div className="reels-grid">
        {profile.posts.map((post) => {
          const metrics = post.metrics;
          const ago = timeAgo(metrics?.postedAt);
          /* O embed do IG prende a mídia numa área 4:5 (vídeo 9:16 fica em
             contain, com sobras). Escala calculada pela proporção real do
             vídeo faz ele COBRIR o card: s = 1/(1.25·ar), com piso que
             garante altura. Header de 54px sai pelo deslocamento. */
          const scale = Math.max(1 / (1.25 * post.ar), 1.34);
          const playerKey = players[post.code];
          return (
            <article key={post.code} className="reel-fs">
              {playerKey !== undefined && post.video ? (
                /* Player nativo: vídeo hospedado no próprio sistema — clique
                   pausa/retoma e o fim do vídeo mostra o botão de reiniciar. */
                <video
                  id={`rv-${post.code}`}
                  className="native"
                  src={post.video}
                  poster={`/reel-thumbs/${post.code}.jpg`}
                  autoPlay
                  playsInline
                  onEnded={() => setEnded((prev) => ({ ...prev, [post.code]: true }))}
                  onPlay={() => setEnded((prev) => (prev[post.code] ? { ...prev, [post.code]: false } : prev))}
                  onClick={(e) => {
                    const v = e.currentTarget;
                    if (v.paused) void v.play();
                    else v.pause();
                  }}
                />
              ) : playerKey !== undefined && post.embeddable ? (
                <iframe
                  key={playerKey}
                  src={`https://www.instagram.com/reel/${post.code}/embed/`}
                  allowFullScreen
                  title={post.scene}
                  style={{
                    transform: `scale(${scale.toFixed(3)})`,
                    transformOrigin: "top center",
                    top: `-${Math.round(54 * scale)}px`,
                  }}
                />
              ) : post.video || post.embeddable ? (
                <button
                  type="button"
                  className="cover"
                  title="Assistir"
                  onClick={() => setPlayers((prev) => ({ ...prev, [post.code]: 0 }))}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/reel-thumbs/${post.code}.jpg`} alt={post.scene} loading="lazy" />
                  <span className="play">▶</span>
                </button>
              ) : (
                /* O IG bloqueia este reel em /embed/ — a capa abre direto no Instagram. */
                <a
                  className="cover"
                  href={`https://www.instagram.com/reel/${post.code}/`}
                  target="_blank"
                  rel="noreferrer"
                  title="Este reel só toca no Instagram (embed bloqueado pelo IG)"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/reel-thumbs/${post.code}.jpg`} alt={post.scene} loading="lazy" />
                  <span className="play">
                    <ExternalLink size={22} />
                  </span>
                </a>
              )}
              {playerKey !== undefined && post.video && ended[post.code] ? (
                <button
                  type="button"
                  className="replay-ov"
                  title="Assistir de novo"
                  onClick={() => restart(post.code)}
                >
                  <RotateCw size={30} />
                </button>
              ) : null}
              <div className="top-ov">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile.avatar} alt={profile.name} className="ava" />
                <div className="who">
                  <a href={profile.url} target="_blank" rel="noreferrer">
                    @{profile.handle}
                  </a>
                  <span>{profile.followers} seguidores</span>
                </div>
                {playerKey !== undefined && (post.video || post.embeddable) ? (
                  <button
                    type="button"
                    className="igo"
                    title="Assistir de novo"
                    onClick={() =>
                      post.video
                        ? restart(post.code)
                        : setPlayers((prev) => ({ ...prev, [post.code]: (prev[post.code] ?? 0) + 1 }))
                    }
                  >
                    <RotateCw size={14} />
                  </button>
                ) : null}
                <a className="igo" href={`https://www.instagram.com/reel/${post.code}/`} target="_blank" rel="noreferrer" title="Abrir no Instagram">
                  <ExternalLink size={14} />
                </a>
              </div>
              <div className="bot-ov">
                <p className="scene">{post.scene}</p>
                <div className="insights">
                  {metrics?.views ? (
                    <span>
                      <Eye size={13} />
                      {formatViews(metrics.views)}
                    </span>
                  ) : metrics?.likes ? (
                    <span title="Views estimadas pelo engajamento (o Instagram só mostra views exatas a contas logadas)">
                      <Eye size={13} />
                      ~{formatViews(metrics.likes * 24)}
                    </span>
                  ) : null}
                  {metrics?.likes ? (
                    <span>
                      <Heart size={13} />
                      {formatViews(metrics.likes)}
                    </span>
                  ) : null}
                  {metrics?.comments ? (
                    <span>
                      <MessageCircle size={13} />
                      {formatViews(metrics.comments)}
                    </span>
                  ) : null}
                  {metrics?.duration ? (
                    <span>
                      <Clock3 size={13} />
                      {Math.round(metrics.duration)}s
                    </span>
                  ) : null}
                  {ago ? <span className="ago">{ago}</span> : null}
                </div>
                <button type="button" className="btn btn-accent btn-sm" onClick={() => open(post)}>
                  <Flame size={14} />
                  Duplicar com meu influencer
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {active ? (
        <div className="modal-backdrop" onClick={() => setActive(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setActive(null)}>
              <X size={16} />
            </button>
            <h2>Duplicar cena de @{active.profile.handle}</h2>
            <p className="modal-sub">{active.post.scene}</p>

            <div style={{ display: "grid", gap: 16, marginTop: 18 }}>
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
                <label htmlFor="profile-prompt">Prompt de duplicação (edite à vontade)</label>
                <textarea
                  id="profile-prompt"
                  className="input"
                  style={{ minHeight: 120 }}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
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
                    Duplicar cena <span className="cost">✦ {VIDEO_COST}</span>
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
