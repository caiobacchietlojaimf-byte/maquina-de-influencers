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

type Schema = {
  users: User[];
  influencers: Influencer[];
  videos: Video[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

let cache: Schema | null = null;

function load(): Schema {
  if (cache) return cache;
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    cache = { users: [], influencers: [], videos: [] };
    persist(cache);
    return cache;
  }
  try {
    cache = JSON.parse(readFileSync(DB_FILE, "utf8")) as Schema;
  } catch {
    cache = { users: [], influencers: [], videos: [] };
  }
  cache.users ??= [];
  cache.influencers ??= [];
  cache.videos ??= [];
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
