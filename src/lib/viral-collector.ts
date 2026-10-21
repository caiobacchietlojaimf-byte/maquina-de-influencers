import "server-only";

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { listVirals, upsertVirals, type Viral } from "./db";
import { listAiVirals, mineTrending, MiningProviderError, refreshViralMedia } from "./miner";
import { serverDb } from "./server-db";
import type { DiscoveryCursors } from "./ai-discovery";
import { fetchChannelShorts, searchYoutubeShorts, youtubeConfigured, YoutubeProviderError, YOUTUBE_QUERIES } from "./youtube-discovery";
import { YOUTUBE_AI_CHANNELS } from "@/data/youtube-channels";
import { instagramDiscoveryAccount, runInstagramDiscovery, type InstagramRound } from "./instagram-discovery";

/* Coleta contínua de vídeos de personagens de IA.
   - Roda pelo cron da Vercel (vercel.json) a cada 15 minutos e, no dev local,
     pelo instrumentation.ts. Visitas à página nunca disparam a coleta
     externa, salvo como rede de segurança quando o agendador está parado.
   - Um lease em mi_settings impede execuções sobrepostas; o estado por fonte
     guarda última tentativa, último sucesso, novos itens e espera progressiva.
   - Instagram: API oficial (business_discovery) com a conta administradora
     conectada em Publicar; lê os Reels públicos dos perfis acompanhados a cada
     rodada. Sem conta conectada, fica em modo catálogo (acervo verificado e
     importação manual), com status explícito.
   - TikTok: busca via tikwm.com (serviço público, sem chave, com limites),
     desligada por padrão porque a fonte responde 403; só
     TIKTOK_DISCOVERY_ENABLED=true liga, para não repetir consultas bloqueadas. YouTube: com YOUTUBE_DISCOVERY_ENABLED=true, lê a
     cada rodada os feeds públicos dos canais de src/data/youtube-channels.ts
     (sem chave, sem cota, em rodízio). Com YOUTUBE_API_KEY também busca por
     termo pela Data API v3, uma vez por hora com duas buscas (48/dia, dentro
     do bucket oficial de 100 search.list/dia). Sem a flag fica "inactive".
   - As três áreas da página (Vídeos, Descobrir personagens, Efeitos) leem o
     mesmo acervo: nenhuma consulta externa se repete por aba. */

export const VIRAL_COLLECTOR_ID = "viral-collector";

/** Coleta automática desligada por padrão: só VIRAL_COLLECTION_ENABLED=true liga.
 *  Um deploy com o cron declarado não consulta provedor nenhum sem essa variável. */
export function collectionEnabled(): boolean {
  return process.env.VIRAL_COLLECTION_ENABLED?.trim().toLowerCase() === "true";
}

/** TikTok (tikwm, fonte bloqueada em 2026-10-20) só com TIKTOK_DISCOVERY_ENABLED=true. */
export function tiktokDiscoveryEnabled(): boolean {
  return process.env.TIKTOK_DISCOVERY_ENABLED?.trim().toLowerCase() === "true";
}

/** YouTube liga com YOUTUBE_DISCOVERY_ENABLED=true: feeds públicos dos canais
 *  sempre; a busca por termo pela API só quando também houver YOUTUBE_API_KEY. */
export function youtubeDiscoveryEnabled(): boolean {
  return process.env.YOUTUBE_DISCOVERY_ENABLED?.trim().toLowerCase() === "true" && (youtubeConfigured() || YOUTUBE_AI_CHANNELS.length > 0);
}
export const COLLECT_INTERVAL_MS = 15 * 60_000;
const LOCK_TTL_MS = 10 * 60_000;
const BACKOFF_BASE_MS = 5 * 60_000;
const BACKOFF_MAX_MS = 60 * 60_000;
const METRICS_WINDOW_MS = 14 * 24 * 60 * 60_000;
const METRICS_MIN_AGE_MS = 6 * 60 * 60_000;
const METRICS_BATCH = 6;
const UNAVAILABLE_AFTER_FAILURES = 3;
export const YOUTUBE_INTERVAL_MS = 60 * 60_000;
const YOUTUBE_QUERIES_PER_RUN = 2;
/** Feeds públicos lidos por rodada, em rodízio (sem cota; só limita o tempo da rodada). */
const YOUTUBE_FEEDS_PER_RUN = 8;

