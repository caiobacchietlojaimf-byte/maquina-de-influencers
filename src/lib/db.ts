import "server-only";

import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VideoMetadata } from "./video-reference";
import type { PlanGrant, PlanId } from "./plans";
import type { EditIdentityReferences } from "./character-edit";
import type { PublicationReferenceSnapshot } from "./publication-context";
import type { PublicationSuggestion } from "./publication-assistant-types";

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
  creditRevision?: string;
  planGrants?: Record<string, PlanGrant>;
  creditPurchases?: Record<string, { credits: number; grantedAt: number; revoked?: boolean }>;
  suspendedAt?: number;
  influencerCredits?: Record<string, { cost: number; state: "reserved" | "refunded" }>;
  captionRequests?: number[];
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
  /** Versions share a root but retain their own image, request and credit ledger. */
  rootInfluencerId?: string;
  sourceInfluencerId?: string;
  variantLabel?: string;
  creationMode?: "form" | "prompt" | "edit";
  editKind?: "outfit" | "details";
  prompt?: string;
  provider?: "higgsfield" | "fal";
  model?: string;
  creditCost?: number;
  /** Completed upstream output waiting for our durable storage, never a new generation. */
  pendingImageUrl?: string;
  completionCheckedAt?: number;
  error?: string;
  referenceUrl?: string;
  styleReferenceUrl?: string;
  requestFingerprint?: string;
  submissionStartedAt?: number;
  submissionUncertain?: boolean;
  creditsRefunded?: boolean;
  referenceUploadIncomplete?: boolean;
  deletedAt?: number;
  revision?: string;
  createdAt: number;
};

export type VideoKind = "motion" | "viral" | "custom";

export type CaptionCacheEntry = {
  fingerprint: string; claimId: string; startedAt: number; resultUrl: string;
  state: "pending" | "ready"; suggestion?: PublicationSuggestion;
};
export type PublicationSource = { kind: "profile"; handle: string; id: string } | { kind: "viral" | "preset"; id: string } | { kind: "upload" };

export type Video = {
  creditCost?: number;
  creditPricingVersion?: string;
  id: string;
  userId: string;
  influencerId?: string;
  kind: VideoKind;
  requestFingerprint?: string;
  presetId?: string;
  presetName?: string;
  prompt: string;
  status: InfluencerStatus | "review";
  requestId?: string;
  resultUrl?: string;
  thumbnailUrl?: string;
  captionRevision?: string;
  captionCache?: Record<string, CaptionCacheEntry>;
  error?: string;
  createdAt: number;
  edit?: {
    model: string; sourceUrl: string; imageUrl: string; target: string;
    provider?: "fal" | "higgsfield"; seed?: number;
    identityVersion?: string; identity?: EditIdentityReferences;
    sourceReference?: PublicationSource; sourceSnapshot?: PublicationReferenceSnapshot;
    assembly?: "overlap-v1";
    segments?: Array<{ sourceUrl: string; start: number; source: VideoMetadata; requestId?: string; resultUrl?: string }>;
    source: VideoMetadata;
    resolution: "480p" | "720p" | "1080p" | "auto"; estimatedUsd: number;
    result?: VideoMetadata;
    audioPreserved?: boolean;
  };
  finalizationStartedAt?: number;
  polling?: { checkedAt: number; failures: number; providerStatus?: "queued" | "processing" | "completed" | "failed"; error?: string; nextCheckAt?: number };
  deletedAt?: number;
};

export type Viral = {
  id: string;
  source: "tiktok" | "instagram" | "url";
  videoId?: string;
  pageUrl: string;
  playUrl: string;
  coverUrl: string;
  title: string;
  /** Text actually returned by the provider; may be an excerpt, never a seeded scene label. */
  sourceCaption?: string;
  sourceCaptionOrigin?: "provider-title";
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
  oauthProvider?: "instagram" | "facebook" | "tiktok";
  providerUserId?: string;
  scopes?: string[];
  refreshExpiresAt?: number;
};

export type TikTokPostOptions = {
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  brandOrganic: boolean;
  brandedContent: boolean;
  consentAt: number;
};

