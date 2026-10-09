import "server-only";
import { claimPostWork, savePostWork, getPostOwnerAccount, getVideo, listDuePosts, listPendingPosts, type Post } from "./db";
import { freshSocialAccount, instagramCreateContainer, instagramContainerStatus, instagramPublishContainer, tiktokPublish, tiktokPostStatus, tiktokCreatorInfo, validateTikTokOptions, validateTikTokMediaUrl, SocialApiError } from "./social";

const UNCERTAIN = "O envio não foi confirmado. Confira a conta na rede antes de criar outra publicação; este envio não será repetido automaticamente.";
let running = false;
/** Leases/CAS are shared across workers; running only reduces redundant local queries. */
export async function publisherTick() {
  if (running) return;
  running = true;
  const deadline = Date.now() + 25_000;
  try {
    const [pending, due] = await Promise.all([listPendingPosts(), listDuePosts(Date.now())]);
    const queue = [...pending, ...due].sort((a, b) => (a.nextAttemptAt ?? a.scheduledAt) - (b.nextAttemptAt ?? b.scheduledAt));
    for (const candidate of queue.slice(0, 30)) {
      if (Date.now() > deadline) break;
      const claimed = await claimPostWork(candidate, Date.now());
      if (claimed) await processPost(claimed).catch(() => undefined);
    }
  } finally { running = false; }
}
async function processPost(initial: Post): Promise<void> {
  let post = initial;
  try {
    if (post.mode === "demo") {
      await savePostWork(post, { status: "failed", error: "Este registro era uma demonstração. Prepare uma nova publicação com uma conta real." });
      return;
    }
    const stored = await getPostOwnerAccount(post);
    if (!stored || stored.status !== "connected" || !post.accountId || post.accountId !== stored.id || post.accountUserId !== (stored.providerUserId ?? stored.igUserId)) throw new Error("A conta de destino mudou ou foi desconectada. Revise a publicação.");
    const account = await freshSocialAccount(stored);
    if (!post.providerId) {
      // A crash/timeout after the persisted boundary may have reached the provider.
      if (post.submissionStartedAt) {
        await savePostWork(post, { status: "failed", publicationUncertain: true, error: UNCERTAIN });
        return;
      }
      const video = await getVideo(post.userId, post.videoId);
      if (video?.status !== "completed" || video.deletedAt || !video.resultUrl) throw new Error("O vídeo da publicação não está pronto ou foi removido.");
      if (post.videoUrl && video.resultUrl !== post.videoUrl) throw new Error("O arquivo do vídeo mudou. Revise a prévia e prepare uma nova publicação.");
      if (post.platform === "tiktok") {
        validateTikTokMediaUrl(video.resultUrl);
        const creator = await tiktokCreatorInfo(account);
        validateTikTokOptions(post.tiktok, creator, post.videoDuration ?? video.edit?.result?.duration ?? 0);
      }
      const checkpoint = await savePostWork(post, { submissionStartedAt: Date.now(), attempts: (post.attempts ?? 0) + 1 }, false);
      if (!checkpoint) return;
      post = checkpoint;
      const providerId = post.platform === "tiktok"
        ? await tiktokPublish(account, { videoUrl: video.resultUrl, caption: post.caption, options: post.tiktok! })
        : await instagramCreateContainer(account, { videoUrl: video.resultUrl, caption: post.caption });
      await savePostWork(post, { providerId, mode: "live", nextAttemptAt: Date.now() + 60_000, error: undefined });
      return;
    }
    let result = post.platform === "tiktok" ? await tiktokPostStatus(account, post.providerId) : await instagramContainerStatus(account, post.providerId);
    if (result.status === "ready") {
      if (post.publishStartedAt) {
        // The same container is polled after an ambiguous media_publish. Never send twice.
        if (Date.now() - post.publishStartedAt > 15 * 60_000) {
          await savePostWork(post, { status: "failed", publicationUncertain: true, error: UNCERTAIN });
          return;
        }
        result = { status: "pending" };
      } else {
        const checkpoint = await savePostWork(post, { publishStartedAt: Date.now() }, false);
        if (!checkpoint) return;
        post = checkpoint;
        result = await instagramPublishContainer(account, post.providerId!);
      }
    }
    if (result.status === "pending") {
      const stale = Date.now() - (post.submissionStartedAt ?? post.createdAt) > 24 * 60 * 60_000;
      await savePostWork(post, stale ? { status: "failed", publicationUncertain: true, error: UNCERTAIN } : { nextAttemptAt: Date.now() + 60_000, error: post.publishStartedAt ? "Aguardando confirmação da publicação pela rede." : undefined });
      return;
    }
    await savePostWork(post, { status: result.status === "posted" ? "posted" : "failed", postedAt: result.status === "posted" ? Date.now() : undefined, postedUrl: result.postedUrl, ...(result.publishedMediaId ? { publishedMediaId: result.publishedMediaId } : {}), error: result.error, publicationUncertain: false });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Não foi possível consultar a rede.";
    if (post.providerId && (caught instanceof SocialApiError && (caught.retryable || caught.uncertain))) {
      await savePostWork(post, { nextAttemptAt: Date.now() + 120_000, error: "A consulta à rede está indisponível. Tentaremos confirmar novamente." });
    } else if (!post.submissionStartedAt && caught instanceof SocialApiError && caught.retryable && (post.attempts ?? 0) < 3) {
      await savePostWork(post, { status: "scheduled", attempts: (post.attempts ?? 0) + 1, nextAttemptAt: Date.now() + 120_000, error: message });
    } else {
      const uncertain = Boolean(post.providerId) || (caught instanceof SocialApiError ? caught.uncertain : Boolean(post.submissionStartedAt)) || Boolean(post.publishStartedAt);
      await savePostWork(post, { status: "failed", publicationUncertain: uncertain, error: uncertain ? UNCERTAIN : message });
    }
  }
}
