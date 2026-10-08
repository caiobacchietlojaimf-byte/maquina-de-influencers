"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  FileText,
  Pencil,
  Copy,
  WandSparkles,
  Film,
  AlertCircle,
} from "lucide-react";
import {
  connectInstagramAction,
  connectTiktokAction,
  deletePostAction,
  disconnectAccountAction,
  getAccountsAction,
  pollPostsAction,
  savePostDraftAction,
  schedulePostAction,
} from "@/app/actions/posts";
import type { Post, SocialPlatform } from "@/lib/db";
import {
  buildCaption,
  CAPTION_GOALS,
  CAPTION_LIMIT,
  inspectCaption,
  parsePublishDate,
  publishDateValue,
  type CaptionGoal,
} from "@/lib/publish-caption";
import styles from "./publish-center.module.css";

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
  characterName?: string;
};
const STATUS_LABEL: Record<Post["status"], string> = {
  draft: "Rascunho",
  scheduled: "Agendado",
  posting: "Processando na rede",
  posted: "Publicado",
  failed: "Falhou",
};
const FILTERS = [
  { id: "all", label: "Tudo" },
  { id: "draft", label: "Rascunhos" },
  { id: "scheduled", label: "Na fila" },
  { id: "posted", label: "Concluídos" },
  { id: "failed", label: "Atenção" },
] as const;
type QueueFilter = (typeof FILTERS)[number]["id"];
const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const errorMessage = (caught: unknown) =>
  caught instanceof Error
    ? caught.message
    : "Não foi possível concluir. Tente novamente.";
const isDemoPost = (post: Post) =>
  post.mode === "demo" || Boolean(post.postedUrl?.includes("demo-"));

