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
  refreshViralMediaAction,
  type MinedState,
} from "@/app/actions/virals";
import { VIDEO_COST } from "@/lib/costs";
import { AI_DISCOVERY_PROFILES, isAiCharacterVideo, isMotionReference, matchesAiProfile, type DiscoveryCursors } from "@/lib/ai-discovery";
import { formatViews } from "@/data/viral-effects";
import type { Viral } from "@/lib/db";
import { ViralGrid } from "./viral-grid";
import { ProfileVideos } from "./ai-profile-gallery";

type MiniInfluencer = { id: string; name: string; imageUrl: string };

export function MinedVirals({
  initialVirals,
  influencers,
}: {
  initialVirals: Viral[];
  influencers: MiniInfluencer[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"mined" | "effects" | "profiles">("profiles");
  const [profileFilter, setProfileFilter] = useState("");
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState("views");
  const [motionOnly, setMotionOnly] = useState(false);
  const [virals, setVirals] = useState<Viral[]>(() => initialVirals.filter(isAiCharacterVideo));
  const [cursors, setCursors] = useState<DiscoveryCursors>({});
  const [hasMore, setHasMore] = useState(false);
  const [mining, startMining] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  // Mineração em background: a página carrega na hora com o cache do banco e
  // o feed fresco chega sozinho (sem travar o primeiro render).
  useEffect(() => {
    let mounted = true;
    startMining(async () => {
      try {
        const result = await getMinedViralsAction();
        if (!mounted) return;
        setVirals(result.virals);
        setNotice(result.error ?? result.notice ?? null);
        setCursors(result.cursors ?? {});
        setHasMore(result.hasMore ?? false);
      } catch { if (mounted) setNotice("Não foi possível consultar novos vídeos agora. Tente atualizar a busca."); }
    });
    return () => { mounted = false; };
  }, [startMining]);
  const [importUrl, setImportUrl] = useState("");

  const [active, setActive] = useState<Viral | null>(null);
  const [pickedInfluencer, setPickedInfluencer] = useState<string | null>(influencers[0]?.id ?? null);
  const [extra, setExtra] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyResult = (result: MinedState) => {
    setVirals(result.virals);
    setNotice(result.error ?? result.notice ?? null);
    if (result.cursors) setCursors(result.cursors);
    if (typeof result.hasMore === "boolean") setHasMore(result.hasMore);
  };

  const refresh = (more = false) => {
    startMining(async () => {
      try { applyResult(await refreshViralsAction("AI", more ? cursors : undefined)); }
      catch { setNotice("Não foi possível atualizar a busca agora. Tente novamente."); }
    });
  };

  const importByUrl = () => {
    if (!importUrl.trim()) return;
    startMining(async () => {
      try {
        const result = await importViralAction(importUrl);
        applyResult(result);
        if (!result.error) { setImportUrl(""); setProfileFilter(""); setSearch(""); }
      } catch { setNotice("Não foi possível importar esse vídeo agora."); }
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

  const list = useMemo(() => virals
    .filter((viral) => !profileFilter || matchesAiProfile(viral, profileFilter))
    .filter((viral) => !motionOnly || isMotionReference(viral.duration))
    .filter((viral) => !search.trim() || `${viral.title} ${viral.authorHandle} ${viral.authorName}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => order === "recent" ? b.minedAt - a.minedAt : order === "likes" ? b.likes - a.likes : b.views - a.views),
  [virals, profileFilter, motionOnly, search, order]);

  return (
    <div>
      <div className="explore-bar" style={{ flexWrap: "wrap" }}>
        <button type="button" className="chip" data-active={tab === "profiles"} onClick={() => setTab("profiles")}>
          <Sparkles size={14} />
          Perfis de IA em alta
        </button>
        <button type="button" className="chip" data-active={tab === "mined"} onClick={() => setTab("mined")}>
          <Pickaxe size={14} />
          Descobrir personagens IA
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
            <button type="button" className="chip" data-active={!profileFilter} onClick={() => setProfileFilter("")}>Todos os personagens</button>
            {AI_DISCOVERY_PROFILES.map((handle) => (
              <button
                key={handle}
                type="button"
                className="chip"
                data-active={profileFilter === handle}
                onClick={() => setProfileFilter(handle)}
              >
                @{handle}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => refresh()} disabled={mining} title="Buscar novos vídeos de personagens de IA">
              <RefreshCw size={14} className={mining ? "spin" : undefined} />
              {mining ? "Buscando…" : "Atualizar busca"}
            </button>
          </div>
          <p style={{ color: "var(--tx3)", fontSize: 13, margin: "0 0 16px" }}>
            Busca por nomes dos personagens e termos de influencers virtuais. Só entram vídeos relacionados a IA; as métricas são as informadas pela fonte.
          </p>
          <div className="explore-bar" style={{ flexWrap: "wrap", alignItems: "center" }}>
            <input className="input" aria-label="Buscar nos vídeos captados" placeholder="Buscar nos vídeos captados…" value={search} onChange={(event) => setSearch(event.target.value)} style={{ width: 240, maxWidth: "100%", height: 36 }} />
            <select className="input" aria-label="Ordenar vídeos" value={order} onChange={(event) => setOrder(event.target.value)} style={{ width: "auto", height: 36 }}>
              <option value="views">Mais vistos</option><option value="likes">Mais curtidos</option><option value="recent">Captados recentemente</option>
            </select>
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={motionOnly} onChange={(event) => setMotionOnly(event.target.checked)} /> Movimento de 3–30s</label>
            <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", maxWidth: "100%" }}>
              <div style={{ position: "relative" }}>
                <Link2 size={15} style={{ position: "absolute", left: 12, top: 10, color: "var(--tx3)" }} />
                <input
                  className="input"
                  style={{ height: 36, paddingLeft: 34, width: 280, maxWidth: "100%", borderRadius: 999 }}
                  aria-label="Link de vídeo de personagem IA"
                  placeholder="Link do TikTok ou Reel captado…"
                  value={importUrl}
                  onChange={(event) => setImportUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") importByUrl();
                  }}
                />
              </div>
              <button type="button" className="btn btn-sm btn-ghost" onClick={importByUrl} disabled={mining || !importUrl.trim()}>
                Importar
              </button>
            </div>
          </div>

          {notice ? <div className="notice" role="status">{notice}</div> : null}
          <p style={{ color: "var(--tx3)", fontSize: 12 }} aria-live="polite">{list.length} vídeos de IA encontrados{mining ? " · Consultando novas páginas…" : ""}</p>

          {list.length ? (
            <div className="viral-grid">
              {list.map((viral) => (
                <MinedCard key={viral.id} viral={viral} onDuplicate={() => { setActive(viral); setError(null); setExtra(""); }} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="big">{virals.length ? "Nenhum vídeo com esses filtros" : "Busque os personagens de IA"}</div>
              <p>{virals.length ? "Ajuste a busca ou escolha todos os personagens." : "Atualize a busca para consultar os perfis acompanhados e novas referências de influencers virtuais."}</p>
              <button type="button" className="btn btn-accent" onClick={() => refresh()} disabled={mining}>
                <Pickaxe size={16} />
                Buscar vídeos de IA
              </button>
            </div>
          )}
          {hasMore ? <div style={{ display: "flex", justifyContent: "center", paddingTop: 24 }}><button type="button" className="btn btn-ghost" onClick={() => refresh(true)} disabled={mining}><RefreshCw size={15} className={mining ? "spin" : undefined} />{mining ? "Buscando…" : "Buscar mais vídeos"}</button></div> : null}
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
              <MinedVideo key={`${active.id}:${active.playUrl}`} viral={active} modal />
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
  return (
    <article className="viral-card">
      <div className="media">
        <MinedVideo key={`${viral.id}:${viral.playUrl}`} viral={viral} />
        {viral.views > 0 ? <span className="views" style={{ pointerEvents: "none" }}>
          <Eye size={13} />
          {formatViews(viral.views)}
        </span> : null}
        <span className="platform" style={{ pointerEvents: "none" }}>
          {viral.source === "tiktok" ? "TikTok" : viral.source === "instagram" ? "Instagram" : "URL"}
        </span>
        {viral.duration ? (
          <span className="dur-tag" style={{ pointerEvents: "none", top: 44, bottom: "auto" }}>
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
          {viral.likes > 0 ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Heart size={12} /> {formatViews(viral.likes)}
          </span> : null}
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
          <button type="button" className="btn btn-accent btn-sm" style={{ flex: 1 }} onClick={onDuplicate} disabled={!isMotionReference(viral.duration)} title={isMotionReference(viral.duration) ? "Usar o movimento com meu influencer" : "A transferência de movimento exige vídeo de 3 a 30 segundos"}>
            <Flame size={14} />
            {isMotionReference(viral.duration) ? "Duplicar" : "Só referência"}
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

/** Native controls work on touch and keyboard too. Expiring TikTok links get one automatic renewal. */
function MinedVideo({ viral, modal = false }: { viral: Viral; modal?: boolean }) {
  const [src, setSrc] = useState(viral.playUrl);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const attempted = useRef(false);
  const video = useRef<HTMLVideoElement>(null);

  const renew = async () => {
    if (refreshing) return;
    attempted.current = true;
    setRefreshing(true);
    setMessage(null);
    try {
      const result = await refreshViralMediaAction(viral.id);
      if ("error" in result) { setMessage(result.error); return; }
      setSrc(result.viral.playUrl);
      if (video.current) {
        video.current.src = result.viral.playUrl;
        video.current.load();
        void video.current.play().catch(() => undefined);
      }
    } catch { setMessage("Não foi possível carregar o vídeo agora."); }
    finally { setRefreshing(false); }
  };

  const failed = () => {
    if (viral.source === "tiktok" && !attempted.current) { void renew(); return; }
    setMessage("O arquivo deste vídeo não carregou. Tente novamente ou abra o original.");
  };

  return (
    <div style={{ position: modal ? "relative" : "absolute", inset: modal ? undefined : 0, width: "100%", height: modal ? "auto" : "100%", background: "#000", borderRadius: modal ? 14 : undefined, overflow: "hidden" }}>
      <video ref={video} src={src} poster={viral.coverUrl || undefined} controls preload="none" playsInline autoPlay={modal} onError={failed}
        onPlay={() => { document.querySelectorAll("video").forEach((other) => { if (other !== video.current) other.pause(); }); }}
        aria-label={viral.title} style={{ display: "block", width: "100%", height: modal ? "auto" : "100%", maxHeight: modal ? 340 : undefined, objectFit: "contain" }} />
      {refreshing || message ? (
        <div role="status" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 20, textAlign: "center", background: "rgba(0,0,0,.8)", fontSize: 13, zIndex: 2 }}>
          {refreshing ? <><span className="spinner" />Atualizando o vídeo…</> : <>
            <span>{message}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void renew()}><RefreshCw size={14} />Tentar novamente</button>
            <a className="btn btn-ghost btn-sm" href={viral.pageUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Ver original</a>
          </>}
        </div>
      ) : null}
    </div>
  );
}
