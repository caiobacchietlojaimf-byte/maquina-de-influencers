import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { serverDb } from "./server-db";

export const PUBLICATION_CRON_HEALTH_ID = "publication-cron-health";
export type PublicationCronHealth = {
  lastStartedAt: number;
  lastSucceededAt?: number;
  lastErrorAt?: number;
  lastFinishedRunId?: string;
  lastRunId: string;
};
type StoredHealth = PublicationCronHealth & { revision: string };
type Run = { id: string; startedAt: number };
const localFile = () => path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "publication-cron-health.json");
function readLocal(): StoredHealth | undefined {
  return existsSync(localFile()) ? JSON.parse(readFileSync(localFile(), "utf8")) : undefined;
}
function persistLocal(data: StoredHealth) {
  const file = localFile();
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(data), "utf8");
  renameSync(temporary, file);
}
const failure = () => new Error("Telemetria do agendador indisponível.");

async function changeHealth(change: (current: StoredHealth | undefined) => PublicationCronHealth | undefined): Promise<void> {
  const db = serverDb();
  if (!db) {
    const next = change(readLocal());
    if (next) persistLocal({ ...next, revision: randomUUID() });
    return;
  }
  // One budget covers CAS retries. A failing telemetry store cannot consume
  // the function's whole time budget or hide the publisher's own result.
  const signal = AbortSignal.timeout(5000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await db.from("mi_settings").select("data").eq("id", PUBLICATION_CRON_HEALTH_ID).abortSignal(signal).maybeSingle();
    if (result.error) throw failure();
    const current = result.data?.data as StoredHealth | undefined;
    const changed = change(current);
    if (!changed) return;
    const next = { ...changed, revision: randomUUID() };
    if (!current) {
      const inserted = await db.from("mi_settings").insert({ id: PUBLICATION_CRON_HEALTH_ID, data: next }).abortSignal(signal);
      if (!inserted.error) return;
      if (inserted.error.code === "23505") continue;
      throw failure();
    }
    let update = db.from("mi_settings").update({ data: next }).eq("id", PUBLICATION_CRON_HEALTH_ID);
    update = current.revision ? update.eq("data->>revision", current.revision) : update.is("data->>revision", null);
    const saved = await update.select("id").abortSignal(signal);
    if (saved.error) throw failure();
    if (saved.data?.length) return;
  }
  throw failure();
}

export async function startPublicationCronRun(): Promise<Run> {
  const run = { id: randomUUID(), startedAt: Date.now() };
  await changeHealth(current => current && current.lastStartedAt > run.startedAt
    ? undefined
    : { ...current, lastStartedAt: run.startedAt, lastRunId: run.id });
  return run;
}

export async function finishPublicationCronRun(run: Run, succeeded: boolean): Promise<void> {
  await changeHealth(current => {
    // An earlier overlapping invocation cannot mark the newest run finished.
    if (!current || current.lastRunId !== run.id) return undefined;
    return { ...current, lastFinishedRunId: run.id, ...(succeeded ? { lastSucceededAt: Date.now() } : { lastErrorAt: Date.now() }) };
  });
}

export async function getPublicationCronHealth(): Promise<PublicationCronHealth | undefined> {
  const db = serverDb();
  let data: StoredHealth | undefined;
  if (!db) data = readLocal();
  else {
    const result = await db.from("mi_settings").select("data").eq("id", PUBLICATION_CRON_HEALTH_ID).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if (result.error) throw failure();
    data = result.data?.data as StoredHealth | undefined;
  }
  if (!data) return undefined;
  // No provider payload, token, exception text or configurable setting is exposed.
  return { lastStartedAt: data.lastStartedAt, lastSucceededAt: data.lastSucceededAt, lastErrorAt: data.lastErrorAt, lastRunId: data.lastRunId, lastFinishedRunId: data.lastFinishedRunId };
}
