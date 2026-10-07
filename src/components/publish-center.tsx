"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Camera,
  Music4,
  Plus,
  Send,
  Trash2,
  Unplug,
  X,
} from "lucide-react";

import {
  connectInstagramAction,
  connectTiktokAction,
  deletePostAction,
  disconnectAccountAction,
  pollPostsAction,
  schedulePostAction,
} from "@/app/actions/posts";
import type { Post, SocialPlatform } from "@/lib/db";

type MiniAccount = {
  platform: SocialPlatform;
  status: "connected" | "demo";
  username: string;
  connectedAt: number;
};

type MiniVideo = {
  id: string;
  name: string;
  resultUrl: string;
  thumbnailUrl?: string;
  kind: string;
};

const STATUS_LABEL: Record<Post["status"], string> = {
  scheduled: "Agendado",
  posting: "Publicando…",
  posted: "Publicado",
  failed: "Falhou",
};

export function PublishCenter({
  initialAccounts,
  initialPosts,
  videos,
  tiktokOAuth,
  preselectVideoId,
  flash,
}: {
  initialAccounts: MiniAccount[];
  initialPosts: Post[];
  videos: MiniVideo[];
  tiktokOAuth: boolean;
  preselectVideoId: string | null;
  flash: string | null;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<MiniAccount[]>(initialAccounts);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [notice, setNotice] = useState<string | null>(flash);
  const [igModal, setIgModal] = useState(false);
  const [igUserId, setIgUserId] = useState("");
  const [igToken, setIgToken] = useState("");
  const [igError, setIgError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* ----- compositor ----- */
  const [composerOpen, setComposerOpen] = useState(Boolean(preselectVideoId));
  const [videoId, setVideoId] = useState<string | null>(
    preselectVideoId && videos.some((v) => v.id === preselectVideoId)
      ? preselectVideoId
      : videos[0]?.id ?? null,
  );
  const [platform, setPlatform] = useState<SocialPlatform>("tiktok");
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);

  const hasPending = posts.some((p) => p.status === "scheduled" || p.status === "posting");

  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => {
      pollPostsAction()
        .then(setPosts)
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [hasPending]);

  const account = useCallback(
    (p: SocialPlatform) => accounts.find((a) => a.platform === p),
    [accounts],
  );

  const connectTiktok = async () => {
    setBusy(true);
    const result = await connectTiktokAction().catch(() => ({}) as { redirect?: string });
    setBusy(false);
    if (result.redirect) {
      window.location.href = result.redirect;
      return;
    }
    setAccounts((prev) => [
      ...prev.filter((a) => a.platform !== "tiktok"),
      { platform: "tiktok", status: "demo", username: "conta demo", connectedAt: Date.now() },
    ]);
    setNotice("TikTok conectado em modo demo. Configure TIKTOK_CLIENT_KEY/SECRET no .env.local para publicar de verdade.");
    router.refresh();
  };

  const connectInstagram = async (demo: boolean) => {
    setBusy(true);
    setIgError(null);
    const result = await connectInstagramAction(
      demo ? {} : { igUserId, accessToken: igToken },
    ).catch((caught: unknown) => ({ error: caught instanceof Error ? caught.message : String(caught) }));
    setBusy(false);
    if (result.error) {
      setIgError(result.error);
      return;
    }
    setIgModal(false);
    setAccounts((prev) => [
      ...prev.filter((a) => a.platform !== "instagram"),
      {
        platform: "instagram",
        status: demo ? "demo" : "connected",
        username: demo ? "conta demo" : "instagram",
        connectedAt: Date.now(),
      },
    ]);
    if (demo) {
      setNotice("Instagram conectado em modo demo. Cole o token do Graph API para publicar de verdade.");
    }
    router.refresh();
  };

  const disconnect = async (p: SocialPlatform) => {
    await disconnectAccountAction(p);
    setAccounts((prev) => prev.filter((a) => a.platform !== p));
  };

  const pickedVideo = useMemo(() => videos.find((v) => v.id === videoId) ?? null, [videos, videoId]);

  const schedule = async () => {
    if (!videoId) {
      setComposerError("Escolha um vídeo gerado");
      return;
    }
    setBusy(true);
    setComposerError(null);
    const scheduledAt = when ? new Date(when).getTime() : undefined;
    const result = await schedulePostAction({
      videoId,
      platform,
      caption,
      ...(scheduledAt ? { scheduledAt } : {}),
    }).catch((caught: unknown) => ({ error: caught instanceof Error ? caught.message : String(caught) }));
    setBusy(false);
    if ("error" in result) {
      setComposerError(result.error);
      return;
    }
    setComposerOpen(false);
    setCaption("");
    setWhen("");
    const fresh = await pollPostsAction().catch(() => null);
    if (fresh) setPosts(fresh);
  };

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {notice ? <div className="notice">{notice}</div> : null}

      {/* ---------- contas ---------- */}
      <section>
        <h2 className="display" style={{ fontSize: 17, marginBottom: 12 }}>
          Contas conectadas
        </h2>
        <div className="accounts-row">
          <AccountCard
            icon={<Music4 size={20} />}
            name="TikTok"
            account={account("tiktok")}
            hint={
              tiktokOAuth
                ? "OAuth oficial configurado"
                : "Sem app TikTok no .env — conecta em modo demo"
            }
            onConnect={connectTiktok}
            onDisconnect={() => disconnect("tiktok")}
            busy={busy}
          />
          <AccountCard
            icon={<Camera size={20} />}
            name="Instagram"
            account={account("instagram")}
            hint="Conta profissional via Graph API (token de longa duração)"
            onConnect={() => setIgModal(true)}
            onDisconnect={() => disconnect("instagram")}
            busy={busy}
          />
        </div>
      </section>

      {/* ---------- nova publicação ---------- */}
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <h2 className="display" style={{ fontSize: 17 }}>
            Fila de publicação
          </h2>
          <button
            type="button"
            className="btn btn-accent btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={() => setComposerOpen(true)}
          >
            <Plus size={15} />
            Nova publicação
          </button>
        </div>

        {posts.length ? (
          <div className="queue">
            {posts.map((post) => {
              const video = videos.find((v) => v.id === post.videoId);
              return (
                <article key={post.id} className="queue-card" data-status={post.status}>
                  <div className="thumb">
                    {video ? (
                      <video src={video.resultUrl} poster={video.thumbnailUrl} muted playsInline preload="metadata" />
                    ) : null}
                  </div>
                  <div className="info">
                    <div className="line1">
                      <b>{post.platform === "tiktok" ? "TikTok" : "Instagram"}</b>
                      <span className="q-status" data-status={post.status}>
                        {post.status === "posting" ? <span className="spinner" style={{ width: 12, height: 12 }} /> : null}
                        {post.status === "posted" ? <CheckCircle2 size={13} /> : null}
                        {STATUS_LABEL[post.status]}
                      </span>
                    </div>
                    <p className="caption">{post.caption}</p>
                    <p className="meta">
                      <CalendarClock size={12} />
                      {new Date(post.scheduledAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {post.error ? <span style={{ color: "var(--danger)" }}> · {post.error}</span> : null}
                    </p>
                  </div>
                  <div className="q-actions">
                    {post.postedUrl ? (
                      <a href={post.postedUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" title="Abrir publicação">
                        <ExternalLink size={14} />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="Remover"
                      onClick={async () => {
                        await deletePostAction(post.id);
                        setPosts((prev) => prev.filter((p) => p.id !== post.id));
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div className="big">Fila vazia</div>
            <p>Gere um vídeo e mande para cá. Publicação imediata ou agendada.</p>
            {videos.length ? (
              <button type="button" className="btn btn-accent" onClick={() => setComposerOpen(true)}>
                <Send size={16} />
                Publicar um vídeo
              </button>
            ) : (
              <Link href="/app/virais" className="btn btn-accent">
                Gerar meu primeiro vídeo
              </Link>
            )}
          </div>
        )}
      </section>

      {/* ---------- modal: compositor ---------- */}
      {composerOpen ? (
        <div className="modal-backdrop" onClick={() => setComposerOpen(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setComposerOpen(false)}>
              <X size={16} />
            </button>
            <h2>Nova publicação</h2>
            <p className="modal-sub">Escolha o vídeo, a rede e quando ele sai.</p>

            <div style={{ display: "grid", gap: 16, marginTop: 18 }}>
              <div className="field">
                <label>Vídeo</label>
                {videos.length ? (
                  <div className="influencer-pick">
                    {videos.map((video) => (
                      <button
                        type="button"
                        key={video.id}
                        className="pick"
                        data-active={videoId === video.id}
                        onClick={() => setVideoId(video.id)}
                        title={video.name}
                      >
                        <video src={video.resultUrl} poster={video.thumbnailUrl} muted playsInline preload="metadata" />
                        <span>{video.name}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--tx3)", fontSize: 13 }}>
                    Nenhum vídeo pronto.{" "}
                    <Link href="/app/virais" style={{ color: "var(--accent)" }}>
                      Gerar um →
                    </Link>
                  </p>
                )}
              </div>

              <div className="field">
                <label>Rede</label>
                <div className="mode-tabs" style={{ maxWidth: 320 }}>
                  <button type="button" data-active={platform === "tiktok"} onClick={() => setPlatform("tiktok")}>
                    TikTok
                  </button>
                  <button type="button" data-active={platform === "instagram"} onClick={() => setPlatform("instagram")}>
                    Instagram
                  </button>
                </div>
                {!account(platform) ? (
                  <p style={{ color: "var(--danger)", fontSize: 12.5 }}>
                    Conecte sua conta de {platform === "tiktok" ? "TikTok" : "Instagram"} acima antes de publicar.
                  </p>
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="pub-caption">Legenda</label>
                <textarea
                  id="pub-caption"
                  className="input"
                  placeholder={`Ex.: ${pickedVideo?.name ?? "Meu influencer"} dominou a trend 😤 #ai #viral #fyp`}
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="pub-when">Quando publicar</label>
                <input
                  id="pub-when"
                  type="datetime-local"
                  className="input"
                  value={when}
                  onChange={(event) => setWhen(event.target.value)}
                />
                <p style={{ color: "var(--tx3)", fontSize: 12 }}>Vazio = publica agora.</p>
              </div>

              {composerError ? <div className="auth-error">{composerError}</div> : null}

              <button
                type="button"
                className="generate-btn"
                disabled={busy || !videoId || !account(platform)}
                onClick={schedule}
              >
                {busy ? <span className="spinner" /> : when ? <>Agendar publicação</> : <>Publicar agora</>}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------- modal: instagram ---------- */}
      {igModal ? (
        <div className="modal-backdrop" onClick={() => setIgModal(false)}>
          <div className="modal" style={{ width: "min(480px, 100%)" }} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setIgModal(false)}>
              <X size={16} />
            </button>
            <h2>Conectar Instagram</h2>
            <p className="modal-sub">
              Conta profissional + token do Graph API (Meta for Developers → escopo
              instagram_content_publish). Sem token, conecta em modo demo.
            </p>
            <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
              <div className="field">
                <label htmlFor="ig-user">IG User ID</label>
                <input
                  id="ig-user"
                  className="input"
                  placeholder="1784..."
                  value={igUserId}
                  onChange={(event) => setIgUserId(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="ig-token">Access token</label>
                <input
                  id="ig-token"
                  className="input"
                  type="password"
                  placeholder="EAAG..."
                  value={igToken}
                  onChange={(event) => setIgToken(event.target.value)}
                />
              </div>
              {igError ? <div className="auth-error">{igError}</div> : null}
              <button type="button" className="btn btn-accent" disabled={busy} onClick={() => connectInstagram(false)}>
                {busy ? <span className="spinner" /> : "Conectar com token"}
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => connectInstagram(true)}>
                Conectar em modo demo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountCard({
  icon,
  name,
  account,
  hint,
  onConnect,
  onDisconnect,
  busy,
}: {
  icon: React.ReactNode;
  name: string;
  account?: MiniAccount;
  hint: string;
  onConnect: () => void;
  onDisconnect: () => void;
  busy: boolean;
}) {
  return (
    <div className="account-card" data-connected={Boolean(account)}>
      <div className="icon">{icon}</div>
      <div className="info">
        <b>{name}</b>
        {account ? (
          <span className="ok">
            @{account.username}
            {account.status === "demo" ? " · demo" : ""}
          </span>
        ) : (
          <span>{hint}</span>
        )}
      </div>
      {account ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDisconnect} title="Desconectar">
          <Unplug size={14} />
        </button>
      ) : (
        <button type="button" className="btn btn-accent btn-sm" onClick={onConnect} disabled={busy}>
          Conectar
        </button>
      )}
    </div>
  );
}