export type PostStatus = "draft" | "scheduled" | "posting" | "posted" | "failed";

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
  /** Frozen when scheduled so reconnecting an account cannot publish a demo. */
  mode?: "demo" | "live";
  providerId?: string;
  /** Actual published media ID; providerId remains the upload container ID. */
  publishedMediaId?: string;
  accountId?: string;
  accountUserId?: string;
  requestKey?: string;
  requestFingerprint?: string;
  submissionStartedAt?: number;
  publishStartedAt?: number;
  nextAttemptAt?: number;
  attempts?: number;
  publicationUncertain?: boolean;
  leaseId?: string;
  leaseUntil?: number;
  revision?: string;
  tiktok?: TikTokPostOptions;
  deletedAt?: number;
  videoDuration?: number;
  videoUrl?: string;
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
  if (!Number.isFinite(delta)) throw new Error("Valor de créditos inválido");
  return mutateCredits(userId, user => {
    // Refunded plans may leave debt. A generation refund must repay only its
    // own amount, not silently forgive the rest by clamping the balance.
    user.credits += delta;
    return user.credits;
  });
}

/** Local commerce driver; the remote equivalent locks both order and user in SQL. */
export async function grantPlanCredits(userId: string, orderId: string, planId: PlanId, credits: number, now: number, revoke = false) {
  return mutateCredits(userId, user => {
    const grants = { ...user.planGrants };
    const prior = grants[orderId];
    if (revoke) {
      if (prior && !prior.revoked) { user.credits -= prior.credits; grants[orderId] = { ...prior, revoked: true }; }
    } else if (!prior) {
      const until = Math.max(now, ...Object.values(grants).filter(g => !g.revoked && g.planId === planId).map(g => g.expiresAt));
      grants[orderId] = { planId, credits, startsAt: now, expiresAt: until + 30 * 86400000 };
      user.credits += credits;
    }
    user.planGrants = grants;
  });
}

/** Purchased credits never create or renew a plan entitlement. */
export async function grantPurchasedCredits(userId: string, orderId: string, credits: number, now: number, revoke = false) {
  if (!Number.isSafeInteger(credits) || credits <= 0) throw new Error("Valor de créditos inválido");
  return mutateCredits(userId, user => {
    const purchases = { ...user.creditPurchases };
    const prior = purchases[orderId];
    if (revoke) {
      if (prior && !prior.revoked) {
        user.credits -= prior.credits;
        purchases[orderId] = { ...prior, revoked: true };
      }
    } else if (!prior) {
      purchases[orderId] = { credits, grantedAt: now };
      user.credits += credits;
    }
    user.creditPurchases = purchases;
  });
}

export async function listAdminUsers(): Promise<User[]> {
  const sb = remote();
  if (!sb) return [...load().users].sort((a,b) => b.createdAt - a.createdAt);
  const { data, error } = await sb.from("mi_users").select("data").order("created_at", { ascending: false }).limit(500);
  if (error) fail("listar usuários", error);
  return (data ?? []).map(row => rowData<User>(row));
}

export async function setUserSuspended(userId: string, suspended: boolean) {
  return mutateCredits(userId, user => { user.suspendedAt = suspended ? Date.now() : undefined; });
}

/** Balance and reservation ledger change together, with a revision against ABA races. */
async function mutateCredits<T>(userId: string, change: (user: User) => T): Promise<T> {
  const sb = remote();
  if (!sb) return mutate(db => {
    const user = db.users.find(u => u.id === userId);
    if (!user) throw new Error("Usuário não encontrado");
    const result = change(user);
    user.creditRevision = randomUUID();
    return result;
  });
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await findUserById(userId);
    if (!current) throw new Error("Usuário não encontrado");
    const next = { ...current, influencerCredits: { ...current.influencerCredits } };
    const result = change(next);
    next.creditRevision = randomUUID();
    let update = sb.from("mi_users").update({ data: next }).eq("id", userId).eq("data->>credits", String(current.credits));
    update = current.creditRevision ? update.eq("data->>creditRevision", current.creditRevision) : update.is("data->>creditRevision", null);
    const { data, error } = await update.select("id");
    if (error) fail("ajustar créditos", error);
    if (data?.length) return result;
  }
  throw new Error("O saldo foi atualizado. Tente novamente.");
}

export async function reserveInfluencerCredits(userId: string, id: string, cost: number): Promise<boolean> {
  if (!Number.isFinite(cost) || cost <= 0) throw new Error("Valor de créditos inválido");
  return mutateCredits(userId, user => {
    const prior = user.influencerCredits?.[id];
    if (prior) return prior.cost === cost && prior.state === "reserved";
    if (user.credits < cost) return false;
    user.credits -= cost;
    user.influencerCredits = { ...user.influencerCredits, [id]: { cost, state: "reserved" } };
    return true;
  });
}

