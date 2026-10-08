import "server-only";

import {
  claimScheduledPost,
  getPostOwnerAccount,
  getVideoById,
  listDuePosts,
  listPendingPosts,
  updatePost,
  type Post,
} from "./db";
import {
  instagramCreateContainer,
  instagramFinishContainer,
  tiktokPublish,
  tiktokPostStatus,
} from "./social";

// The server loop, page polling and authenticated cron share one queue.
// A database claim prevents two workers from starting the same upload.
let running = false;

export async function publisherTick(): Promise<void> {
  if (running) return;
  running = true;
  const deadline = Date.now() + 25_000;
  try {
    const pending = await listPendingPosts();
    for (const post of pending.slice(0, 20)) {
      if (Date.now() > deadline) return;
      await refreshPost(post).catch(async () => {
        await updatePost(post.id, {
          error:
            "A consulta à rede está indisponível. Tentaremos confirmar novamente.",
        });
      });
    }
    const due = await listDuePosts(Date.now());
    for (const post of due.slice(0, 10)) {
      if (Date.now() > deadline) return;
      await startPost(post).catch(() => undefined);
    }
  } finally {
    running = false;
  }
}

async function startPost(post: Post): Promise<void> {
  if (!(await claimScheduledPost(post))) return;
  try {
    const account = await getPostOwnerAccount(post);
    if (!account) throw new Error("Conecte a conta dessa rede em Publicar.");
    const video = await getVideoById(post.videoId);
    if (video?.status !== "completed" || !video.resultUrl)
      throw new Error("O vídeo da publicação não está pronto.");
    const demo =
      post.mode === "demo" || (!post.mode && account.status === "demo");
    if (demo) {
      await updatePost(post.id, {
        mode: "demo",
        status: "posted",
        postedAt: Date.now(),
        postedUrl: undefined,
        error: undefined,
      });
      return;
    }
    if (account.status !== "connected")
      throw new Error(
        "A conta real foi desconectada. Reconecte antes de publicar.",
      );
    if (account.expiresAt && account.expiresAt <= Date.now())
      throw new Error("A autorização expirou. Reconecte a conta.");
    const input = { videoUrl: video.resultUrl, caption: post.caption };
    const providerId =
      post.platform === "tiktok"
        ? await tiktokPublish(account, input)
        : await instagramCreateContainer(account, input);
    // An accepted upload is not a publication; a later tick confirms it.
    await updatePost(post.id, {
      status: "posting",
      mode: "live",
      providerId,
      error: undefined,
    });
  } catch (caught) {
    await updatePost(post.id, {
      status: "failed",
      error:
        caught instanceof Error ? caught.message : "Falha ao enviar o vídeo.",
    });
  }
}

async function refreshPost(post: Post): Promise<void> {
  if (!post.providerId || post.mode === "demo") return;
  const account = await getPostOwnerAccount(post);
  if (!account || account.status !== "connected") return;
  // Transient status errors remain pending; retrying does not duplicate uploads.
  const result =
    post.platform === "tiktok"
      ? await tiktokPostStatus(account, post.providerId)
      : await instagramFinishContainer(account, post.providerId);
  if (result.status === "pending") return;
  await updatePost(post.id, {
    status: result.status === "posted" ? "posted" : "failed",
    postedAt: result.status === "posted" ? Date.now() : undefined,
    postedUrl: result.postedUrl,
    error: result.error,
  });
}