export type SourceId = "tiktok" | "instagram" | "youtube";
export type SourceState = {
  /** "discovery" coleta sozinha; "catalog" só tem o acervo verificado e importação manual;
   *  "inactive" tem integração pronta, mas sem credencial configurada. */
  mode: "discovery" | "catalog" | "inactive";
  /** Por que a fonte não coleta (modos catalog/inactive) ou qual conta lê (Instagram). */
  reason?: string;
  account?: string;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  lastAdded?: number;
  lastMetricsUpdated?: number;
  consecutiveFailures?: number;
  backoffUntil?: number;
  cursors?: DiscoveryCursors;
};
export type CollectorState = {
  lock?: { runId: string; startedAt: number; expiresAt: number };
  sources: Record<SourceId, SourceState>;
  revision?: string;
};
export type CollectorStatus = {
  /** false = coleta automática desligada; o acervo salvo continua disponível. */
  enabled: boolean;
  intervalMs: number;
  sources: Record<SourceId, Omit<SourceState, "cursors">>;
  running: boolean;
};
export type CollectionRun = { skipped?: "disabled" | "locked" | "backoff"; added: number; metricsUpdated: number; errors: string[]; youtube?: { skipped?: "inactive" | "interval" | "backoff"; added: number; units: number }; instagram?: { skipped?: "catalog" | "backoff"; added: number; profiles: number; failed: number } };

const TIKTOK_OFF = "fonte pública (tikwm) bloqueada com HTTP 403; descoberta desligada até haver fonte autorizada";
const YOUTUBE_OFF = "complemento desligado: exige YOUTUBE_DISCOVERY_ENABLED=true (feeds dos canais; a chave da API só acrescenta a busca por termo)";
const INSTAGRAM_CATALOG = "sem conta administradora conectada pela API oficial; só catálogo verificado e importação manual";

const defaults = (): CollectorState => ({
  sources: {
    tiktok: tiktokDiscoveryEnabled() ? { mode: "discovery" } : { mode: "inactive", reason: TIKTOK_OFF },
    instagram: { mode: "catalog", reason: INSTAGRAM_CATALOG },
    youtube: youtubeDiscoveryEnabled() ? { mode: "discovery" } : { mode: "inactive", reason: YOUTUBE_OFF },
  },
});

const localFile = () => path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "viral-collector.json");
function readLocal(): CollectorState | undefined {
  return existsSync(localFile()) ? JSON.parse(readFileSync(localFile(), "utf8")) : undefined;
}
function persistLocal(data: CollectorState) {
  const file = localFile();
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(data), "utf8");
  renameSync(temporary, file);
}
const failure = () => new Error("Estado da coleta indisponível.");

function normalize(state: CollectorState | undefined): CollectorState {
  const base = defaults();
  if (!state) return base;
  // Modo e motivo seguem a configuração atual, não o que ficou salvo.
  return { ...base, ...state, sources: {
    tiktok: { ...base.sources.tiktok, ...state.sources?.tiktok, mode: base.sources.tiktok.mode, reason: base.sources.tiktok.reason },
    instagram: { ...base.sources.instagram, ...state.sources?.instagram, mode: "catalog", reason: INSTAGRAM_CATALOG },
    youtube: { ...base.sources.youtube, ...state.sources?.youtube, mode: base.sources.youtube.mode, reason: base.sources.youtube.reason },
  } };
}

export async function readCollectorState(): Promise<CollectorState> {
  const db = serverDb();
  if (!db) return normalize(readLocal());
  const result = await db.from("mi_settings").select("data").eq("id", VIRAL_COLLECTOR_ID).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if (result.error) throw failure();
  return normalize(result.data?.data as CollectorState | undefined);
}

