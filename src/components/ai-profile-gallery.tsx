"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Clock3, ExternalLink, Eye, Flame, Heart, MessageCircle, Play, RotateCw, Search, X } from "lucide-react";
import { duplicateProfilePostAction } from "@/app/actions/virals";
import { VIDEO_COST } from "@/lib/costs";
import { AI_PROFILES, type AiProfile, type ProfilePost } from "@/data/ai-profiles";
import { formatViews } from "@/data/viral-effects";
import styles from "./ai-profile-gallery.module.css";
import { TikTokReferencePlayer } from "./tiktok-reference-player";
type MiniInfluencer = { id: string; name: string; imageUrl: string };
const catalog = AI_PROFILES.flatMap(profile => profile.posts.map(post => ({ profile, post })));
function ProfileCard({ profile, post, activeCode, onPlay, onCreate }: {
  profile: AiProfile; post: ProfilePost; activeCode: string | null;
  onPlay: (code: string) => void; onCreate: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const poster = post.thumbnail ?? `/reel-thumbs/${post.code}.jpg`;
  const platform = profile.platform === "tiktok" ? "TikTok" : "Instagram";
  const source = profile.platform === "tiktok" ? `https://www.tiktok.com/@${profile.handle}/video/${post.code}` : `https://www.instagram.com/reel/${post.code}/`;
  useEffect(() => { if (activeCode !== post.code) video.current?.pause(); }, [activeCode, post.code]);
  const play = async () => {
    setStarted(true); onPlay(post.code);
    try { await video.current?.play(); } catch { setStarted(false); }
  };
  return <article className={styles.card}>
    <div className={styles.media}>
      {post.video && !failed ? <>
        <video key={retry} ref={video} src={post.video} poster={poster} controls={started} playsInline preload="none"
          aria-label={`Vídeo: ${post.scene}`} onPlay={() => { setStarted(true); onPlay(post.code); }} onError={() => setFailed(true)} />
        {!started && <button className={styles.play} type="button" onClick={play} aria-label={`Assistir: ${post.scene}`}><Play size={27} fill="currentColor" /></button>}
      </> : profile.platform === "tiktok" ? <TikTokReferencePlayer id={post.code} title={post.scene} poster={poster} sourceUrl={source} active={activeCode === post.code} onPlay={() => onPlay(post.code)} /> : <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.poster} src={poster} alt={post.scene} loading="lazy" onError={e => { if (!e.currentTarget.src.endsWith(profile.avatar)) e.currentTarget.src = profile.avatar; }} />
        <div className={styles.unavailable}>
          <span>{failed ? "O vídeo não carregou" : "Referência do Instagram"}</span>
          <p>{failed ? "Tente carregar o arquivo novamente." : "Este vídeo ainda não está disponível no player."}</p>
          {failed && <button type="button" className="btn btn-sm" onClick={() => { setFailed(false); setStarted(false); setRetry(n => n + 1); }}><RotateCw size={14} /> Tentar novamente</button>}
          <a href={source} target="_blank" rel="noreferrer" className="btn btn-sm"><ExternalLink size={14} /> Assistir no Instagram</a>
        </div>
      </>}
      {!started && <span className={styles.badge}>{post.video ? "Vídeo disponível" : "Ver na origem"}</span>}
    </div>
    <div className={styles.body}>
      <div className={styles.author}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={profile.avatar} alt="" />
        <a href={profile.url} target="_blank" rel="noreferrer">@{profile.handle}<small className={styles.platform}>{platform}</small></a>
        <a href={source} target="_blank" rel="noreferrer" aria-label={`Abrir ${post.scene} no ${platform}`}><ExternalLink size={15} /></a>
      </div>
      <p className={styles.title}>{post.scene}</p>
      <div className={styles.metrics} aria-label={`Métricas observadas no ${platform}`}>
        {post.metrics?.views !== undefined && <span title="Visualizações observadas"><Eye size={13} />{formatViews(post.metrics.views)}</span>}
        {post.metrics?.likes !== undefined && <span title="Curtidas"><Heart size={13} />{formatViews(post.metrics.likes)}</span>}
        {post.metrics?.comments !== undefined && <span title="Comentários"><MessageCircle size={13} />{formatViews(post.metrics.comments)}</span>}
        {post.metrics?.duration && <span title="Duração"><Clock3 size={13} />{Math.round(post.metrics.duration)}s</span>}
      </div>
      <button type="button" className="btn btn-accent btn-sm" onClick={onCreate}><Flame size={14} />Criar com esta referência</button>
    </div>
  </article>;
}
export function ProfileVideos({ influencers }: { influencers: MiniInfluencer[] }) {
  const router = useRouter();
  const modalRef = useRef<HTMLDialogElement>(null);
  const [handle, setHandle] = useState("");
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState("available");
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [active, setActive] = useState<{ profile: AiProfile; post: ProfilePost } | null>(null);
  useEffect(() => { if (active) modalRef.current?.showModal(); }, [active]);
  const [pickedInfluencer, setPickedInfluencer] = useState<string | null>(influencers[0]?.id ?? null);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedSearch = search.toLocaleLowerCase("pt-BR");
  const visible = catalog.filter(({profile, post}) => (!handle || profile.handle === handle)
    && (availability === "all" || (availability === "video" ? Boolean(post.video) : !post.video))
    && `${profile.handle} ${profile.name} ${post.scene}`.toLocaleLowerCase("pt-BR").includes(normalizedSearch))
    .sort((a,b) => sort === "views" ? (b.post.metrics?.views ?? -1) - (a.post.metrics?.views ?? -1)
      : sort === "likes" ? (b.post.metrics?.likes ?? -1) - (a.post.metrics?.likes ?? -1)
      : Number(Boolean(b.post.video)) - Number(Boolean(a.post.video)) || (b.post.metrics?.likes ?? 0) - (a.post.metrics?.likes ?? 0));
  const open = (profile: AiProfile, post: ProfilePost) => { setActive({profile, post}); setActiveCode(null); setPrompt(post.prompt); setError(null); };
  const duplicate = async () => {
    if (!active || !pickedInfluencer) return;
    setSubmitting(true); setError(null);
    const result = await duplicateProfilePostAction({ influencerId: pickedInfluencer, handle: active.profile.handle, code: active.post.code, prompt })
      .catch((caught: unknown) => ({ error: caught instanceof Error ? caught.message : String(caught) }));
    setSubmitting(false);
    if ("error" in result) { setError(result.error); return; }
    router.push("/app/videos");
  };
  return (<div>
    <div className={styles.summary}><strong>{catalog.length} referências de personagens de IA</strong><span>{catalog.filter(item => item.post.video).length} vídeos no player · {AI_PROFILES.length} perfis acompanhados</span></div>
    <div className="explore-bar" style={{flexWrap:"wrap"}}>
      <button type="button" className="chip" data-active={!handle} onClick={() => { setHandle(""); setActiveCode(null); }}>Todos os personagens</button>
      {AI_PROFILES.map(profile => <button key={profile.handle} type="button" className="chip" data-active={handle === profile.handle}
        onClick={() => { setHandle(profile.handle); setActiveCode(null); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={profile.avatar} alt="" width={24} height={24} style={{borderRadius:"50%",objectFit:"cover"}} />@{profile.handle}<span className={styles.count}>{profile.posts.length} · {profile.platform === "tiktok" ? "TikTok" : "IG"}</span>
      </button>)}
    </div>
    <div className={styles.filters}>
      <label className={styles.search}><Search size={16} /><input className="input" aria-label="Buscar personagens e cenas" placeholder="Buscar personagem ou cena…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <select className="input" aria-label="Disponibilidade do vídeo" value={availability} onChange={e => setAvailability(e.target.value)}><option value="all">Todas as referências</option><option value="video">Vídeos disponíveis</option><option value="reference">Assistir na origem</option></select>
      <select className="input" aria-label="Ordenar referências" value={sort} onChange={e => setSort(e.target.value)}><option value="available">Vídeos disponíveis primeiro</option><option value="likes">Mais curtidos</option><option value="views">Mais visualizações observadas</option></select>
    </div>
    <p className={styles.note}>{visible.length} resultado{visible.length !== 1 ? "s" : ""} · Métricas são registros de coleta e podem mudar. Visualizações só aparecem quando observadas na origem.</p>
    <div className={styles.grid}>{visible.map(({profile,post}) => <ProfileCard key={post.code} profile={profile} post={post} activeCode={activeCode} onPlay={setActiveCode} onCreate={() => open(profile,post)} />)}</div>
    {!visible.length && <div className="empty"><p>Nenhuma referência encontrada com esses filtros.</p><button type="button" className="btn" onClick={() => { setHandle(""); setSearch(""); setAvailability("all"); }}>Limpar filtros</button></div>}
      {active ? (
        <dialog ref={modalRef} className={`modal ${styles.dialog}`} aria-labelledby="profile-modal-title" onCancel={() => setActive(null)}>
            <button type="button" className="modal-close" aria-label="Fechar criação" onClick={() => setActive(null)}>
              <X size={16} />
            </button>
            <h2 id="profile-modal-title">Criar com referência de @{active.profile.handle}</h2>
            <p className="modal-sub">{active.post.scene}. A criação usa a imagem do seu influencer e a descrição abaixo; ajuste o prompt para reproduzir a ideia da cena.</p>

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
                <label htmlFor="profile-prompt">Descreva a cena para o seu influencer</label>
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
                    Criar cena <span className="cost">✦ {VIDEO_COST}</span>
                  </>
                )}
              </button>
            </div>
        </dialog>
      ) : null}
    </div>
  );
}