export function PublishCenter({
  initialAccounts,
  initialPosts,
  videos,
  tiktokOAuth,
  preselectVideoId,
  flash,
  backgroundPublishing = false,
}: {
  initialAccounts: MiniAccount[];
  initialPosts: Post[];
  videos: MiniVideo[];
  tiktokOAuth: boolean;
  preselectVideoId: string | null;
  flash: string | null;
  backgroundPublishing?: boolean;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [posts, setPosts] = useState(initialPosts);
  const [notice, setNotice] = useState(flash);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [igModal, setIgModal] = useState(false);
  const [igUserId, setIgUserId] = useState("");
  const [igToken, setIgToken] = useState("");
  const [igError, setIgError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(Boolean(preselectVideoId));
  const [draftId, setDraftId] = useState<string | undefined>();
  const [videoId, setVideoId] = useState(
    preselectVideoId && videos.some((video) => video.id === preselectVideoId)
      ? preselectVideoId
      : (videos[0]?.id ?? ""),
  );
  const [platform, setPlatform] = useState<SocialPlatform>("instagram");
  const [caption, setCaption] = useState("");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState<CaptionGoal>("comments");
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [when, setWhen] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);
  const hasPending = posts.some(
    (post) => post.status === "scheduled" || post.status === "posting",
  );
  const pickedVideo = videos.find((video) => video.id === videoId);
  const pickedAccount = accounts.find(
    (account) => account.platform === platform,
  );
  const review = inspectCaption(caption);
  const shownPosts = posts.filter(
    (post) =>
      filter === "all" ||
      (filter === "scheduled"
        ? post.status === "scheduled" || post.status === "posting"
        : post.status === filter),
  );

  useEffect(() => {
    setAccounts(initialAccounts);
  }, [initialAccounts]);
  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);
  useEffect(() => {
    if (!hasPending) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const fresh = await pollPostsAction();
        if (active) setPosts(fresh);
      } catch {
        /* A later poll retries without changing the publication state. */
      }
      if (active) timer = setTimeout(poll, 10_000);
    };
    timer = setTimeout(poll, 3000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [hasPending]);

  const refreshAccounts = async () => {
    const result = await getAccountsAction();
    setAccounts(result.accounts);
    router.refresh();
  };
  const connectTiktok = async () => {
    setBusy(true);
    try {
      const result = await connectTiktokAction();
      if (result.redirect) {
        window.location.href = result.redirect;
        return;
      }
      await refreshAccounts();
      setNotice(
        "Demonstração do TikTok ativada. As simulações não são enviadas para a rede.",
      );
    } catch (caught) {
      setNotice(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const connectInstagram = async (demo: boolean) => {
    setBusy(true);
    setIgError(null);
    try {
      const result = await connectInstagramAction(
        demo ? { demo: true } : { igUserId, accessToken: igToken },
      );
      if (result.error) {
        setIgError(result.error);
        return;
      }
      await refreshAccounts();
      setIgModal(false);
      setIgToken("");
      setNotice(
        demo
          ? "Demonstração do Instagram ativada. Nenhum vídeo será enviado à rede."
          : "Instagram conectado. Revise seu vídeo e sua legenda antes de publicar.",
      );
    } catch (caught) {
      setIgError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async (network: SocialPlatform) => {
    setBusy(true);
    try {
      await disconnectAccountAction(network);
      setAccounts((previous) =>
        previous.filter((account) => account.platform !== network),
      );
    } catch (caught) {
      setNotice(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const newPost = () => {
    setDraftId(undefined);
    setCaption("");
    setTopic("");
    setWhen("");
    setTiming("now");
    setComposerError(null);
    setMediaError(false);
    setFullPreview(false);
    setComposerOpen(true);
  };
  const editPost = (post: Post) => {
    setDraftId(post.status === "draft" ? post.id : undefined);
    setVideoId(post.videoId);
    setPlatform(post.platform);
    setCaption(post.caption);
    setWhen("");
    setTiming("now");
    setTopic("");
    setMediaError(false);
    setComposerError(null);
    setComposerOpen(true);
  };
  const saveDraft = async () => {
    setBusy(true);
    setComposerError(null);
    try {
      const result = await savePostDraftAction({
        id: draftId,
        videoId,
        platform,
        caption,
      });
      if ("error" in result) {
        setComposerError(result.error);
        return;
      }
      setPosts((previous) => [
        result.post,
        ...previous.filter((post) => post.id !== result.post.id),
      ]);
      setDraftId(result.post.id);
      setComposerOpen(false);
      setFilter("draft");
      setNotice("Rascunho salvo. Você pode continuar a edição quando quiser.");
    } catch (caught) {
      setComposerError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const schedule = async () => {
    setComposerError(null);
    const scheduledAt =
      timing === "later" && when ? parsePublishDate(when) : undefined;
    if (
      timing === "later" &&
      (!scheduledAt ||
        !Number.isFinite(scheduledAt) ||
        scheduledAt <= Date.now())
    ) {
      setComposerError("Escolha uma data futura no horário de Brasília.");
      return;
    }
    setBusy(true);
    try {
      const result = await schedulePostAction({
        videoId,
        platform,
        caption,
        draftId,
        scheduledAt,
      });
      if ("error" in result) {
        setComposerError(result.error);
        return;
      }
      setComposerOpen(false);
      setCaption("");
      setDraftId(undefined);
      setFilter("scheduled");
      setNotice(
        pickedAccount?.status === "demo"
          ? "Simulação criada. Nenhum conteúdo será publicado na rede."
          : timing === "later"
            ? "Publicação adicionada à fila para o horário escolhido."
            : "Vídeo enviado para processamento. O status será confirmado pela rede.",
      );
      setPosts(await pollPostsAction());
      router.refresh();
    } catch (caught) {
      setComposerError(errorMessage(caught));
      setNotice(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const removePost = async (post: Post) => {
    setBusy(true);
    try {
      await deletePostAction(post.id);
      setPosts((previous) => previous.filter((item) => item.id !== post.id));
      setNotice(
        post.status === "scheduled"
          ? "Agendamento removido da fila."
          : "Registro removido. Publicações já enviadas continuam na rede.",
      );
    } catch (caught) {
      setNotice(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setComposerError(null);
      setNotice("Legenda copiada.");
    } catch {
      setComposerError(
        "Não foi possível copiar. Selecione a legenda e copie pelo teclado.",
      );
    }
  };

  return (
    <div className={styles.center}>
      {notice ? (
        <div className={`notice ${styles.notice}`} role="status">
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Fechar aviso"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
      <section aria-labelledby="connected-heading">
        <div className={styles.sectionHead}>
          <h2 id="connected-heading" className="display">
            Contas conectadas
          </h2>
          <span>Instagram Reels & TikTok</span>
        </div>
        <div className="accounts-row">
          <AccountCard
            icon={<Camera size={20} />}
            name="Instagram"
            account={accounts.find(
              (account) => account.platform === "instagram",
            )}
            hint="Conecte uma conta profissional para publicar Reels."
            onConnect={() => {
              setIgError(null);
              setIgModal(true);
            }}
            onDisconnect={() => disconnect("instagram")}
            busy={busy}
          />
          <AccountCard
            icon={<Music4 size={20} />}
            name="TikTok"
            account={accounts.find((account) => account.platform === "tiktok")}
            hint={
              tiktokOAuth
                ? "Conecte sua conta pelo TikTok."
                : "Demonstração disponível. Publicação real ainda não configurada."
            }
            onConnect={connectTiktok}
            onDisconnect={() => disconnect("tiktok")}
            busy={busy}
            demoOnly={!tiktokOAuth}
          />
        </div>
      </section>
      <section aria-labelledby="queue-heading">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="queue-heading" className="display">
              Seu conteúdo, no ritmo certo
            </h2>
            <p>
              Prepare a legenda, revise o vídeo e organize as próximas
              publicações.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-accent btn-sm"
            onClick={newPost}
          >
            <Plus size={15} />
            Nova publicação
          </button>
        </div>
        <div className={styles.filters} aria-label="Filtrar publicações">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span>
                {
                  posts.filter(
                    (post) =>
                      item.id === "all" ||
                      (item.id === "scheduled"
                        ? ["scheduled", "posting"].includes(post.status)
                        : post.status === item.id),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        {hasPending && !backgroundPublishing ? (
          <p className={styles.schedulerNote}>
            <CalendarClock size={15} />
            Mantenha esta página aberta para processar os horários agendados. O
            agendador em segundo plano ainda não está ativo nesta instalação.
          </p>
        ) : null}
        {shownPosts.length ? (
          <div className="queue">
            {shownPosts.map((post) => {
              const video = videos.find((item) => item.id === post.videoId);
              const demo = isDemoPost(post);
              return (
                <article
                  key={post.id}
                  className="queue-card"
                  data-status={post.status}
                >
                  <div className="thumb">
                    {video ? (
                      <video
                        src={video.resultUrl}
                        poster={video.thumbnailUrl}
                        muted
                        playsInline
                        preload="none"
                      />
                    ) : (
                      <Film size={20} />
                    )}
                  </div>
                  <div className="info">
                    <div className="line1">
                      <b>
                        {post.platform === "instagram" ? "Instagram" : "TikTok"}
                      </b>
                      <span className="q-status" data-status={post.status}>
                        {post.status === "posting" ? (
                          <span
                            className="spinner"
                            style={{ width: 12, height: 12 }}
                          />
                        ) : post.status === "posted" ? (
                          <CheckCircle2 size={13} />
                        ) : null}
                        {demo && post.status === "posted"
                          ? "Simulação concluída"
                          : STATUS_LABEL[post.status]}
                      </span>
                      {demo ? <span className={styles.demo}>Demo</span> : null}
                    </div>
                    <p className="caption">
                      {post.caption || "Legenda ainda não escrita"}
                    </p>
                    <p className="meta">
                      <CalendarClock size={12} />
                      {post.status === "draft"
                        ? `Salvo em ${formatDate(post.scheduledAt)}`
                        : `${formatDate(post.scheduledAt)} · Brasília`}
                    </p>
                    {post.error ? (
                      <p className={styles.error}>{post.error}</p>
                    ) : null}
                  </div>
                  <div className={`q-actions ${styles.queueActions}`}>
                    {post.status === "draft" || post.status === "failed" ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => editPost(post)}
                        aria-label={
                          post.status === "draft"
                            ? "Editar rascunho"
                            : "Revisar e preparar novamente"
                        }
                      >
                        <Pencil size={14} />
                        <span>
                          {post.status === "draft" ? "Editar" : "Revisar"}
                        </span>
                      </button>
                    ) : null}
                    {post.postedUrl && !demo ? (
                      <a
                        href={post.postedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost btn-sm"
                        aria-label="Abrir publicação"
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy || post.status === "posting"}
                      onClick={() => removePost(post)}
                      aria-label={
                        post.status === "scheduled"
                          ? "Cancelar agendamento"
                          : "Remover registro"
                      }
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
            <FileText size={28} />
            <div className="big">
              {filter === "all"
                ? "Sua próxima publicação começa aqui"
                : "Nenhuma publicação nesta etapa"}
            </div>
            <p>
              {videos.length
                ? "Escolha um vídeo pronto, crie uma legenda com a voz do seu personagem e salve um rascunho."
                : "Os vídeos prontos dos seus personagens aparecem aqui para você preparar a publicação."}
            </p>
            {videos.length ? (
              <button
                type="button"
                className="btn btn-accent"
                onClick={newPost}
              >
                <Pencil size={16} />
                Preparar publicação
              </button>
            ) : (
              <Link href="/app/criar-videos" className="btn btn-accent">
                <Film size={16} />
                Criar meu primeiro vídeo
              </Link>
            )}
          </div>
        )}
      </section>

      {composerOpen ? (
        <PublishDialog
          titleId="composer-title"
          onClose={() => !busy && setComposerOpen(false)}
          wide
        >
          <h2 id="composer-title">
            {draftId ? "Editar rascunho" : "Preparar publicação"}
          </h2>
          <p className="modal-sub">
            Do vídeo à legenda, tudo pronto para a sua revisão.
          </p>
          <div className={styles.composer}>
            <div className={styles.editor}>
              <div className="field">
                <label htmlFor="pub-video">1. Escolha o vídeo</label>
                {videos.length ? (
                  <select
                    id="pub-video"
                    className="input"
                    value={videoId}
                    onChange={(event) => {
                      setVideoId(event.target.value);
                      setMediaError(false);
                    }}
                  >
                    {videos.map((video) => (
                      <option key={video.id} value={video.id}>
                        {video.characterName ? `${video.characterName} · ` : ""}
                        {video.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className={styles.help}>
                    Nenhum vídeo pronto.{" "}
                    <Link href="/app/criar-videos">Criar um vídeo →</Link>
                  </p>
                )}
              </div>
              <div className="field">
                <label>2. Escolha a rede</label>
                <div className="mode-tabs">
                  <button
                    type="button"
                    aria-pressed={platform === "instagram"}
                    data-active={platform === "instagram"}
                    onClick={() => setPlatform("instagram")}
                  >
                    <Camera size={15} />
                    Instagram Reels
                  </button>
                  <button
                    type="button"
                    aria-pressed={platform === "tiktok"}
                    data-active={platform === "tiktok"}
                    onClick={() => setPlatform("tiktok")}
                  >
                    <Music4 size={15} />
                    TikTok
                  </button>
                </div>
                <p className={styles.help}>
                  {!pickedAccount
                    ? "Você pode salvar o rascunho agora e conectar a conta depois."
                    : pickedAccount.status === "demo"
                      ? "Modo demonstração: nenhuma publicação será enviada para a rede."
                      : platform === "tiktok"
                        ? `@${pickedAccount.username} · Os envios desta integração ficam privados (somente você).`
                        : `Publicar em @${pickedAccount.username}`}
                </p>
              </div>
              <details className={styles.assistant}>
                <summary>
                  <WandSparkles size={16} />
                  Ajuda para escrever a legenda
                </summary>
                <div className={styles.assistantBody}>
                  <p className={styles.help}>
                    Uma base editável com gancho, contexto, uma ação e hashtags.
                    Use os detalhes reais da sua cena.
                  </p>
                  <div className="field">
                    <label htmlFor="pub-topic">O que acontece no vídeo?</label>
                    <input
                      id="pub-topic"
                      className="input"
                      placeholder="Ex.: meu personagem dança na praia ao pôr do sol"
                      value={topic}
                      maxLength={300}
                      onChange={(event) => setTopic(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="pub-goal">Objetivo da publicação</label>
                    <select
                      id="pub-goal"
                      className="input"
                      value={goal}
                      onChange={(event) =>
                        setGoal(event.target.value as CaptionGoal)
                      }
                    >
                      {Object.entries(CAPTION_GOALS).map(([value, item]) => (
                        <option key={value} value={value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!topic.trim()}
                    onClick={() =>
                      setCaption(
                        buildCaption({
                          topic,
                          goal,
                          character: pickedVideo?.characterName,
                        }),
                      )
                    }
                  >
                    <WandSparkles size={14} />
                    {caption
                      ? "Substituir pela base de legenda"
                      : "Montar base da legenda"}
                  </button>
                </div>
              </details>
              <div className="field">
                <div className={styles.labelRow}>
                  <label htmlFor="pub-caption">3. Legenda</label>
                  <button
                    type="button"
                    onClick={copyCaption}
                    disabled={!caption.trim()}
                  >
                    <Copy size={13} />
                    Copiar
                  </button>
                </div>
                <textarea
                  id="pub-caption"
                  className={`input ${styles.captionInput}`}
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  placeholder="Comece com uma frase que desperte curiosidade.\n\nConte o contexto da cena na voz do seu personagem.\n\nTermine com uma pergunta específica ou uma única ação."
                  aria-describedby="pub-caption-review"
                />
                <div id="pub-caption-review" className={styles.captionMeta}>
                  <span data-warning={review.length > CAPTION_LIMIT}>
                    {review.length.toLocaleString("pt-BR")} /{" "}
                    {CAPTION_LIMIT.toLocaleString("pt-BR")} caracteres
                  </span>
                  <span data-warning={review.hook.length > 125}>
                    Gancho: {review.hook.length}/125
                  </span>
                  <span>{review.hashtags.length} hashtags</span>
                </div>
                {review.warnings.length ? (
                  <ul className={styles.review}>
                    {review.warnings.map((warning) => (
                      <li key={warning}>
                        <AlertCircle size={14} />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.help}>
                    Dê um motivo para salvar, compartilhar ou responder. Revise
                    os fatos e a voz do personagem.
                  </p>
                )}
              </div>
              <div className="field">
                <label>4. Quando publicar</label>
                <div className="mode-tabs">
                  <button
                    type="button"
                    data-active={timing === "now"}
                    aria-pressed={timing === "now"}
                    onClick={() => setTiming("now")}
                  >
                    Agora
                  </button>
                  <button
                    type="button"
                    data-active={timing === "later"}
                    aria-pressed={timing === "later"}
                    onClick={() => setTiming("later")}
                  >
                    <CalendarClock size={15} />
                    Agendar
                  </button>
                </div>
                {timing === "later" ? (
                  <>
                    <label htmlFor="pub-when" className={styles.help}>
                      Data e hora de Brasília (UTC−3)
                    </label>
                    <input
                      id="pub-when"
                      type="datetime-local"
                      className="input"
                      min={publishDateValue(Date.now() + 60_000)}
                      value={when}
                      onChange={(event) => setWhen(event.target.value)}
                    />
                    {!backgroundPublishing ? (
                      <p className={styles.help}>
                        Mantenha a página Publicar aberta no horário escolhido
                        para executar o agendamento.
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
            <aside className={styles.preview} aria-label="Prévia da publicação">
              <div className={styles.previewHeading}>
                <span>PRÉVIA</span>
                <span>{platform === "instagram" ? "Reel" : "TikTok"}</span>
              </div>
              <div className={styles.previewVideo}>
                {pickedVideo ? (
                  <video
                    key={pickedVideo.resultUrl}
                    src={pickedVideo.resultUrl}
                    poster={pickedVideo.thumbnailUrl}
                    controls
                    playsInline
                    preload="metadata"
                    onError={() => setMediaError(true)}
                  />
                ) : (
                  <div className={styles.noVideo}>
                    <Film size={30} />
                    <span>Selecione um vídeo</span>
                  </div>
                )}
              </div>
              {mediaError ? (
                <p className={styles.error}>
                  Não foi possível reproduzir a prévia.{" "}
                  <a
                    href={pickedVideo?.resultUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir vídeo original
                  </a>
                </p>
              ) : null}
              <div className={styles.previewCaption}>
                <b>@{pickedAccount?.username ?? "seu_personagem"}</b>
                <p>
                  {caption
                    ? fullPreview
                      ? caption
                      : caption.slice(0, 125)
                    : "Sua legenda aparece aqui enquanto você escreve."}
                </p>
                {caption.length > 125 ? (
                  <button
                    type="button"
                    onClick={() => setFullPreview(!fullPreview)}
                  >
                    {fullPreview ? "Mostrar menos" : "… mais"}
                  </button>
                ) : null}
              </div>
              <p className={styles.help}>
                Confira o áudio, o enquadramento e a legenda antes de enviar.
              </p>
            </aside>
          </div>
          {composerError ? (
            <div className="auth-error" role="alert">
              {composerError}
            </div>
          ) : null}
          <div className={styles.composerFooter}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || !pickedVideo || review.length > CAPTION_LIMIT}
              onClick={saveDraft}
            >
              <FileText size={15} />
              {busy ? "Salvando…" : "Salvar rascunho"}
            </button>
            <button
              type="button"
              className="btn btn-accent"
              disabled={
                busy ||
                !pickedVideo ||
                !pickedAccount ||
                review.length > CAPTION_LIMIT ||
                !caption.trim()
              }
              onClick={schedule}
            >
              {busy ? <span className="spinner" /> : <Send size={15} />}
              {pickedAccount?.status === "demo"
                ? timing === "later"
                  ? "Agendar simulação"
                  : "Simular publicação"
                : timing === "later"
                  ? "Agendar publicação"
                  : "Publicar agora"}
            </button>
          </div>
        </PublishDialog>
      ) : null}

      {igModal ? (
        <PublishDialog
          titleId="ig-title"
          onClose={() => !busy && setIgModal(false)}
        >
          <h2 id="ig-title">Conectar Instagram</h2>
          <p className="modal-sub">
            Use sua conta profissional (Criador ou Empresa) para publicar Reels.
          </p>
          <div className={styles.editor}>
            <div className="field">
              <label htmlFor="ig-user">ID da conta do Instagram</label>
              <input
                id="ig-user"
                className="input"
                placeholder="1784..."
                value={igUserId}
                onChange={(event) => setIgUserId(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="ig-token">Token de acesso</label>
              <input
                id="ig-token"
                className="input"
                type="password"
                autoComplete="off"
                placeholder="Token da Meta"
                value={igToken}
                onChange={(event) => setIgToken(event.target.value)}
              />
              <p className={styles.help}>
                Use um token válido com permissão de publicação.{" "}
                <a
                  href="https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Como obter as credenciais ↗
                </a>
              </p>
            </div>
            {igError ? (
              <div className="auth-error" role="alert">
                {igError}
              </div>
            ) : null}
            <button
              type="button"
              className="btn btn-accent"
              disabled={busy || !igUserId.trim() || !igToken.trim()}
              onClick={() => connectInstagram(false)}
            >
              {busy ? <span className="spinner" /> : "Conectar conta real"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => connectInstagram(true)}
            >
              Experimentar em demonstração
            </button>
            <p className={styles.help}>
              A demonstração permite testar a fila sem enviar posts ao
              Instagram.
            </p>
          </div>
        </PublishDialog>
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
  demoOnly = false,
}: {
  icon: ReactNode;
  name: string;
  account?: MiniAccount;
  hint: string;
  onConnect: () => void;
  onDisconnect: () => void;
  busy: boolean;
  demoOnly?: boolean;
}) {
  return (
    <div
      className="account-card"
      data-connected={account?.status === "connected"}
    >
      <div className="icon">{icon}</div>
      <div className="info">
        <b>{name}</b>
        {account ? (
          <span className={account.status === "connected" ? "ok" : undefined}>
            @{account.username} ·{" "}
            {account.status === "demo" ? "Demonstração" : "Conectada"}
          </span>
        ) : (
          <span>{hint}</span>
        )}
      </div>
      {account ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={onDisconnect}
          aria-label={`Desconectar ${name}`}
        >
          <Unplug size={14} />
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-accent btn-sm"
          onClick={onConnect}
          disabled={busy}
        >
          {demoOnly ? "Testar demo" : "Conectar"}
        </button>
      )}
    </div>
  );
}

function PublishDialog({
  titleId,
  children,
  onClose,
  wide = false,
}: {
  titleId: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${styles.dialog} ${wide ? styles.wideDialog : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <button
        type="button"
        className="modal-close"
        onClick={onClose}
        aria-label="Fechar janela"
      >
        <X size={16} />
      </button>
      {children}
    </dialog>
  );
}