/** Compare-and-set: `change` recebe o estado atual e devolve o próximo (ou undefined para desistir). */
async function changeState(change: (current: CollectorState) => CollectorState | undefined): Promise<CollectorState | undefined> {
  const db = serverDb();
  if (!db) {
    const next = change(normalize(readLocal()));
    if (next) persistLocal({ ...next, revision: randomUUID() });
    return next;
  }
  const signal = AbortSignal.timeout(5000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await db.from("mi_settings").select("data").eq("id", VIRAL_COLLECTOR_ID).abortSignal(signal).maybeSingle();
    if (result.error) throw failure();
    const current = result.data?.data as CollectorState | undefined;
    const changed = change(normalize(current));
    if (!changed) return undefined;
    const next = { ...changed, revision: randomUUID() };
    if (!current) {
      const inserted = await db.from("mi_settings").insert({ id: VIRAL_COLLECTOR_ID, data: next }).abortSignal(signal);
      if (!inserted.error) return next;
      if (inserted.error.code === "23505") continue;
      throw failure();
    }
    let update = db.from("mi_settings").update({ data: next }).eq("id", VIRAL_COLLECTOR_ID);
    update = current.revision ? update.eq("data->>revision", current.revision) : update.is("data->>revision", null);
    const saved = await update.select("id").abortSignal(signal);
    if (saved.error) throw failure();
    if (saved.data?.length) return next;
  }
  throw failure();
}

function backoffFor(failures: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
}

/** Estado público, sem cursores nem detalhes internos. */
export async function getCollectorStatus(now = Date.now()): Promise<CollectorStatus> {
  const [state, instagramAccount] = await Promise.all([readCollectorState(), instagramDiscoveryAccount().catch(() => null)]);
  const strip = ({ cursors: _cursors, ...rest }: SourceState) => rest;
  const instagram = strip(state.sources.instagram);
  if (instagramAccount) { instagram.mode = "discovery"; instagram.account = instagramAccount.username; delete instagram.reason; }
  return {
    enabled: collectionEnabled(),
    intervalMs: COLLECT_INTERVAL_MS,
    running: Boolean(state.lock && state.lock.expiresAt > now),
    sources: { tiktok: strip(state.sources.tiktok), instagram, youtube: strip(state.sources.youtube) },
  };
}

/** A coleta está atrasada quando a última tentativa é mais velha que dois intervalos. */
export function collectionOverdue(status: CollectorStatus, now = Date.now()): boolean {
  if (!status.enabled) return false;
  const active = Object.values(status.sources).filter((source) => source.mode === "discovery");
  if (!active.length) return false;
  const last = Math.max(0, ...active.map((source) => source.lastAttemptAt ?? 0));
  return now - last > 2 * status.intervalMs;
}

async function acquireLock(now: number): Promise<string | null> {
  const runId = randomUUID();
  const next = await changeState((current) => {
    if (current.lock && current.lock.expiresAt > now) return undefined;
    return { ...current, lock: { runId, startedAt: now, expiresAt: now + LOCK_TTL_MS } };
  });
  return next ? runId : null;
}

async function releaseLock(runId: string): Promise<void> {
  await changeState((current) => (current.lock?.runId === runId ? { ...current, lock: undefined } : undefined));
}

/** Escolhe vídeos recentes do TikTok cujas métricas estão mais velhas; nunca os indisponíveis. */
export function pickMetricsCandidates(virals: Viral[], now = Date.now(), limit = METRICS_BATCH): Viral[] {
  return virals
    .filter((viral) => viral.source === "tiktok" && viral.minedAt > 0 && !viral.unavailableAt)
    .filter((viral) => now - (viral.discoveredAt ?? viral.minedAt) <= METRICS_WINDOW_MS)
    .filter((viral) => now - (viral.metricsUpdatedAt ?? viral.minedAt) >= METRICS_MIN_AGE_MS)
    .sort((a, b) => (a.metricsUpdatedAt ?? a.minedAt) - (b.metricsUpdatedAt ?? b.minedAt))
    .slice(0, limit);
}

