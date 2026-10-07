import "server-only";

import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Camada de dados com dois drivers e a MESMA API assíncrona:
   - Supabase (Postgres) quando SUPABASE_URL + SUPABASE_KEY + MI_DB_SECRET
     existem — persistência real, obrigatória em serverless (Vercel).
   - Arquivo JSON local (data/db.json) como fallback para rodar offline.
   As tabelas mi_* guardam a entidade inteira em `data` (jsonb) com colunas
   indexadas duplicadas; RLS só libera com o cabeçalho x-mi-secret. */

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
  imageUrl?: string;
  gallery?: string[];
  error?: string;
  referenceUrl?: string;
  createdAt: number;
};

export type VideoKind = "motion" | "viral" | "custom";

export type Video = {
  id: string;
  userId: string;
  influencerId?: string;
  kind: VideoKind;
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

export type Viral = {
  id: string;
  source: "tiktok" | "instagram" | "url";
  videoId?: string;
  pageUrl: string;
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
  status: "connected" | "demo";
  username: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
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

/* ================= driver remoto (Supabase) ================= */

let supabase: SupabaseClient | null = null;

function remote(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_KEY?.trim();
  if (!url || !key) return null;
  if (!supabase) {
    // Com service_role a RLS é atravessada direto; com chave anon as policies
    // exigem o cabeçalho x-mi-secret (MI_DB_SECRET) para liberar.
    const secret = process.env.MI_DB_SECRET?.trim();
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(secret ? { global: { headers: { "x-mi-secret": secret } } } : {}),
    });
  }
  return supabase;
}

function fail(operation: string, error: { message: string } | null): never {
  throw new Error(`Banco (${operation}): ${error?.message ?? "erro desconhecido"}`);
}

type Row = { data: unknown };

function rowData<T>(row: Row): T {
  return row.data as T;
}

/* ================= driver local (JSON) ================= */

type Schema = {
  users: User[];
  influencers: Influencer[];
  videos: Video[];
  virals: Viral[];
  socialAccounts: SocialAccount[];
  posts: Post[];
};

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

/* ================= usuários ================= */

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb
      .from("mi_users")
      .select("data")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (error) fail("buscar usuário", error);
    return data ? rowData<User>(data) : undefined;
  }
  return load().users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export async function findUserById(id: string): Promise<User | undefined> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb.from("mi_users").select("data").eq("id", id).maybeSingle();
    if (error) fail("buscar usuário", error);
    return data ? rowData<User>(data) : undefined;
  }
  return load().users.find((u) => u.id === id);
}

export async function createUser(input: Omit<User, "id" | "createdAt">): Promise<User> {
  const user: User = {
    ...input,
    email: input.email.toLowerCase(),
    id: randomUUID(),
    createdAt: Date.now(),
  };
  const sb = remote();
  if (sb) {
    const { error } = await sb
      .from("mi_users")
      .insert({ id: user.id, email: user.email, created_at: user.createdAt, data: user });
    if (error) fail("criar usuário", error);
    return user;
  }
  return mutate((db) => {
    db.users.push(user);
    return user;
  });
}

export async function adjustCredits(userId: string, delta: number): Promise<number> {
  const sb = remote();
  if (sb) {
    const user = await findUserById(userId);
    if (!user) throw new Error("Usuário não encontrado");
    const credits = Math.max(0, user.credits + delta);
    const { error } = await sb
      .from("mi_users")
      .update({ data: { ...user, credits } })
      .eq("id", userId);
    if (error) fail("ajustar créditos", error);
    return credits;
  }
  return mutate((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new Error("Usuário não encontrado");
    user.credits = Math.max(0, user.credits + delta);
    return user.credits;
  });
}

/* ================= helpers genéricos (tabelas por usuário) ================= */

async function listByUser<T>(table: string, userId: string): Promise<T[]> {
  const sb = remote()!;
  const { data, error } = await sb
    .from(table)
    .select("data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) fail(`listar ${table}`, error);
  return (data ?? []).map((row) => rowData<T>(row));
}

async function getOwned<T extends { userId: string }>(
  table: string,
  userId: string,
  id: string,
): Promise<T | undefined> {
  const sb = remote()!;
  const { data, error } = await sb.from(table).select("data").eq("id", id).maybeSingle();
  if (error) fail(`buscar ${table}`, error);
  const entity = data ? rowData<T>(data) : undefined;
  return entity && entity.userId === userId ? entity : undefined;
}

async function patchEntity<T extends { id: string }>(
  table: string,
  id: string,
  patch: Partial<T>,
): Promise<T | undefined> {
  const sb = remote()!;
  const { data, error } = await sb.from(table).select("data").eq("id", id).maybeSingle();
  if (error) fail(`buscar ${table}`, error);
  if (!data) return undefined;
  const merged = { ...rowData<T>(data), ...patch };
  const { error: updateError } = await sb.from(table).update({ data: merged }).eq("id", id);
  if (updateError) fail(`atualizar ${table}`, updateError);
  return merged;
}

async function deleteOwned(table: string, userId: string, id: string): Promise<boolean> {
  const sb = remote()!;
  const { data, error } = await sb
    .from(table)
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) fail(`excluir ${table}`, error);
  return (data?.length ?? 0) > 0;
}

