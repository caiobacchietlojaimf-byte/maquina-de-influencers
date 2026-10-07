import "server-only";

import {
  getPostOwnerAccount,
  getVideoById,
  listDuePosts,
  updatePost,
  type Post,
} from "./db";
import { instagramPublish, tiktokPublish } from "./social";

/* Agendador de publicações: processa a fila de posts vencidos. Roda em dois
   gatilhos — o loop do instrumentation (a cada 60s) e o polling da página
   Publicar — então um post agendado sai mesmo sem ninguém com a página aberta. */

/** Simulação (conta demo): o post "publica" depois desse atraso. */
const DEMO_POSTING_DELAY_MS = 8000;

let running = false;

export async function publisherTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const due = await listDuePosts(Date.now());
    for (const post of due) {
      await processPost(post).catch(() => undefined);
    }
  } finally {
    running = false;
  }
}

async function processPost(post: Post): Promise<void> {
  const account = await getPostOwnerAccount(post);
  if (!account) {
    await updatePost(post.id, {
      status: "failed",
      error: "Nenhuma conta conectada para essa rede. Conecte em Publicar.",
    });
    return;
  }
  const video = await getVideoById(post.videoId);
  if (!video?.resultUrl) {
    await updatePost(post.id, { status: "failed", error: "O vídeo da publicação não está pronto" });
    return;
  }

  await updatePost(post.id, { status: "posting" });

  if (account.status === "demo") {
    // Modo demonstração: simula o tempo de upload e marca como publicado.
    await new Promise((resolve) => setTimeout(resolve, DEMO_POSTING_DELAY_MS));
    const fakeId = Math.random().toString(36).slice(2, 10);
    await updatePost(post.id, {
      status: "posted",
      postedAt: Date.now(),
      postedUrl:
        post.platform === "tiktok"
          ? `https://www.tiktok.com/@${account.username}/video/demo-${fakeId}`
          : `https://www.instagram.com/reel/demo-${fakeId}/`,
    });
    return;
  }

  try {
    if (post.platform === "tiktok") {
      const publishId = await tiktokPublish(account, {
        videoUrl: video.resultUrl,
        caption: post.caption,
      });
      await updatePost(post.id, {
        status: "posted",
        postedAt: Date.now(),
        postedUrl: `https://www.tiktok.com/@${account.username}`,
        error: undefined,
      });
      void publishId;
    } else {
      const mediaId = await instagramPublish(account, {
        videoUrl: video.resultUrl,
        caption: post.caption,
      });
      await updatePost(post.id, {
        status: "posted",
        postedAt: Date.now(),
        postedUrl: `https://www.instagram.com/${account.username}/`,
        error: undefined,
      });
      void mediaId;
    }
  } catch (caught) {
    await updatePost(post.id, {
      status: "failed",
      error: caught instanceof Error ? caught.message : String(caught),
    });
  }
}