/** Registra o resultado de uma rodada do Instagram (automática ou manual) no estado por fonte. */
export async function recordInstagramRound(round: InstagramRound, now: number): Promise<void> {
  const finishedAt = Date.now();
  await changeState((current) => {
    const previous = current.sources.instagram;
    const ok = !round.failure;
    const failures = ok ? 0 : (previous.consecutiveFailures ?? 0) + 1;
    return {
      ...current,
      sources: {
        ...current.sources,
        instagram: {
          ...previous,
          mode: "discovery", account: round.account, reason: undefined,
          lastAttemptAt: now,
          ...(ok ? { lastSuccessAt: finishedAt, lastError: round.errors[0], lastAdded: round.added } : { lastError: round.errors[0] }),
          consecutiveFailures: failures,
          // Autorização expirada não é tentada de novo sozinha (precisa reconectar); limite de taxa espera progressivamente.
          backoffUntil: ok ? undefined : round.failure === "auth" ? undefined : Math.max(now, finishedAt) + backoffFor(failures),
        },
      },
    };
  });
}

/** Uma rodada completa: Instagram (API oficial), TikTok (se ligado) e YouTube (se ligado). */
export async function runViralCollection(options: { now?: number; budgetMs?: number } = {}): Promise<CollectionRun> {
  const now = options.now ?? Date.now();
  const deadline = now + (options.budgetMs ?? 50_000);
  // Desligada: encerra antes de tocar no estado ou em qualquer provedor.
  if (!collectionEnabled()) return { skipped: "disabled", added: 0, metricsUpdated: 0, errors: [] };
  const runId = await acquireLock(now);
  if (!runId) return { skipped: "locked", added: 0, metricsUpdated: 0, errors: [] };
  const errors: string[] = [];
  let added = 0;
  let metricsUpdated = 0;
  let unavailable = false;
  try {
    const state = await readCollectorState();
    const tiktok = state.sources.tiktok;
    const tiktokActive = tiktok.mode === "discovery";
    if (tiktokActive && tiktok.backoffUntil && tiktok.backoffUntil > now && !(await instagramDiscoveryAccount())) {
      return { skipped: "backoff", added: 0, metricsUpdated: 0, errors: [] };
    }

    // 0) Instagram pela API oficial: perfis acompanhados, uma chamada por perfil.
    let instagramSummary: CollectionRun["instagram"];
    const instagramState = state.sources.instagram;
    if (instagramState.backoffUntil && instagramState.backoffUntil > now) {
      instagramSummary = { skipped: "backoff", added: 0, profiles: 0, failed: 0 };
    } else {
      const round = await runInstagramDiscovery({ now });
      if (!round) instagramSummary = { skipped: "catalog", added: 0, profiles: 0, failed: 0 };
      else {
        await recordInstagramRound(round, now);
        added += round.added;
        errors.push(...round.errors.map((message) => `Instagram ${message}`));
        instagramSummary = { added: round.added, profiles: round.profiles.filter((profile) => profile.ok).length, failed: round.profiles.filter((profile) => !profile.ok).length };
      }
    }

    // 1) TikTok (só com TIKTOK_DISCOVERY_ENABLED): continua da página salva; ao esgotar, recomeça.
    let cursors: DiscoveryCursors | undefined = tiktok.cursors && Object.keys(tiktok.cursors).length ? tiktok.cursors : undefined;
    let discoveryOk = false;
    const tiktokSkipped = !tiktokActive || (tiktok.backoffUntil !== undefined && tiktok.backoffUntil > now);
    if (!tiktokSkipped) {
      await changeState((current) => ({ ...current, sources: { ...current.sources, tiktok: { ...current.sources.tiktok, lastAttemptAt: now } } }));
      try {
        const result = await mineTrending("AI", { force: true, ...(cursors ? { cursors } : {}) });
        added += result.added;
        cursors = result.hasMore ? result.cursors : {};
        discoveryOk = true;
        if (result.warning) errors.push(result.warning);
      } catch (error) {
        const message = typeof (error as { message?: unknown } | null)?.message === "string" ? (error as Error).message : "A busca do TikTok falhou.";
        errors.push(message);
        unavailable = error instanceof MiningProviderError && error.unavailable;
      }
    }

    // 2) Métricas dos vídeos recentes do TikTok, dentro do orçamento de tempo e do limite do provedor.
    if (discoveryOk && Date.now() < deadline) {
      const candidates = pickMetricsCandidates(await listVirals("AI"), Date.now());
      for (const viral of candidates) {
        if (Date.now() > deadline - 3_000) break;
        try {
          await refreshViralMedia(viral);
          metricsUpdated += 1;
        } catch (error) {
          if (error instanceof MiningProviderError && error.unavailable) { unavailable = true; errors.push(error.message); break; }
          const failures = (viral.checkFailures ?? 0) + 1;
          await upsertVirals([{ ...viral, checkFailures: failures, ...(failures >= UNAVAILABLE_AFTER_FAILURES ? { unavailableAt: Date.now() } : {}) }]);
        }
      }
    }

    // 3) YouTube (API oficial): no máximo uma rodada por hora, duas consultas por rodada.
    const youtube = await runYoutubeDiscovery(state.sources.youtube, now, deadline);
    if (youtube.added) added += youtube.added;
    if (youtube.error) errors.push(youtube.error);

    const finishedAt = Date.now();
    const tiktokAdded = added - (instagramSummary?.added ?? 0) - youtube.added;
    const tiktokErrors = errors.filter((message) => !message.startsWith("Instagram ") && !message.startsWith("YouTube:"));
    await changeState((current) => {
      const previous = current.sources.tiktok;
      const failures = tiktokSkipped ? previous.consecutiveFailures ?? 0 : discoveryOk ? 0 : (previous.consecutiveFailures ?? 0) + 1;
      return {
        ...current,
        sources: {
          ...current.sources,
          tiktok: tiktokSkipped ? previous : {
            ...previous,
            lastAttemptAt: now,
            ...(discoveryOk ? { lastSuccessAt: finishedAt, lastError: undefined, lastAdded: tiktokAdded, lastMetricsUpdated: metricsUpdated, cursors } : { lastError: tiktokErrors[0] }),
            consecutiveFailures: failures,
            backoffUntil: discoveryOk ? undefined : unavailable ? finishedAt + backoffFor(failures) : previous.backoffUntil && previous.backoffUntil > finishedAt ? previous.backoffUntil : undefined,
          },
          youtube: youtube.state ? { ...current.sources.youtube, ...youtube.state } : current.sources.youtube,
        },
      };
    });
    return { added, metricsUpdated, errors, youtube: { ...(youtube.skipped ? { skipped: youtube.skipped } : {}), added: youtube.added, units: youtube.units }, ...(instagramSummary ? { instagram: instagramSummary } : {}) };
  } finally {
    try { await releaseLock(runId); } catch { /* o lease expira sozinho */ }
  }
}