/* ================= influencers ================= */

export async function listInfluencers(userId: string): Promise<Influencer[]> {
  if (remote()) return listByUser<Influencer>("mi_influencers", userId);
  return load()
    .influencers.filter((i) => i.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getInfluencer(userId: string, id: string): Promise<Influencer | undefined> {
  if (remote()) return getOwned<Influencer>("mi_influencers", userId, id);
  return load().influencers.find((i) => i.id === id && i.userId === userId);
}

export async function createInfluencer(
  input: Omit<Influencer, "id" | "createdAt">,
): Promise<Influencer> {
  const influencer: Influencer = { ...input, id: randomUUID(), createdAt: Date.now() };
  const sb = remote();
  if (sb) {
    const { error } = await sb.from("mi_influencers").insert({
      id: influencer.id,
      user_id: influencer.userId,
      created_at: influencer.createdAt,
      data: influencer,
    });
    if (error) fail("criar influencer", error);
    return influencer;
  }
  return mutate((db) => {
    db.influencers.push(influencer);
    return influencer;
  });
}

export async function updateInfluencer(
  id: string,
  patch: Partial<Influencer>,
): Promise<Influencer | undefined> {
  if (remote()) return patchEntity<Influencer>("mi_influencers", id, patch);
  return mutate((db) => {
    const influencer = db.influencers.find((i) => i.id === id);
    if (!influencer) return undefined;
    Object.assign(influencer, patch);
    return influencer;
  });
}

export async function deleteInfluencer(userId: string, id: string): Promise<boolean> {
  if (remote()) return deleteOwned("mi_influencers", userId, id);
  return mutate((db) => {
    const before = db.influencers.length;
    db.influencers = db.influencers.filter((i) => !(i.id === id && i.userId === userId));
    return db.influencers.length < before;
  });
}

/* ================= vídeos ================= */

export async function listVideos(userId: string): Promise<Video[]> {
  if (remote()) return listByUser<Video>("mi_videos", userId);
  return load()
    .videos.filter((v) => v.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getVideo(userId: string, id: string): Promise<Video | undefined> {
  if (remote()) return getOwned<Video>("mi_videos", userId, id);
  return load().videos.find((v) => v.id === id && v.userId === userId);
}

export async function getVideoById(id: string): Promise<Video | undefined> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb.from("mi_videos").select("data").eq("id", id).maybeSingle();
    if (error) fail("buscar vídeo", error);
    return data ? rowData<Video>(data) : undefined;
  }
  return load().videos.find((v) => v.id === id);
}

export async function createVideo(input: Omit<Video, "id" | "createdAt">): Promise<Video> {
  const video: Video = { ...input, id: randomUUID(), createdAt: Date.now() };
  const sb = remote();
  if (sb) {
    const { error } = await sb.from("mi_videos").insert({
      id: video.id,
      user_id: video.userId,
      created_at: video.createdAt,
      data: video,
    });
    if (error) fail("criar vídeo", error);
    return video;
  }
  return mutate((db) => {
    db.videos.push(video);
    return video;
  });
}

export async function updateVideo(id: string, patch: Partial<Video>): Promise<Video | undefined> {
  if (remote()) return patchEntity<Video>("mi_videos", id, patch);
  return mutate((db) => {
    const video = db.videos.find((v) => v.id === id);
    if (!video) return undefined;
    Object.assign(video, patch);
    return video;
  });
}

export async function deleteVideo(userId: string, id: string): Promise<boolean> {
  if (remote()) return deleteOwned("mi_videos", userId, id);
  return mutate((db) => {
    const before = db.videos.length;
    db.videos = db.videos.filter((v) => !(v.id === id && v.userId === userId));
    return db.videos.length < before;
  });
}

/* ================= virais minerados ================= */

export async function listVirals(region?: string): Promise<Viral[]> {
  const sb = remote();
  if (sb) {
    let query = sb.from("mi_virals").select("data").order("views", { ascending: false }).limit(60);
    if (region) query = query.or(`region.eq.${region},source.eq.url`);
    const { data, error } = await query;
    if (error) fail("listar virais", error);
    return (data ?? []).map((row) => rowData<Viral>(row));
  }
  return load()
    .virals.filter((v) => !region || v.region === region || v.source === "url")
    .sort((a, b) => b.views - a.views);
}

export async function getViral(id: string): Promise<Viral | undefined> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb.from("mi_virals").select("data").eq("id", id).maybeSingle();
    if (error) fail("buscar viral", error);
    return data ? rowData<Viral>(data) : undefined;
  }
  return load().virals.find((v) => v.id === id);
}

