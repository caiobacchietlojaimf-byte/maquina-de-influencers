"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
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
  RefreshCw,
  Undo2,
  ChartNoAxesCombined,
  Film,
  AlertCircle,
} from "lucide-react";
import {
  connectInstagramAction,
  connectTiktokAction,
  deletePostAction,
  disconnectAccountAction,
  getAccountsAction,
  getTikTokCreatorAction,
  pollPostsAction,
  savePostDraftAction,
  schedulePostAction,
} from "@/app/actions/posts";
import { getInstagramPerformanceAction, improvePublicationAction, preparePublicationAction } from "@/app/actions/publication-assistant";
import type { InstagramPerformance, PublicationSuggestion } from "@/lib/publication-assistant-types";
import type { Post, SocialPlatform } from "@/lib/db";
import type { TikTokCreator } from "@/lib/social";
import { displayDateTime } from "@/lib/display-date";
import {
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
  displayDateTime(timestamp, "short");
const errorMessage = (caught: unknown) =>
  caught instanceof Error
    ? caught.message
    : "Não foi possível concluir. Tente novamente.";
const isDemoPost = (post: Post) =>
  post.mode === "demo" || Boolean(post.postedUrl?.includes("demo-"));
const SUGGESTION_SOURCES: Record<PublicationSuggestion["source"]["kind"], string> = {
  "reference-caption": "Legenda da referência",
  "reference-context": "Contexto da referência",
  "video-context": "Contexto do vídeo",
};

type SuggestionRequestState = { session: number; request: number; captionRevision: number };
type ImprovementPreview = {
  suggestion: PublicationSuggestion;
  sent: SuggestionRequestState;
  originalCaption: string;
  selectedCaption: string;
};
type ImprovementUndo = { originalCaption: string; appliedCaption: string; captionRevision: number };

/** A response may supply options after typing, but cannot overwrite a newer edit. */
export function isCurrentPublicationSuggestion(sent: SuggestionRequestState, current: SuggestionRequestState): boolean {
  return sent.session === current.session && sent.request === current.request;
}
export function canApplyPublicationSuggestion(sent: SuggestionRequestState, current: SuggestionRequestState, edited: boolean): boolean {
  return isCurrentPublicationSuggestion(sent, current) && !edited && sent.captionRevision === current.captionRevision;
}
export function canUndoPublicationImprovement(undo: ImprovementUndo | null, caption: string, revision: number): boolean {
  return Boolean(undo && undo.appliedCaption === caption && undo.captionRevision === revision);
}
function captionAlternatives(suggestion: PublicationSuggestion) {
  const options = [...suggestion.alternatives];
  if (!options.some(option => option.caption === suggestion.caption)) options.unshift({ label: "Principal", caption: suggestion.caption });
  return options.filter((option, index) => options.findIndex(other => other.caption === option.caption) === index).slice(0, 3);
}

export function PublishCenter({
  initialAccounts,
  initialPosts,
  videos,
  tiktokOAuth,
  instagramOAuth,
  preselectVideoId,
  flash,
  backgroundPublishing = false,
}: {
  initialAccounts: MiniAccount[];
  initialPosts: Post[];
  videos: MiniVideo[];
  tiktokOAuth: boolean;
  instagramOAuth: boolean;
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
  const [igError, setIgError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(Boolean(preselectVideoId));
  const [draftId, setDraftId] = useState<string | undefined>();
  const [videoId, setVideoId] = useState(
    preselectVideoId && videos.some((video) => video.id === preselectVideoId)
      ? preselectVideoId
      : (videos[0]?.id ?? ""),
  );
  const [platform, setPlatform] = useState<SocialPlatform>(() => initialAccounts.some(account => account.platform === "instagram" && account.status === "connected") ? "instagram" : initialAccounts.some(account => account.platform === "tiktok" && account.status === "connected") ? "tiktok" : "instagram");
  const [caption, setCaption] = useState("");
  const [composerSession, setComposerSession] = useState(0);
  const suggestionState = useRef<SuggestionRequestState>({ session: 0, request: 0, captionRevision: 0 });
  const captionEdited = useRef(false);
  const [suggestion, setSuggestion] = useState<PublicationSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionRefresh, setSuggestionRefresh] = useState(0);
  const [improvement, setImprovement] = useState<ImprovementPreview | null>(null);
  const [improving, setImproving] = useState(false);
  const [improvementError, setImprovementError] = useState<string | null>(null);
  const [improvementUndo, setImprovementUndo] = useState<ImprovementUndo | null>(null);
  const improvementRequest = useRef<{ sent: SuggestionRequestState; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [performance, setPerformance] = useState<InstagramPerformance | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [performanceRefresh, setPerformanceRefresh] = useState(0);
  const [goal, setGoal] = useState<CaptionGoal>("comments");
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [when, setWhen] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);
  const requestKey = useRef<string | undefined>(undefined);
  const [creator, setCreator] = useState<TikTokCreator | null>(null);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [commercial, setCommercial] = useState(false);
  const [ownBrand, setOwnBrand] = useState(false);
  const [paidBrand, setPaidBrand] = useState(false);
  const [tiktokConsent, setTiktokConsent] = useState(false);
  const hasPending = posts.some(
    (post) => post.status === "scheduled" || post.status === "posting",
  );
  const pickedVideo = videos.find((video) => video.id === videoId);
  const pickedAccount = accounts.find(
    (account) => account.platform === platform,
  );
  const instagramAccount = accounts.find(account => account.platform === "instagram" && account.status === "connected");
  const instagramConnectionKey = instagramAccount ? `${instagramAccount.username}:${instagramAccount.connectedAt}` : null;
  const review = inspectCaption(caption);
  const contextSuggestion = improvement?.suggestion ?? suggestion;
  const tiktokReady = Boolean(creator && privacy && tiktokConsent && (!commercial || ownBrand || paidBrand) && !(commercial && paidBrand && privacy === "SELF_ONLY"));
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
  useEffect(() => () => {
    if (improvementRequest.current) clearTimeout(improvementRequest.current.timer);
    improvementRequest.current = null;
  }, []);
  useEffect(() => {
    if (!composerOpen || platform !== "tiktok" || pickedAccount?.status !== "connected") return;
    let active = true;
    setCreator(null); setCreatorError(null); setPrivacy(""); setTiktokConsent(false);
    setAllowComment(false); setAllowDuet(false); setAllowStitch(false);
    getTikTokCreatorAction().then((result) => {
      if (!active) return;
      if ("error" in result) setCreatorError(result.error);
      else setCreator(result.creator);
    }).catch(() => { if (active) setCreatorError("Não foi possível consultar as opções do TikTok. Feche e abra a publicação para tentar novamente."); });
    return () => { active = false; };
  }, [composerOpen, platform, pickedAccount?.status, pickedAccount?.connectedAt]);
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

  useEffect(() => {
    if (!composerOpen || !videoId) return;
    const sent = { ...suggestionState.current, request: suggestionState.current.request + 1 };
    suggestionState.current = sent;
    let active = true;
    setSuggestion(null);
    setSuggestionError(null);
    setSuggestionLoading(true);
    const timer = setTimeout(() => {
      if (!active || !isCurrentPublicationSuggestion(sent, suggestionState.current)) return;
      active = false;
      setSuggestionLoading(false);
      setSuggestionError("A preparação da legenda demorou. Seu texto foi mantido. Tente novamente ou continue editando.");
    }, 80_000);
    startTransition(() => {
      void preparePublicationAction({ videoId, platform, goal }).then(result => {
        if (!active || !isCurrentPublicationSuggestion(sent, suggestionState.current)) return;
        if ("error" in result) { setSuggestionError(result.error); return; }
        if (result.suggestion.videoId !== videoId) { setSuggestionError("Não foi possível conferir a legenda deste vídeo. Tente novamente."); return; }
        setSuggestion(result.suggestion);
        if (canApplyPublicationSuggestion(sent, suggestionState.current, captionEdited.current)) setCaption(result.suggestion.caption);
      }).catch(() => {
        if (active && isCurrentPublicationSuggestion(sent, suggestionState.current)) setSuggestionError("Não foi possível preparar a legenda. Você pode editar o texto ou tentar novamente.");
      }).finally(() => {
        clearTimeout(timer);
        if (active && isCurrentPublicationSuggestion(sent, suggestionState.current)) setSuggestionLoading(false);
      });
    });
    return () => { active = false; clearTimeout(timer); };
  }, [composerOpen, composerSession, videoId, platform, goal, suggestionRefresh]);

  useEffect(() => {
    if (!instagramConnectionKey) { setPerformance(null); setPerformanceError(null); setPerformanceLoading(false); return; }
    let active = true;
    setPerformance(null);
    setPerformanceError(null);
    setPerformanceLoading(true);
    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      setPerformanceLoading(false);
      setPerformanceError("A consulta demorou. Atualize para tentar novamente.");
    }, 80_000);
    startTransition(() => {
      void getInstagramPerformanceAction().then(result => {
        if (active) setPerformance(result);
      }).catch(() => {
        if (active) setPerformanceError("Não foi possível consultar o desempenho agora.");
      }).finally(() => {
        clearTimeout(timer);
        if (active) setPerformanceLoading(false);
      });
    });
    return () => { active = false; clearTimeout(timer); };
  }, [instagramConnectionKey, performanceRefresh]);

  function closeComposer() {
    suggestionState.current = { ...suggestionState.current, session: suggestionState.current.session + 1, request: suggestionState.current.request + 1 };
    clearImprovement();
    setComposerOpen(false);
  }
  function resetCaptionSession(edited: boolean) {
    suggestionState.current = { session: suggestionState.current.session + 1, request: suggestionState.current.request + 1, captionRevision: suggestionState.current.captionRevision + 1 };
    clearImprovement();
    captionEdited.current = edited;
    setComposerSession(suggestionState.current.session);
    setSuggestion(null);
    setSuggestionError(null);
  }
  function changeCaptionContext() {
    suggestionState.current = { ...suggestionState.current, request: suggestionState.current.request + 1 };
    clearImprovement();
    setSuggestion(null);
    setSuggestionError(null);
    if (!captionEdited.current) setCaption("");
  }
  function editCaption(value: string) {
    captionEdited.current = true;
    suggestionState.current = { ...suggestionState.current, captionRevision: suggestionState.current.captionRevision + 1 };
    setImprovementUndo(null);
    setCaption(value);
  }
  function clearImprovement() {
    if (improvementRequest.current) clearTimeout(improvementRequest.current.timer);
    improvementRequest.current = null;
    setImprovement(null);
    setImproving(false);
    setImprovementError(null);
    setImprovementUndo(null);
  }
  function improveCaption() {
    if (busy || !composerOpen || !videoId || improvementRequest.current) return;
    if (!caption.trim() || caption.trim().length > CAPTION_LIMIT) {
      setImprovementError(`Escreva uma legenda de 1 a ${CAPTION_LIMIT.toLocaleString("pt-BR")} caracteres para melhorar.`);
      return;
    }
    clearImprovement();
    // Invalidate automatic preparation before dispatching a user-requested improvement.
    const sent = { ...suggestionState.current, request: suggestionState.current.request + 1 };
    suggestionState.current = sent;
    const originalCaption = caption;
    setSuggestionLoading(false);
    setSuggestionError(null);
    setImproving(true);
    const isCurrent = () => improvementRequest.current?.sent === sent && isCurrentPublicationSuggestion(sent, suggestionState.current);
    const timer = setTimeout(() => {
      if (!isCurrent()) return;
      improvementRequest.current = null;
      setImproving(false);
      setImprovementError("A melhoria demorou. Sua legenda foi mantida. Tente novamente ou continue editando.");
    }, 80_000);
    improvementRequest.current = { sent, timer };
    startTransition(() => {
      void improvePublicationAction({ videoId, platform, goal, caption: originalCaption }).then(result => {
        if (!isCurrent()) return;
        if ("error" in result) { setImprovementError(result.error); return; }
        if (result.suggestion.videoId !== videoId) { setImprovementError("Não foi possível conferir a melhoria deste vídeo. Sua legenda foi mantida."); return; }
        setImprovement({ suggestion: result.suggestion, sent, originalCaption, selectedCaption: result.suggestion.caption });
      }).catch(() => {
        if (isCurrent()) setImprovementError("Não foi possível melhorar agora. Sua legenda foi mantida. Tente novamente.");
      }).finally(() => {
        clearTimeout(timer);
        if (isCurrent()) {
          improvementRequest.current = null;
          setImproving(false);
        }
      });
    });
  }
  function applyImprovement() {
    if (!improvement || busy || !isCurrentPublicationSuggestion(improvement.sent, suggestionState.current)) return;
    const previousCaption = caption;
    editCaption(improvement.selectedCaption);
    setImprovementUndo({ originalCaption: previousCaption, appliedCaption: improvement.selectedCaption, captionRevision: suggestionState.current.captionRevision });
    setSuggestion(improvement.suggestion);
    setImprovement(null);
  }
  function undoImprovement() {
    if (busy || !canUndoPublicationImprovement(improvementUndo, caption, suggestionState.current.captionRevision)) return;
    editCaption(improvementUndo!.originalCaption);
  }

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
      setNotice(result.error ?? "Não foi possível iniciar a conexão.");
    } catch (caught) {
      setNotice(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const connectInstagram = async () => {
    setBusy(true);
    setIgError(null);
    try {
      const result = await connectInstagramAction();
      if (result.error) {
        setIgError(result.error);
        return;
      }
      if (result.redirect) window.location.href = result.redirect;
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
    resetCaptionSession(false);
    setPlatform(instagramAccount ? "instagram" : accounts.some(account => account.platform === "tiktok" && account.status === "connected") ? "tiktok" : "instagram");
    setGoal("comments");
    requestKey.current = undefined;
    setCommercial(false); setOwnBrand(false); setPaidBrand(false); setTiktokConsent(false);
    setDraftId(undefined);
    setCaption("");
    setWhen("");
    setTiming("now");
    setComposerError(null);
    setMediaError(false);
    setFullPreview(false);
    setComposerOpen(true);
  };
  const editPost = (post: Post) => {
    resetCaptionSession(true);
    setGoal("comments");
    requestKey.current = undefined;
    setCommercial(false); setOwnBrand(false); setPaidBrand(false); setTiktokConsent(false);
    setDraftId(post.status === "draft" ? post.id : undefined);
    setVideoId(post.videoId);
    setPlatform(post.platform);
    setCaption(post.caption);
    setWhen("");
    setTiming("now");
    setMediaError(false);
    setComposerError(null);
    setComposerOpen(true);
  };
  const saveDraft = async () => {
    // Keep the exact text being saved if an earlier suggestion finishes now.
    captionEdited.current = true;
    suggestionState.current = { ...suggestionState.current, captionRevision: suggestionState.current.captionRevision + 1 };
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
      closeComposer();
      setFilter("draft");
      setNotice("Rascunho salvo. Você pode continuar a edição quando quiser.");
    } catch (caught) {
      setComposerError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  const schedule = async () => {
    captionEdited.current = true;
    suggestionState.current = { ...suggestionState.current, captionRevision: suggestionState.current.captionRevision + 1 };
    setComposerError(null);
    if (platform === "tiktok" && !tiktokReady) { setComposerError("Confira as opções do TikTok e aceite os termos antes de enviar."); return; }
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
        requestKey: requestKey.current ??= crypto.randomUUID(),
        videoId,
        platform,
        caption,
        draftId,
        scheduledAt,
        ...(platform === "tiktok" ? { tiktok: { privacyLevel: privacy, allowComment, allowDuet, allowStitch, brandOrganic: commercial && ownBrand, brandedContent: commercial && paidBrand, consentAt: Date.now() } } : {}),
      });
      if ("error" in result) {
        setComposerError(result.error);
        return;
      }
      closeComposer();
      setCaption("");
      setDraftId(undefined);
      requestKey.current = undefined;
      setFilter("scheduled");
      setNotice(
        timing === "later"
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
            hint={instagramOAuth ? "Conecte sua conta profissional pelo Instagram." : "Conexão oficial aguardando configuração da Meta."}
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
                : "Conexão oficial aguardando configuração do TikTok."
            }
            onConnect={connectTiktok}
            onDisconnect={() => disconnect("tiktok")}
            busy={busy}
            unavailable={!tiktokOAuth}
          />
        </div>
      </section>
      {instagramAccount ? <section className={styles.performance} aria-labelledby="performance-heading">
        <div className={styles.performanceHead}><div><ChartNoAxesCombined size={17} /><h2 id="performance-heading">Desempenho no Instagram</h2><span>@{instagramAccount.username}</span></div><button type="button" className="btn btn-ghost btn-sm" disabled={performanceLoading || busy} onClick={() => setPerformanceRefresh(value => value + 1)} aria-label="Atualizar desempenho do Instagram"><RefreshCw size={14} />Atualizar</button></div>
        {performanceLoading ? <p className={styles.performanceStatus} role="status"><span className="spinner" aria-hidden="true" />Consultando publicações…</p> : performanceError ? <p className={styles.help} role="status">{performanceError}</p> : performance ? <>
          <p className={styles.help}>{performance.summary}</p>
          {performance.status === "ready" && performance.posts.length ? <>
            <div className={styles.performanceMetrics}>{([['likes', 'Curtidas'], ['comments', 'Comentários'], ['views', 'Visualizações']] as const).flatMap(([metric, label]) => {
              const available = performance.posts.filter(post => typeof post[metric] === "number" && Number.isFinite(post[metric]));
              if (!available.length || available.length !== performance.posts.length) return [];
              return <div key={metric}><strong>{available.reduce((sum, post) => sum + post[metric]!, 0).toLocaleString("pt-BR")}</strong><span>{label}</span></div>;
            })}<div><strong>{performance.posts.length.toLocaleString("pt-BR")}</strong><span>Publicações na amostra</span></div></div>
            <details className={styles.performanceDetails}><summary>Ver publicações e observações</summary><div className={styles.performancePosts}>{performance.posts.slice(0, 5).map(post => <div key={post.id}><p>{post.caption || "Publicação sem legenda"}</p><div>{([['likes', 'curtidas'], ['comments', 'comentários'], ['views', 'visualizações']] as const).map(([metric, label]) => typeof post[metric] === "number" && Number.isFinite(post[metric]) ? <span key={metric}>{post[metric]!.toLocaleString("pt-BR")} {label}</span> : null)}{post.permalink && /^https:\/\//.test(post.permalink) ? <a href={post.permalink} target="_blank" rel="noreferrer">Abrir<ExternalLink size={11} /></a> : null}</div></div>)}</div>{performance.recommendations.length ? <ul>{performance.recommendations.slice(0, 3).map(item => <li key={item}>{item}</li>)}</ul> : null}</details>
          </> : null}
        </> : null}
      </section> : null}
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
                    {post.status === "draft" || (post.status === "failed" && !post.publicationUncertain) ? (
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
          onClose={() => !busy && closeComposer()}
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
                      if (event.target.value !== videoId) changeCaptionContext();
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
                    onClick={() => { if (platform !== "instagram") changeCaptionContext(); setPlatform("instagram"); }}
                  >
                    <Camera size={15} />
                    Instagram Reels
                  </button>
                  <button
                    type="button"
                    aria-pressed={platform === "tiktok"}
                    data-active={platform === "tiktok"}
                    onClick={() => { if (platform !== "tiktok") changeCaptionContext(); setPlatform("tiktok"); }}
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
                        ? `Publicar em ${creator?.nickname ?? pickedAccount.username}`
                        : `Publicar em @${pickedAccount.username}`}
                </p>
              </div>
              {platform === "tiktok" && pickedAccount?.status === "connected" ? (
                <fieldset className="field" style={{ border: 0, padding: 0 }}>
                  <legend>Opções do TikTok</legend>
                  {creatorError ? <p className={styles.error}>{creatorError}</p> : !creator ? <p className={styles.help}>Consultando as opções atuais da conta…</p> : <>
                    <p className={styles.help}>{creator.nickname} · @{creator.username} · Vídeos até {creator.maxDuration}s. Aplicativos ainda não auditados pelo TikTok aceitam somente contas privadas e visibilidade Somente eu.</p>
                    <label htmlFor="tt-privacy">Quem pode assistir?</label>
                    <select id="tt-privacy" className="input" value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                      <option value="">Escolha a visibilidade</option>
                      {creator.privacyOptions.map((option) => <option key={option} value={option} disabled={commercial && paidBrand && option === "SELF_ONLY"}>{({ PUBLIC_TO_EVERYONE: "Todos", MUTUAL_FOLLOW_FRIENDS: "Amigos", FOLLOWER_OF_CREATOR: "Seguidores", SELF_ONLY: "Somente eu" } as Record<string, string>)[option] ?? option}</option>)}
                    </select>
                    {([["Permitir comentários", allowComment, setAllowComment, creator.commentDisabled], ["Permitir Dueto", allowDuet, setAllowDuet, creator.duetDisabled], ["Permitir Costura", allowStitch, setAllowStitch, creator.stitchDisabled]] as const).map(([label, checked, setter, disabled]) => <label key={label} style={{ opacity: disabled ? 0.55 : 1 }}><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => setter(e.target.checked)} /> {label}{disabled ? " (desativado na conta)" : ""}</label>)}
                    <label><input type="checkbox" checked={commercial} onChange={(e) => setCommercial(e.target.checked)} /> Este vídeo promove uma marca, produto ou serviço</label>
                    {commercial ? <>
                      <label><input type="checkbox" checked={ownBrand} onChange={(e) => setOwnBrand(e.target.checked)} /> Minha marca</label>
                      <label><input type="checkbox" checked={paidBrand} disabled={privacy === "SELF_ONLY"} onChange={(e) => setPaidBrand(e.target.checked)} /> Parceria paga com outra marca</label>
                      <p className={styles.help}>{paidBrand ? "Seu vídeo será identificado como Parceria paga." : ownBrand ? "Seu vídeo será identificado como Conteúdo promocional." : "Indique sua marca, outra marca ou ambas para continuar."} {privacy === "SELF_ONLY" ? "Parceria paga exige visibilidade pública ou para amigos." : ""}</p>
                    </> : null}
                    <p className={styles.help}>O vídeo será identificado no TikTok como conteúdo gerado com IA.</p>
                    <label><input type="checkbox" checked={tiktokConsent} onChange={(e) => setTiktokConsent(e.target.checked)} /> Ao publicar, concordo com a <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Confirmação de Uso de Música do TikTok</a>{commercial && paidBrand ? <> e a <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Política de Conteúdo de Marca</a></> : null}.</label>
                  </>}
                </fieldset>
              ) : null}
              <div className="field">
                <div className={styles.labelRow}>
                  <label htmlFor="pub-caption">3. Legenda</label>
                  <div className={styles.captionActions}>
                    <button type="button" onClick={improveCaption} disabled={busy || improving || !videoId || !caption.trim() || caption.trim().length > CAPTION_LIMIT} aria-controls="pub-improvement">
                      <WandSparkles size={13} aria-hidden="true" />Melhorar post
                    </button>
                    <button type="button" onClick={copyCaption} disabled={!caption.trim()}>
                      <Copy size={13} aria-hidden="true" />Copiar
                    </button>
                  </div>
                </div>
                <div className={styles.suggestionStatus} role="status">
                  {suggestionLoading ? <><span className="spinner" aria-hidden="true" />Preparando legenda…</> : suggestionError ? <><span>{suggestionError}</span><button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setSuggestionRefresh(value => value + 1)}><RefreshCw size={13} />Tentar novamente</button></> : suggestion ? <><WandSparkles size={14} /><span>{caption === suggestion.caption ? "Legenda pronta para revisar" : "Sugestões prontas · seu texto foi mantido"}</span>{caption !== suggestion.caption ? <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => editCaption(suggestion.caption)}>Aplicar sugestão</button> : null}</> : null}
                </div>
                {suggestion ? <div className={styles.captionVariants} role="group" aria-label="Variações da legenda">{captionAlternatives(suggestion).map((alternative, index) => <button type="button" key={`${index}-${alternative.label}`} className="chip" aria-pressed={caption === alternative.caption} data-active={caption === alternative.caption} disabled={busy} onClick={() => editCaption(alternative.caption)}>{alternative.label}</button>)}</div> : null}
                <textarea
                  id="pub-caption"
                  className={`input ${styles.captionInput}`}
                  value={caption}
                  onChange={(event) => editCaption(event.target.value)}
                  placeholder={suggestionLoading ? "Preparando a legenda com o contexto deste vídeo…" : "A legenda do vídeo aparece aqui. Você pode editar antes de publicar."}
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
                <div id="pub-improvement" className={styles.improvementArea}>
                  <div className={styles.suggestionStatus} role="status" aria-live="polite">
                    {improving ? <><span className="spinner" aria-hidden="true" />Melhorando seu post…</> : improvementError ? <><span>{improvementError}</span><button type="button" className="btn btn-ghost btn-sm" disabled={busy || !caption.trim() || caption.trim().length > CAPTION_LIMIT} onClick={improveCaption}><RefreshCw size={13} />Tentar melhoria novamente</button></> : improvement ? <><WandSparkles size={14} aria-hidden="true" /><span>Melhoria pronta para comparar</span></> : null}
                  </div>
                  {improvement ? <section className={styles.improvement} aria-labelledby="pub-improvement-title">
                    <h3 id="pub-improvement-title">Sugestão de melhoria</h3>
                    <div className={styles.captionVariants} role="group" aria-label="Variações da melhoria">
                      {captionAlternatives(improvement.suggestion).map((alternative, index) => <button type="button" key={`${index}-${alternative.label}`} className="chip" aria-pressed={improvement.selectedCaption === alternative.caption} data-active={improvement.selectedCaption === alternative.caption} disabled={busy} onClick={() => setImprovement(current => current ? { ...current, selectedCaption: alternative.caption } : null)}>{alternative.label}</button>)}
                    </div>
                    <p className={styles.improvedCaption}>{improvement.selectedCaption}</p>
                    <details className={styles.improvementComparison}>
                      <summary>Comparar com o texto enviado</summary>
                      <p>{improvement.originalCaption}</p>
                    </details>
                    {improvement.sent.captionRevision !== suggestionState.current.captionRevision ? <p className={styles.help}>Você editou a legenda durante a melhoria. Compare também com seu texto atual acima.</p> : null}
                    <div className={styles.improvementActions}>
                      <button type="button" className="btn btn-accent btn-sm" onClick={applyImprovement} disabled={busy || !improvement.selectedCaption.trim() || improvement.selectedCaption.length > CAPTION_LIMIT}>Aplicar melhoria</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImprovement(null)} disabled={busy}>Descartar</button>
                    </div>
                  </section> : null}
                  {canUndoPublicationImprovement(improvementUndo, caption, suggestionState.current.captionRevision) ? <button type="button" className={`btn btn-ghost btn-sm ${styles.undoImprovement}`} disabled={busy} onClick={undoImprovement}><Undo2 size={13} aria-hidden="true" />Desfazer melhoria</button> : null}
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
              <details className={styles.assistant}>
                <summary><WandSparkles size={15} />Contexto e objetivo</summary>
                <div className={styles.assistantBody}>
                  <div className="field"><label htmlFor="pub-goal">Objetivo da publicação</label><select id="pub-goal" className="input" value={goal} disabled={busy} onChange={(event) => { if (event.target.value !== goal) changeCaptionContext(); setGoal(event.target.value as CaptionGoal); }}>{Object.entries(CAPTION_GOALS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></div>
                  {contextSuggestion ? <>
                    <p className={styles.help}>{SUGGESTION_SOURCES[contextSuggestion.source.kind]}: {contextSuggestion.source.title}</p>
                    {contextSuggestion.keywords.length ? <div className={styles.keywords} aria-label="Palavras-chave da legenda">{contextSuggestion.keywords.map(keyword => <span key={keyword}>{keyword}</span>)}</div> : null}
                    {contextSuggestion.source.url && /^https:\/\//.test(contextSuggestion.source.url) ? <a className={styles.sourceLink} href={contextSuggestion.source.url} target="_blank" rel="noreferrer"><ExternalLink size={12} />Ver referência</a> : null}
                    {contextSuggestion.notice ? <p className={styles.help}>{contextSuggestion.notice}</p> : null}
                  </> : null}
                </div>
              </details>
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
                pickedAccount.status !== "connected" ||
                (platform === "tiktok" && !tiktokReady) ||
                review.length > CAPTION_LIMIT ||
                !caption.trim()
              }
              onClick={schedule}
            >
              {busy ? <span className="spinner" /> : <Send size={15} />}
              {timing === "later"
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
            <p className={styles.help}>A autorização acontece no Instagram. Você permite acesso ao perfil profissional e a publicação de Reels. Nenhuma senha ou token precisa ser colado aqui.</p>
            {!instagramOAuth ? <p className={styles.error}>A conexão oficial ainda depende da configuração do aplicativo na Meta. Os rascunhos continuam disponíveis.</p> : null}
            {igError ? <div className="auth-error" role="alert">{igError}</div> : null}
            <button type="button" className="btn btn-accent" disabled={busy || !instagramOAuth} onClick={connectInstagram}>
              {busy ? <span className="spinner" /> : "Continuar no Instagram"}
            </button>
            <p className={styles.help}>Contas pessoais precisam ser convertidas em Criador ou Empresa. Durante o desenvolvimento do aplicativo, a Meta limita o acesso às contas autorizadas para testes.</p>
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
  unavailable = false,
}: {
  icon: ReactNode;
  name: string;
  account?: MiniAccount;
  hint: string;
  onConnect: () => void;
  onDisconnect: () => void;
  busy: boolean;
  unavailable?: boolean;
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
          disabled={busy || unavailable}
        >
          {unavailable ? "Em configuração" : "Conectar"}
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