type YoutubeRound = { skipped?: "inactive" | "interval" | "backoff"; added: number; units: number; error?: string; state?: Partial<SourceState> };

function cursorIndex(value: string | undefined): number {
  const index = Number(value ?? 0);
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

function errorMessage(error: unknown, fallback: string): string {
  return typeof (error as { message?: unknown } | null)?.message === "string" ? (error as Error).message : fallback;
}

/** Descoberta no YouTube dentro da mesma rodada:
 *  1) feeds públicos dos canais acompanhados, alguns por rodada em rodízio (cursor "feed");
 *  2) busca por termo pela API oficial, só com chave e no máximo uma vez por hora
 *     (cursores "next" e "searchAt"; cota esgotada espera a virada do dia). */
async function runYoutubeDiscovery(previous: SourceState, now: number, deadline: number): Promise<YoutubeRound> {
  if (previous.mode !== "discovery") return { skipped: "inactive", added: 0, units: 0 };
  if (previous.backoffUntil && previous.backoffUntil > now) return { skipped: "backoff", added: 0, units: 0 };
  const cursors: DiscoveryCursors = { ...previous.cursors };
  const collected = new Map<string, Omit<Viral, "id">>();
  let units = 0;
  let attempted = 0;
  let failed = 0;
  let error: string | undefined;

  const feedStart = cursorIndex(cursors.feed);
  const feeds = Math.min(YOUTUBE_FEEDS_PER_RUN, YOUTUBE_AI_CHANNELS.length);
  for (let i = 0; i < feeds; i++) {
    if (Date.now() > deadline - 5_000) break;
    const channel = YOUTUBE_AI_CHANNELS[(feedStart + i) % YOUTUBE_AI_CHANNELS.length];
    attempted += 1;
    try {
      for (const viral of await fetchChannelShorts(channel.id, Date.now())) collected.set(viral.videoId ?? viral.pageUrl, viral);
    } catch (feedError) {
      failed += 1;
      error ??= errorMessage(feedError, "O feed do YouTube falhou.");
    }
  }
  if (YOUTUBE_AI_CHANNELS.length) cursors.feed = String((feedStart + attempted) % YOUTUBE_AI_CHANNELS.length);

  let quotaUntil: number | undefined;
  const searchAt = Number(cursors.searchAt ?? 0);
  if (youtubeConfigured() && (!Number.isFinite(searchAt) || now - searchAt >= YOUTUBE_INTERVAL_MS)) {
    const index = cursorIndex(cursors.next);
    cursors.searchAt = String(now);
    try {
      for (let i = 0; i < YOUTUBE_QUERIES_PER_RUN; i++) {
        if (Date.now() > deadline - 5_000) break;
        const result = await searchYoutubeShorts(YOUTUBE_QUERIES[(index + i) % YOUTUBE_QUERIES.length], Date.now());
        units += result.units;
        for (const viral of result.virals) collected.set(viral.videoId ?? viral.pageUrl, viral);
      }
      cursors.next = String((index + YOUTUBE_QUERIES_PER_RUN) % YOUTUBE_QUERIES.length);
    } catch (searchError) {
      error ??= errorMessage(searchError, "A busca do YouTube falhou.");
      // Cota esgotada (HTTP 403 quotaExceeded): a busca espera a virada do dia no horário do
      // Pacífico, que cai às 07:00 UTC (PDT) ou 08:00 UTC (PST); 08:05 UTC cobre os dois.
      if (searchError instanceof YoutubeProviderError && searchError.quotaExceeded) quotaUntil = nextQuotaReset(now);
      if (quotaUntil) cursors.searchAt = String(quotaUntil - YOUTUBE_INTERVAL_MS);
    }
  }

  let added = 0;
  try {
    if (collected.size) added = await upsertVirals([...collected.values()]);
  } catch (saveError) {
    error ??= errorMessage(saveError, "Não foi possível salvar os vídeos do YouTube.");
    failed = attempted || 1;
  }

  // Só conta como falha da fonte quando nada respondeu; um canal fora do ar não para os outros.
  if (attempted > 0 && failed >= attempted && !collected.size) {
    const failures = (previous.consecutiveFailures ?? 0) + 1;
    return { added, units, error: `YouTube: ${error}`, state: { lastAttemptAt: now, lastError: error, consecutiveFailures: failures, backoffUntil: now + backoffFor(failures), cursors } };
  }
  return { added, units, ...(error ? { error: `YouTube: ${error}` } : {}), state: { lastAttemptAt: now, lastSuccessAt: Date.now(), lastError: error, lastAdded: added, consecutiveFailures: 0, backoffUntil: undefined, cursors } };
}

function nextQuotaReset(now: number): number {
  const reset = new Date(now);
  reset.setUTCHours(8, 5, 0, 0);
  if (reset.getTime() <= now) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset.getTime();
}

/** Novidades desde um instante, só por leitura do banco. */
export async function countNewVirals(since: number): Promise<number> {
  const virals = await listAiVirals();
  return virals.filter((viral) => (viral.discoveredAt ?? viral.minedAt) > since && !viral.unavailableAt).length;
}