export async function lastMinedAt(region: string): Promise<number> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb
      .from("mi_virals")
      .select("mined_at")
      .eq("region", region)
      .eq("source", "tiktok")
      .order("mined_at", { ascending: false })
      .limit(1);
    if (error) fail("checar mineração", error);
    return (data?.[0] as { mined_at?: number } | undefined)?.mined_at ?? 0;
  }
  const mined = load().virals.filter((v) => v.region === region && v.source === "tiktok");
  return mined.length ? Math.max(...mined.map((v) => v.minedAt)) : 0;
}

function viralDedupeKey(item: Omit<Viral, "id">): string {
  return item.videoId ? `tt:${item.videoId}` : `url:${item.pageUrl}`;
}

export async function upsertVirals(items: Omit<Viral, "id">[]): Promise<number> {
  const sb = remote();
  if (sb) {
    if (!items.length) return 0;
    const keys = items.map(viralDedupeKey);
    const { data: existing, error: selectError } = await sb
      .from("mi_virals")
      .select("dedupe_key,id")
      .in("dedupe_key", keys);
    if (selectError) fail("dedupe virais", selectError);
    const known = new Map((existing ?? []).map((row) => [row.dedupe_key as string, row.id as string]));
    const rows = items.map((item) => {
      const key = viralDedupeKey(item);
      const id = known.get(key) ?? randomUUID();
      return {
        id,
        dedupe_key: key,
        region: item.region,
        source: item.source,
        mined_at: item.minedAt,
        views: item.views,
        data: { ...item, id },
      };
    });
    const { error } = await sb.from("mi_virals").upsert(rows, { onConflict: "dedupe_key" });
    if (error) fail("gravar virais", error);
    return rows.length - known.size;
  }
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
    if (db.virals.length > 400) {
      db.virals.sort((a, b) => b.minedAt - a.minedAt);
      db.virals = db.virals.slice(0, 400);
    }
    return added;
  });
}

/* ================= contas sociais ================= */

export async function listSocialAccounts(userId: string): Promise<SocialAccount[]> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb.from("mi_social_accounts").select("data").eq("user_id", userId);
    if (error) fail("listar contas", error);
    return (data ?? []).map((row) => rowData<SocialAccount>(row));
  }
  return load().socialAccounts.filter((a) => a.userId === userId);
}

export async function getSocialAccount(
  userId: string,
  platform: SocialPlatform,
): Promise<SocialAccount | undefined> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb
      .from("mi_social_accounts")
      .select("data")
      .eq("user_id", userId)
      .eq("platform", platform)
      .maybeSingle();
    if (error) fail("buscar conta", error);
    return data ? rowData<SocialAccount>(data) : undefined;
  }
  return load().socialAccounts.find((a) => a.userId === userId && a.platform === platform);
}

export async function upsertSocialAccount(
  input: Omit<SocialAccount, "id" | "connectedAt">,
): Promise<SocialAccount> {
  const sb = remote();
  if (sb) {
    const existing = await getSocialAccount(input.userId, input.platform);
    const account: SocialAccount = {
      ...existing,
      ...input,
      id: existing?.id ?? randomUUID(),
      connectedAt: Date.now(),
    };
    const { error } = await sb.from("mi_social_accounts").upsert(
      { id: account.id, user_id: account.userId, platform: account.platform, data: account },
      { onConflict: "user_id,platform" },
    );
    if (error) fail("conectar conta", error);
    return account;
  }
  return mutate((db) => {
    const existing = db.socialAccounts.find(
      (a) => a.userId === input.userId && a.platform === input.platform,
    );
    if (existing) {
      Object.assign(existing, input, { connectedAt: Date.now() });
      return existing;
    }
    const account: SocialAccount = { ...input, id: randomUUID(), connectedAt: Date.now() };
    db.socialAccounts.push(account);
    return account;
  });
}

export async function deleteSocialAccount(
  userId: string,
  platform: SocialPlatform,
): Promise<boolean> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb
      .from("mi_social_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("platform", platform)
      .select("id");
    if (error) fail("desconectar conta", error);
    return (data?.length ?? 0) > 0;
  }
  return mutate((db) => {
    const before = db.socialAccounts.length;
    db.socialAccounts = db.socialAccounts.filter(
      (a) => !(a.userId === userId && a.platform === platform),
    );
    return db.socialAccounts.length < before;
  });
}

