import "server-only";

import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

/* Banco em arquivo JSON (data/db.json): zero dependências, bom para rodar
   localmente e em um VPS pequeno. Toda escrita é atômica (tmp + rename). */

export type User = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  credits: number;
  createdAt: number;
};

export type InfluencerStatus = "queued" | "processing" | "completed" | "failed";

export type Influencer = {
  id: string;
  userId: string;
  name: string;
  tier: string;
  selection: Record<string, string[]>;
  brief: string;
  seed: number;
  status: InfluencerStatus;
  requestId?: string;
  /** Retrato principal (primeira imagem retornada). */
  imageUrl?: string;
  /** Demais imagens do lote (ângulos/variações). */
  gallery?: string[];
  error?: string;
  /** Foto enviada pelo usuário como referência de identidade (opcional). */
  referenceUrl?: string;
  createdAt: number;
};

export type VideoKind = "motion" | "viral" | "custom";

export type Video = {
  id: string;
  userId: string;
  influencerId?: string;
  kind: VideoKind;
  /** Preset de movimento (Genjutsu) ou efeito viral usado. */
  presetId?: string;
  presetName?: string;
  prompt: string;
  status: InfluencerStatus;
  requestId?: string;
  resultUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  createdAt: number;
};

/** Vídeo viral minerado do TikTok/Instagram (global, compartilhado entre contas). */
export type Viral = {
  id: string;
  source: "tiktok" | "instagram" | "url";
  /** id do vídeo na rede de origem (dedupe). */
  videoId?: string;
  /** Página original do vídeo. */
  pageUrl: string;
  /** URL direta do mp4 (sem marca d'água) — driving video da duplicação. */
  playUrl: string;
  coverUrl: string;
  title: string;
  authorName: string;
  authorHandle: string;
  duration: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  musicTitle?: string;
  region: string;
  minedAt: number;
};

export type SocialPlatform = "tiktok" | "instagram";

export type SocialAccount = {
  id: string;
  userId: string;
  platform: SocialPlatform;
  /** "connected" = credenciais reais; "demo" = simulação local. */
  status: "connected" | "demo";
  username: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  /** Instagram Graph: id da conta profissional. */
  igUserId?: string;
  connectedAt: number;
};

export type PostStatus = "scheduled" | "posting" | "posted" | "failed";

export type Post = {
  id: string;
  userId: string;
  videoId: string;
  platform: SocialPlatform;
  caption: string;
  scheduledAt: number;
  status: PostStatus;
  postedUrl?: string;
  error?: string;
  createdAt: number;
  postedAt?: number;
};

type Schema = {
  users: User[];
  influencers: Influencer[];
  videos: Video[];
  virals: Viral[];
  socialAccounts: SocialAccount[];
  posts: Post[];
};

/* Em serverless (Vercel) o diretório do projeto é somente leitura — o banco
   vai para /tmp (efêmero por instância: bom para demo; para produção de
   verdade, troque por um banco gerenciado). */
const DATA_DIR =
  process.env.DATA_DIR ||
  (process.env.VERCEL ? "/tmp/maquina-data" : path.join(process.cwd(), "data"));
const DB_FILE = path.join(DATA_DIR, "db.json");

let cache: Schema | null = null;

function load(): Schema {
  if (cache) return cache;
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    cache = { users: [], influencers: [], videos: [], virals: [], socialAccounts: [], posts: [] };
    persist(cache);
    return cache;
  }
  try {
    cache = JSON.parse(readFileSync(DB_FILE, "utf8")) as Schema;
  } catch {
    cache = { users: [], influencers: [], videos: [], virals: [], socialAccounts: [], posts: [] };
  }
  cache.users ??= [];
  cache.influencers ??= [];
  cache.videos ??= [];
  cache.virals ??= [];
  cache.socialAccounts ??= [];
  cache.posts ??= [];
  return cache;
}

function persist(db: Schema) {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 1), "utf8");
  renameSync(tmp, DB_FILE);
}

function mutate<T>(fn: (db: Schema) => T): T {
  const db = load();
  const out = fn(db);
  persist(db);
  return out;
}

/* ---------- users ---------- */