export async function refundInfluencerCredits(userId: string, id: string): Promise<void> {
  await mutateCredits(userId, user => {
    const prior = user.influencerCredits?.[id];
    if (!prior || prior.state !== "reserved") return;
    user.credits += prior.cost;
    user.influencerCredits = { ...user.influencerCredits, [id]: { ...prior, state: "refunded" } };
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
  if (remote()) return (await listByUser<Influencer>("mi_influencers", userId)).filter(i => !i.deletedAt);
  return load()
    .influencers.filter((i) => i.userId === userId && !i.deletedAt)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Server-only bounded queue for scheduled finalization, even with no browser open. */
export async function listPendingInfluencers(limit = 8): Promise<Influencer[]> {
  const bounded = Math.min(20, Math.max(1, Math.floor(limit)));
  const sb = remote();
  if (sb) {
    const { data, error } = await sb.from("mi_influencers").select("data")
      .or("data->>status.in.(queued,processing),and(data->>status.eq.failed,data->>requestFingerprint.not.is.null,or(data->>submissionUncertain.is.null,data->>submissionUncertain.eq.false),or(data->>creditsRefunded.is.null,data->>creditsRefunded.eq.false))")
      .is("data->>deletedAt", null)
      .order("data->>completionCheckedAt", { ascending: true, nullsFirst: true }).limit(bounded);
    if (error) fail("buscar influencers em processamento", error);
    return (data ?? []).map(row => rowData<Influencer>(row));
  }
  return load().influencers.filter(item => !item.deletedAt && (["queued", "processing"].includes(item.status) || (item.status === "failed" && item.requestFingerprint && !item.submissionUncertain && !item.creditsRefunded)))
    .sort((a, b) => (a.completionCheckedAt ?? 0) - (b.completionCheckedAt ?? 0)).slice(0, bounded);
}

export async function getInfluencer(userId: string, id: string, includeDeleted = false): Promise<Influencer | undefined> {
  const influencer = remote() ? await getOwned<Influencer>("mi_influencers", userId, id) : load().influencers.find((i) => i.id === id && i.userId === userId);
  return influencer && (includeDeleted || !influencer.deletedAt) ? influencer : undefined;
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

/** The stable, user-scoped request ID prevents duplicate submissions across workers. */
export async function createInfluencerOnce(influencer: Influencer): Promise<boolean> {
  const sb = remote();
  if (sb) {
    const { error } = await sb.from("mi_influencers").insert({ id: influencer.id, user_id: influencer.userId, created_at: influencer.createdAt, data: influencer });
    if (error?.code === "23505") return false;
    if (error) fail("reservar influencer", error);
    return true;
  }
  return mutate(db => {
    if (db.influencers.some(i => i.id === influencer.id)) return false;
    db.influencers.push(influencer);
    return true;
  });
}

/** Submission and abandoned-preparation recovery compete for the same queued state. */
export async function claimInfluencerSubmission(userId: string, id: string): Promise<boolean> {
  return transitionQueuedInfluencer(userId, id, { status: "processing", submissionStartedAt: Date.now() });
}

export async function failAbandonedInfluencerPreparation(userId: string, id: string): Promise<boolean> {
  return transitionQueuedInfluencer(userId, id, { status: "failed", error: "A preparação foi interrompida. Tente novamente." }, Date.now() - 180_000);
}

export async function markUnconfirmedInfluencerSubmission(userId: string, id: string): Promise<boolean> {
  const eligible = (item: Influencer | undefined): item is Influencer => Boolean(item && item.status === "processing" && !item.requestId && item.submissionStartedAt && item.submissionStartedAt < Date.now() - 180_000);
  const patch: Partial<Influencer> = { status: "failed", submissionUncertain: true, error: "A plataforma não confirmou este pedido. Não gere novamente até conferir a solicitação no provedor." };
  const sb = remote();
  if (!sb) return mutate(db => {
    const item = db.influencers.find(i => i.id === id && i.userId === userId);
    if (!eligible(item)) return false;
    Object.assign(item, patch);
    return true;
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const item = await getInfluencer(userId, id);
    if (!eligible(item)) return false;
    let query = sb.from("mi_influencers").update({ data: { ...item, ...patch, revision: randomUUID() } }).eq("id", id).eq("user_id", userId).eq("data->>status", "processing").is("data->>requestId", null);
    query = item.revision ? query.eq("data->>revision", item.revision) : query.is("data->>revision", null);
    const { data, error } = await query.select("id");
    if (error) fail("conferir submissão do influencer", error);
    if (data?.length) return true;
  }
  return false;
}

async function transitionQueuedInfluencer(userId: string, id: string, patch: Partial<Influencer>, createdBefore?: number): Promise<boolean> {
  const eligible = (item: Influencer | undefined): item is Influencer => Boolean(item && !item.deletedAt && item.status === "queued" && !item.submissionStartedAt && (createdBefore === undefined || item.createdAt < createdBefore));
  const sb = remote();
  if (!sb) return mutate(db => {
    const item = db.influencers.find(i => i.id === id && i.userId === userId);
    if (!eligible(item)) return false;
    Object.assign(item, patch);
    return true;
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const item = await getInfluencer(userId, id);
    if (!eligible(item)) return false;
    let query = sb.from("mi_influencers").update({ data: { ...item, ...patch, revision: randomUUID() } }).eq("id", id).eq("user_id", userId).eq("data->>status", "queued").is("data->>submissionStartedAt", null);
    query = item.revision ? query.eq("data->>revision", item.revision) : query.is("data->>revision", null);
    const { data, error } = await query.select("id");
    if (error) fail("reservar submissão do influencer", error);
    if (data?.length) return true;
  }
  return false;
}

export async function updateInfluencer(
  id: string,
  patch: Partial<Influencer>,
  userId?: string,
): Promise<Influencer | undefined> {
  const sb = remote();
  if (sb) {
    // Compare-and-swap keeps polling results and name edits from overwriting each other.
    for (let attempt = 0; attempt < 3; attempt++) {
      let query = sb.from("mi_influencers").select("data").eq("id", id);
      if (userId) query = query.eq("user_id", userId);
      const { data, error } = await query.maybeSingle();
      if (error) fail("buscar influencer", error);
      if (!data) return undefined;
      const current = rowData<Influencer>(data);
      const merged = { ...current, ...patch, revision: randomUUID() };
      let update = sb.from("mi_influencers").update({ data: merged }).eq("id", id);
      update = current.revision ? update.eq("data->>revision", current.revision) : update.is("data->>revision", null);
      if (userId) update = update.eq("user_id", userId);
      const { data: changed, error: updateError } = await update.select("data").maybeSingle();
      if (updateError) fail("atualizar influencer", updateError);
      if (changed) return rowData<Influencer>(changed);
    }
    throw new Error("O influencer foi atualizado. Tente salvar novamente.");
  }
  return mutate((db) => {
    const influencer = db.influencers.find((i) => i.id === id && (!userId || i.userId === userId));
    if (!influencer) return undefined;
    Object.assign(influencer, patch);
    return influencer;
  });
}

/** CAS for poll/terminal transitions: a late worker cannot undo a completed job. */
export async function updatePendingInfluencer(userId: string, id: string, patch: Partial<Influencer>): Promise<Influencer | undefined> {
  const eligible = (item: Influencer | undefined): item is Influencer => Boolean(item && !item.deletedAt && (item.status === "queued" || item.status === "processing"));
  const sb = remote();
  if (!sb) return mutate(db => {
    const current = db.influencers.find(item => item.id === id && item.userId === userId);
    if (!eligible(current)) return undefined;
    Object.assign(current, patch);
    return current;
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await getInfluencer(userId, id);
    if (!eligible(current)) return undefined;
    const merged = { ...current, ...patch, revision: randomUUID() };
    let query = sb.from("mi_influencers").update({ data: merged }).eq("id", id).eq("user_id", userId)
      .eq("data->>status", current.status).is("data->>deletedAt", null);
    query = current.revision ? query.eq("data->>revision", current.revision) : query.is("data->>revision", null);
    const { data, error } = await query.select("data").maybeSingle();
    if (error) fail("finalizar influencer", error);
    if (data) return rowData<Influencer>(data);
  }
  return undefined;
}

export async function deleteInfluencer(userId: string, id: string): Promise<boolean> {
  const influencer = await getInfluencer(userId, id);
  if (!influencer || influencer.deletedAt) return false;
  if (influencer.status === "queued" || influencer.status === "processing" || influencer.submissionUncertain) return false;
  // Preserve lineage and consumed request keys, including legacy roots. An edit
  // already being prepared may keep this archived root as its owned ancestor.
  return Boolean(await updateInfluencer(id, { deletedAt: Date.now() }, userId));
}

/* ================= vídeos ================= */

export async function listVideos(userId: string): Promise<Video[]> {
  if (remote()) return (await listByUser<Video>("mi_videos", userId)).filter(v => !v.deletedAt);
  return load()
    .videos.filter((v) => v.userId === userId && !v.deletedAt)
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

/** A signed quote's UUID is a single-use generation key, also across workers. */
export async function createVideoOnce(video: Video): Promise<boolean> {
  const sb = remote();
  if (sb) {
    const { error } = await sb.from("mi_videos").insert({ id: video.id, user_id: video.userId, created_at: video.createdAt, data: video });
    if (error?.code === "23505") return false;
    if (error) fail("reservar edição", error);
    return true;
  }
  return mutate(db => { if (db.videos.some(v => v.id === video.id)) return false; db.videos.push(video); return true; });
}

export async function reserveVideoCredits(userId: string, cost: number): Promise<boolean> {
  if (!Number.isFinite(cost) || cost <= 0) return false;
  return mutateCredits(userId, user => {
    if (user.credits < cost) return false;
    user.credits -= cost;
    return true;
  });
}

/** Bounds automatic caption spend without touching the user's credit balance. */
export async function reserveCaptionRequest(userId: string, now = Date.now()): Promise<boolean> {
  return mutateCredits(userId, user => {
    if (user.suspendedAt) return false;
    const recent = (user.captionRequests ?? []).filter(time => Number.isFinite(time) && time > now - 86_400_000);
    if (recent.length >= 200 || recent.filter(time => time > now - 3_600_000).length >= 40) return false;
    user.captionRequests = [...recent, now];
    return true;
  });
}

/** The cache lives in the owned video's JSON, so two workers cannot pay twice. */
async function mutateVideoCaptions<T>(userId: string, id: string, change: (video: Video) => T): Promise<T | undefined> {
  const sb = remote();
  const usable = (video: Video | undefined): video is Video => Boolean(video && !video.deletedAt && video.status === "completed" && video.resultUrl);
  if (!sb) return mutate(db => {
    const current = db.videos.find(video => video.id === id && video.userId === userId);
    if (!usable(current)) return;
    const value = change(current);
    current.captionRevision = randomUUID();
    return value;
  });
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await getVideo(userId, id);
    if (!usable(current)) return;
    const next = { ...current, captionCache: { ...current.captionCache } };
    const value = change(next);
    next.captionRevision = randomUUID();
    let query = sb.from("mi_videos").update({ data: next }).eq("id", id).eq("user_id", userId)
      .eq("data->>status", "completed").eq("data->>resultUrl", current.resultUrl!).is("data->>deletedAt", null);
    query = current.captionRevision ? query.eq("data->>captionRevision", current.captionRevision) : query.is("data->>captionRevision", null);
    const { data, error } = await query.select("id");
    if (error) fail("preparar legenda", error);
    if (data?.length) return value;
  }
  throw new Error("A preparação foi atualizada. Tente novamente.");
}

export async function claimVideoCaption(userId: string, id: string, slot: string, fingerprint: string, expectedResultUrl?: string): Promise<{ claimed: boolean; entry: CaptionCacheEntry } | undefined> {
  if (!/^(instagram|tiktok):(comments|shares|saves|follows)$/.test(slot) || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("Preparação inválida.");
  return mutateVideoCaptions(userId, id, video => {
    if (expectedResultUrl && video.resultUrl !== expectedResultUrl) return;
    const prior = video.captionCache?.[slot];
    // Never evict work for the same media. A genuinely replaced media URL gets
    // a new claim; its previous finalizer cannot pass the claimId comparison.
    if (prior && prior.resultUrl === video.resultUrl && (prior.fingerprint === fingerprint || prior.state === "pending")) return { claimed: false, entry: prior };
    const entry: CaptionCacheEntry = { fingerprint, claimId: randomUUID(), state: "pending", startedAt: Date.now(), resultUrl: video.resultUrl! };
    video.captionCache = { ...video.captionCache, [slot]: entry };
    return { claimed: true, entry };
  });
}

export async function finishVideoCaption(userId: string, id: string, slot: string, claimId: string, suggestion: PublicationSuggestion): Promise<boolean> {
  return Boolean(await mutateVideoCaptions(userId, id, video => {
    const entry = video.captionCache?.[slot];
    if (!entry || entry.claimId !== claimId || entry.state !== "pending" || suggestion.videoId !== id || entry.resultUrl !== video.resultUrl) return false;
    video.captionCache = { ...video.captionCache, [slot]: { ...entry, state: "ready", suggestion } };
    return true;
  }));
}

export async function claimVideoFinalization(video: Video): Promise<boolean> {
  if (video.finalizationStartedAt && Date.now() - video.finalizationStartedAt < 300000) return false;
  const patch = { ...video, finalizationStartedAt: Date.now() };
  const sb = remote();
  if (sb) {
    let query = sb.from("mi_videos").update({ data: patch }).eq("id", video.id).eq("data->>status", video.status);
    query = video.finalizationStartedAt ? query.eq("data->>finalizationStartedAt", String(video.finalizationStartedAt)) : query.is("data->>finalizationStartedAt", null);
    const { data, error } = await query.select("id");
    if (error) fail("reservar finalização", error);
    return Boolean(data?.length);
  }
  return mutate(db => { const current = db.videos.find(v => v.id === video.id); if (!current || current.status !== video.status || current.finalizationStartedAt !== video.finalizationStartedAt) return false; Object.assign(current, patch); return true; });
}

/** A delayed poll cannot overwrite a newer finalization or completed media URL. */
export async function updateVideoFromPoll(snapshot: Video, patch: Partial<Video>): Promise<boolean> {
  const matches = (current: Video | undefined) => current && !current.deletedAt && current.status === snapshot.status && current.finalizationStartedAt === snapshot.finalizationStartedAt;
  const sb = remote();
  if (!sb) return mutate(db => {
    const current = db.videos.find(v => v.id === snapshot.id && v.userId === snapshot.userId);
    if (!matches(current)) return false;
    Object.assign(current!, patch);
    return true;
  });
  const current = await getVideo(snapshot.userId, snapshot.id);
  if (!matches(current)) return false;
  let query = sb.from("mi_videos").update({ data: { ...current!, ...patch } }).eq("id", snapshot.id).eq("user_id", snapshot.userId).eq("data->>status", snapshot.status).is("data->>deletedAt", null);
  query = snapshot.finalizationStartedAt ? query.eq("data->>finalizationStartedAt", String(snapshot.finalizationStartedAt)) : query.is("data->>finalizationStartedAt", null);
  const { data, error } = await query.select("id");
  if (error) fail("atualizar consulta de vídeo", error);
  return Boolean(data?.length);
}

export async function updateVideo(id: string, patch: Partial<Video>): Promise<Video | undefined> {
  const sb = remote();
  if (sb) {
    // Share the caption revision so a concurrent deletion/update cannot erase a
    // paid request claim or be resurrected by its delayed completion.
    for (let attempt = 0; attempt < 6; attempt++) {
      const current = await getVideoById(id);
      if (!current) return;
      const next = { ...current, ...patch, captionRevision: randomUUID() };
      let query = sb.from("mi_videos").update({ data: next }).eq("id", id);
      query = current.captionRevision ? query.eq("data->>captionRevision", current.captionRevision) : query.is("data->>captionRevision", null);
      const { data, error } = await query.select("id");
      if (error) fail("atualizar vídeo", error);
      if (data?.length) return next;
    }
    throw new Error("O vídeo foi atualizado. Tente novamente.");
  }
  return mutate((db) => {
    const video = db.videos.find((v) => v.id === id);
    if (!video) return undefined;
    Object.assign(video, patch);
    video.captionRevision = randomUUID();
    return video;
  });
}

export async function deleteVideo(userId: string, id: string): Promise<boolean> {
  const video = await getVideo(userId, id);
  if (video?.edit || video?.requestFingerprint) {
    if (video.status === "queued" || video.status === "processing" || (video.status === "review" && !video.resultUrl)) return false;
    // Keep the quote UUID as an idempotency tombstone even after hiding the card.
    // Deleting it would allow the same signed quote to submit another paid job.
    await updateVideo(id, { deletedAt: Date.now() });
    return true;
  }
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
    let query = sb.from("mi_virals").select("data").order("views", { ascending: false }).limit(240);
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
  const { sealSocialToken } = await import("./social-token");
  const owner = `${input.userId}:${input.platform}`;
  input = { ...input, accessToken: sealSocialToken(input.accessToken, owner), refreshToken: sealSocialToken(input.refreshToken, owner) };
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

/** Refresh must not resurrect a disconnected account or overwrite a new login. */
export async function refreshSocialAccountTokens(account: SocialAccount, patch: Pick<SocialAccount, "accessToken" | "refreshToken" | "expiresAt" | "refreshExpiresAt" | "scopes">): Promise<SocialAccount | undefined> {
  const { sealSocialToken } = await import("./social-token");
  const owner = `${account.userId}:${account.platform}`;
  const merged = { ...account, expiresAt: patch.expiresAt, refreshExpiresAt: patch.refreshExpiresAt, scopes: patch.scopes ?? account.scopes, accessToken: sealSocialToken(patch.accessToken, owner), refreshToken: sealSocialToken(patch.refreshToken, owner) };
  const sb = remote();
  if (sb) {
    let query = sb.from("mi_social_accounts").update({ data: merged }).eq("id", account.id).eq("user_id", account.userId).eq("data->>connectedAt", String(account.connectedAt));
    query = account.accessToken ? query.eq("data->>accessToken", account.accessToken) : query.is("data->>accessToken", null);
    const { data, error } = await query.select("id");
    if (error) fail("renovar conexão", error);
    return data?.length ? merged : undefined;
  }
  return mutate((db) => {
    const index = db.socialAccounts.findIndex((a) => a.id === account.id && a.connectedAt === account.connectedAt && a.accessToken === account.accessToken);
    if (index < 0) return undefined;
    db.socialAccounts[index] = merged;
    return merged;
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
      .is("data->>deletedAt", null)
      .order("scheduled_at", { ascending: false });
    if (error) fail("listar publicações", error);
    return (data ?? []).map((row) => rowData<Post>(row));
  }
  return load()
    .posts.filter((p) => p.userId === userId && !p.deletedAt)
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

/** A retried scheduling action with the same request key cannot enqueue twice. */
export async function createPostOnce(input: Omit<Post, "createdAt">): Promise<Post> {
  const post: Post = { ...input, createdAt: Date.now(), revision: randomUUID() };
  const sb = remote();
  if (sb) {
    const { error } = await sb.from("mi_posts").upsert({ id: post.id, user_id: post.userId, status: post.status, scheduled_at: post.scheduledAt, created_at: post.createdAt, data: post }, { onConflict: "id", ignoreDuplicates: true });
    if (error) fail("agendar publicação", error);
    const { data, error: readError } = await sb.from("mi_posts").select("data").eq("id", post.id).eq("user_id", post.userId).single();
    if (readError) fail("confirmar agendamento", readError);
    return rowData<Post>(data);
  }
  return mutate((db) => {
    const existing = db.posts.find((p) => p.id === post.id);
    if (existing) {
      if (existing.userId !== post.userId) throw new Error("Publicação indisponível.");
      return existing;
    }
    db.posts.push(post);
    return post;
  });
}

/** All scheduler transitions use a DB CAS, not an in-process lock. */
export async function claimPostWork(post: Post, now: number): Promise<Post | undefined> {
  if (post.deletedAt || (post.status !== "scheduled" && post.status !== "posting") || post.scheduledAt > now || (post.leaseUntil ?? 0) > now || (post.nextAttemptAt ?? 0) > now) return undefined;
  const next: Post = { ...post, status: "posting", leaseId: randomUUID(), leaseUntil: now + 90_000, revision: randomUUID() };
  const sb = remote();
  if (sb) {
    let query = sb.from("mi_posts").update({ status: "posting", data: next }).eq("id", post.id).eq("status", post.status);
    query = post.revision ? query.eq("data->>revision", post.revision) : query.is("data->>revision", null);
    const { data, error } = await query.select("id");
    if (error) fail("reservar publicação", error);
    return data?.length ? next : undefined;
  }
  return mutate((db) => {
    const index = db.posts.findIndex((p) => p.id === post.id && p.status === post.status && p.revision === post.revision);
    if (index < 0) return undefined;
    db.posts[index] = next;
    return next;
  });
}

/** Checkpoint before each non-idempotent request, or release after polling. */
export async function savePostWork(post: Post, patch: Partial<Post>, release = true): Promise<Post | undefined> {
  if (!post.leaseId) return undefined;
  const next: Post = { ...post, ...patch, id: post.id, userId: post.userId, revision: randomUUID(), ...(release ? { leaseId: undefined, leaseUntil: undefined } : {}) };
  const sb = remote();
  if (sb) {
    const { data, error } = await sb.from("mi_posts").update({ status: next.status, scheduled_at: next.scheduledAt, data: next }).eq("id", post.id).eq("status", "posting").eq("data->>leaseId", post.leaseId).eq("data->>revision", post.revision!).select("id");
    if (error) fail("salvar processamento da publicação", error);
    return data?.length ? next : undefined;
  }
  return mutate((db) => {
    const index = db.posts.findIndex((p) => p.id === post.id && p.status === "posting" && p.leaseId === post.leaseId && p.revision === post.revision);
    if (index < 0) return undefined;
    db.posts[index] = next;
    return next;
  });
}

export async function updatePost(id: string, patch: Partial<Post>, expectedStatus?: PostStatus): Promise<Post | undefined> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb.from("mi_posts").select("data").eq("id", id).maybeSingle();
    if (error) fail("buscar publicação", error);
    if (!data) return undefined;
    if (expectedStatus && rowData<Post>(data).status !== expectedStatus) return undefined;
    const current = rowData<Post>(data);
    const merged = { ...current, ...patch, revision: randomUUID() };
    let query = sb
      .from("mi_posts")
      .update({ status: merged.status, scheduled_at: merged.scheduledAt, data: merged })
      .eq("id", id);
    if (expectedStatus) query = query.eq("status", expectedStatus);
    query = current.revision ? query.eq("data->>revision", current.revision) : query.is("data->>revision", null);
    const { data: changed, error: updateError } = await query.select("id");
    if (updateError) fail("atualizar publicação", updateError);
    if (!changed?.length) return undefined;
    return merged;
  }
  return mutate((db) => {
    const post = db.posts.find((p) => p.id === id);
    if (!post) return undefined;
    if (expectedStatus && post.status !== expectedStatus) return undefined;
    Object.assign(post, patch, { revision: randomUUID() });
    return post;
  });
}

export async function deletePost(userId: string, id: string): Promise<boolean> {
  const sb = remote();
  if (sb) {
    const { data: existing, error: readError } = await sb.from("mi_posts").select("data").eq("id", id).eq("user_id", userId).maybeSingle();
    if (readError) fail("buscar publicação", readError);
    if (!existing) return false;
    const current = rowData<Post>(existing);
    if (current.status === "posting") return false;
    if (current.deletedAt) return true;
    const next = { ...current, deletedAt: Date.now(), revision: randomUUID() };
    let query = sb.from("mi_posts").update({ data: next }).eq("id", id).eq("user_id", userId).neq("status", "posting");
    query = current.revision ? query.eq("data->>revision", current.revision) : query.is("data->>revision", null);
    const { data, error } = await query.select("id");
    if (error) fail("remover publicação", error);
    return Boolean(data?.length);
  }
  return mutate((db) => {
    const post = db.posts.find((p) => p.id === id && p.userId === userId && p.status !== "posting");
    if (!post) return false;
    post.deletedAt = Date.now(); post.revision = randomUUID();
    return true;
  });
}

export async function listDuePosts(now: number): Promise<Post[]> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb
      .from("mi_posts")
      .select("data")
      .eq("status", "scheduled")
      .is("data->>deletedAt", null)
      .lte("scheduled_at", now);
    if (error) fail("buscar fila", error);
    return (data ?? []).map((row) => rowData<Post>(row));
  }
  return load().posts.filter((p) => p.status === "scheduled" && !p.deletedAt && p.scheduledAt <= now);
}

export async function getPostOwnerAccount(post: Post): Promise<SocialAccount | undefined> {
  return getSocialAccount(post.userId, post.platform);
}

export async function listPendingPosts(): Promise<Post[]> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb.from("mi_posts").select("data").eq("status", "posting").is("data->>deletedAt", null);
    if (error) fail("buscar publicações em processamento", error);
    return (data ?? []).map((row) => rowData<Post>(row));
  }
  return load().posts.filter((post) => post.status === "posting" && !post.deletedAt);
}

/** Atomically claims a due job, including across multiple serverless workers. */
export async function claimScheduledPost(post: Post): Promise<boolean> {
  const sb = remote();
  if (sb) {
    const { data, error } = await sb.from("mi_posts")
      .update({ status: "posting", data: { ...post, status: "posting" } })
      .eq("id", post.id).eq("status", "scheduled").select("id");
    if (error) fail("reservar publicação", error);
    return Boolean(data?.length);
  }
  return mutate((db) => {
    const current = db.posts.find((item) => item.id === post.id && item.status === "scheduled");
    if (!current) return false;
    current.status = "posting";
    return true;
  });
}