/* ================= publicações ================= */

export async function listPosts(userId: string): Promise<Post[]> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb
      .from("mi_posts")
      .select("data")
      .eq("user_id", userId)
      .order("scheduled_at", { ascending: false });
    if (error) fail("listar publicações", error);
    return (data ?? []).map((row) => rowData<Post>(row));
  }
  return load()
    .posts.filter((p) => p.userId === userId)
    .sort((a, b) => b.scheduledAt - a.scheduledAt);
}

export async function createPost(input: Omit<Post, "id" | "createdAt">): Promise<Post> {
  const post: Post = { ...input, id: randomUUID(), createdAt: Date.now() };
  const sb = remote();
  if (sb) {
    const { error } = await sb.from("mi_posts").insert({
      id: post.id,
      user_id: post.userId,
      status: post.status,
      scheduled_at: post.scheduledAt,
      created_at: post.createdAt,
      data: post,
    });
    if (error) fail("agendar publicação", error);
    return post;
  }
  return mutate((db) => {
    db.posts.push(post);
    return post;
  });
}

export async function updatePost(id: string, patch: Partial<Post>): Promise<Post | undefined> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb.from("mi_posts").select("data").eq("id", id).maybeSingle();
    if (error) fail("buscar publicação", error);
    if (!data) return undefined;
    const merged = { ...rowData<Post>(data), ...patch };
    const { error: updateError } = await sb
      .from("mi_posts")
      .update({ status: merged.status, scheduled_at: merged.scheduledAt, data: merged })
      .eq("id", id);
    if (updateError) fail("atualizar publicação", updateError);
    return merged;
  }
  return mutate((db) => {
    const post = db.posts.find((p) => p.id === id);
    if (!post) return undefined;
    Object.assign(post, patch);
    return post;
  });
}

export async function deletePost(userId: string, id: string): Promise<boolean> {
  if (remote()) return deleteOwned("mi_posts", userId, id);
  return mutate((db) => {
    const before = db.posts.length;
    db.posts = db.posts.filter((p) => !(p.id === id && p.userId === userId));
    return db.posts.length < before;
  });
}

export async function listDuePosts(now: number): Promise<Post[]> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb
      .from("mi_posts")
      .select("data")
      .eq("status", "scheduled")
      .lte("scheduled_at", now);
    if (error) fail("buscar fila", error);
    return (data ?? []).map((row) => rowData<Post>(row));
  }
  return load().posts.filter((p) => p.status === "scheduled" && p.scheduledAt <= now);
}

export async function getPostOwnerAccount(post: Post): Promise<SocialAccount | undefined> {
  return getSocialAccount(post.userId, post.platform);
}

/* ================= perfis acompanhados ================= */

export type Follow = {
  id: string;
  userId: string;
  handle: string;
  platform: "instagram" | "tiktok";
  followedAt: number;
};

export async function listFollows(userId: string): Promise<Follow[]> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb.from("mi_follows").select("data").eq("user_id", userId);
    if (error) fail("listar acompanhados", error);
    return (data ?? []).map((row) => rowData<Follow>(row));
  }
  const schema = load() as Schema & { follows?: Follow[] };
  return (schema.follows ?? []).filter((f) => f.userId === userId);
}

export async function followProfile(
  userId: string,
  handle: string,
  platform: Follow["platform"],
): Promise<Follow> {
  const follow: Follow = { id: randomUUID(), userId, handle, platform, followedAt: Date.now() };
  const sb = remote();
  if (sb) {
    const { error } = await sb
      .from("mi_follows")
      .upsert(
        { id: follow.id, user_id: userId, handle, data: follow },
        { onConflict: "user_id,handle", ignoreDuplicates: true },
      );
    if (error) fail("acompanhar perfil", error);
    return follow;
  }
  return mutate((db) => {
    const schema = db as Schema & { follows?: Follow[] };
    schema.follows ??= [];
    const existing = schema.follows.find((f) => f.userId === userId && f.handle === handle);
    if (existing) return existing;
    schema.follows.push(follow);
    return follow;
  });
}

export async function unfollowProfile(userId: string, handle: string): Promise<void> {
  const sb = remote();
  if (sb) {
    const { error } = await sb.from("mi_follows").delete().eq("user_id", userId).eq("handle", handle);
    if (error) fail("deixar de acompanhar", error);
    return;
  }
  mutate((db) => {
    const schema = db as Schema & { follows?: Follow[] };
    schema.follows = (schema.follows ?? []).filter(
      (f) => !(f.userId === userId && f.handle === handle),
    );
    return undefined;
  });
}