export function findUserByEmail(email: string): User | undefined {
  return load().users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function findUserById(id: string): User | undefined {
  return load().users.find((u) => u.id === id);
}

export function createUser(data: Omit<User, "id" | "createdAt">): User {
  return mutate((db) => {
    const user: User = { ...data, id: randomUUID(), createdAt: Date.now() };
    db.users.push(user);
    return user;
  });
}

export function adjustCredits(userId: string, delta: number): number {
  return mutate((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new Error("Usuário não encontrado");
    user.credits = Math.max(0, user.credits + delta);
    return user.credits;
  });
}

/* ---------- influencers ---------- */

export function listInfluencers(userId: string): Influencer[] {
  return load()
    .influencers.filter((i) => i.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getInfluencer(userId: string, id: string): Influencer | undefined {
  return load().influencers.find((i) => i.id === id && i.userId === userId);
}

export function createInfluencer(data: Omit<Influencer, "id" | "createdAt">): Influencer {
  return mutate((db) => {
    const influencer: Influencer = { ...data, id: randomUUID(), createdAt: Date.now() };
    db.influencers.push(influencer);
    return influencer;
  });
}

export function updateInfluencer(id: string, patch: Partial<Influencer>): Influencer | undefined {
  return mutate((db) => {
    const influencer = db.influencers.find((i) => i.id === id);
    if (!influencer) return undefined;
    Object.assign(influencer, patch);
    return influencer;
  });
}

export function deleteInfluencer(userId: string, id: string): boolean {
  return mutate((db) => {
    const before = db.influencers.length;
    db.influencers = db.influencers.filter((i) => !(i.id === id && i.userId === userId));
    return db.influencers.length < before;
  });
}

/* ---------- videos ---------- */

export function listVideos(userId: string): Video[] {
  return load()
    .videos.filter((v) => v.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getVideo(userId: string, id: string): Video | undefined {
  return load().videos.find((v) => v.id === id && v.userId === userId);
}

export function createVideo(data: Omit<Video, "id" | "createdAt">): Video {
  return mutate((db) => {
    const video: Video = { ...data, id: randomUUID(), createdAt: Date.now() };
    db.videos.push(video);
    return video;
  });
}

export function updateVideo(id: string, patch: Partial<Video>): Video | undefined {
  return mutate((db) => {
    const video = db.videos.find((v) => v.id === id);
    if (!video) return undefined;
    Object.assign(video, patch);
    return video;
  });
}

export function deleteVideo(userId: string, id: string): boolean {
  return mutate((db) => {
    const before = db.videos.length;
    db.videos = db.videos.filter((v) => !(v.id === id && v.userId === userId));
    return db.videos.length < before;
  });
}

/* ---------- virais minerados ---------- */

export function listVirals(region?: string): Viral[] {
  return load()
    .virals.filter((v) => !region || v.region === region || v.source === "url")
    .sort((a, b) => b.views - a.views);
}

export function getViral(id: string): Viral | undefined {
  return load().virals.find((v) => v.id === id);
}

/** Momento da última mineração de uma região (cache do feed). */
export function lastMinedAt(region: string): number {
  const mined = load().virals.filter((v) => v.region === region && v.source === "tiktok");
  return mined.length ? Math.max(...mined.map((v) => v.minedAt)) : 0;
}

/** Insere/atualiza virais dedupe por videoId; devolve quantos entraram novos. */
export function upsertVirals(items: Omit<Viral, "id">[]): number {
  return mutate((db) => {
    let added = 0;
    for (const item of items) {
      const existing = item.videoId
        ? db.virals.find((v) => v.videoId === item.videoId)
        : db.virals.find((v) => v.pageUrl === item.pageUrl);
      if (existing) {
        Object.assign(existing, item);
        continue;
      }
      db.virals.push({ ...item, id: randomUUID() });
      added += 1;
    }
    // Mantém o catálogo enxuto: 400 virais mais recentes.
    if (db.virals.length > 400) {
      db.virals.sort((a, b) => b.minedAt - a.minedAt);
      db.virals = db.virals.slice(0, 400);
    }
    return added;
  });
}

/* ---------- contas sociais ---------- */

export function listSocialAccounts(userId: string): SocialAccount[] {
  return load().socialAccounts.filter((a) => a.userId === userId);
}

export function getSocialAccount(userId: string, platform: SocialPlatform): SocialAccount | undefined {
  return load().socialAccounts.find((a) => a.userId === userId && a.platform === platform);
}

export function upsertSocialAccount(
  data: Omit<SocialAccount, "id" | "connectedAt">,
): SocialAccount {
  return mutate((db) => {
    const existing = db.socialAccounts.find(
      (a) => a.userId === data.userId && a.platform === data.platform,
    );
    if (existing) {
      Object.assign(existing, data, { connectedAt: Date.now() });
      return existing;
    }
    const account: SocialAccount = { ...data, id: randomUUID(), connectedAt: Date.now() };
    db.socialAccounts.push(account);
    return account;
  });
}

export function deleteSocialAccount(userId: string, platform: SocialPlatform): boolean {
  return mutate((db) => {
    const before = db.socialAccounts.length;
    db.socialAccounts = db.socialAccounts.filter(
      (a) => !(a.userId === userId && a.platform === platform),
    );
    return db.socialAccounts.length < before;
  });
}

/* ---------- publicações ---------- */

export function listPosts(userId: string): Post[] {
  return load()
    .posts.filter((p) => p.userId === userId)
    .sort((a, b) => b.scheduledAt - a.scheduledAt);
}

export function createPost(data: Omit<Post, "id" | "createdAt">): Post {
  return mutate((db) => {
    const post: Post = { ...data, id: randomUUID(), createdAt: Date.now() };
    db.posts.push(post);
    return post;
  });
}

export function updatePost(id: string, patch: Partial<Post>): Post | undefined {
  return mutate((db) => {
    const post = db.posts.find((p) => p.id === id);
    if (!post) return undefined;
    Object.assign(post, patch);
    return post;
  });
}

export function deletePost(userId: string, id: string): boolean {
  return mutate((db) => {
    const before = db.posts.length;
    db.posts = db.posts.filter((p) => !(p.id === id && p.userId === userId));
    return db.posts.length < before;
  });
}

/** Publicações vencidas de TODOS os usuários (para o agendador processar). */
export function listDuePosts(now: number): Post[] {
  return load().posts.filter((p) => p.status === "scheduled" && p.scheduledAt <= now);
}

export function getPostOwnerAccount(post: Post): SocialAccount | undefined {
  return load().socialAccounts.find(
    (a) => a.userId === post.userId && a.platform === post.platform,
  );
}

export function getVideoById(id: string): Video | undefined {
  return load().videos.find((v) => v.id === id);
}
