import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
function load(file, { env = {}, mocks = {}, globals = {} } = {}) {
  const module = { exports: {} };
  const source = readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, require(id) {
      if (id in mocks) return mocks[id];
      if (id === "server-only") return {};
      if (id.startsWith("@/") || id.startsWith("./")) throw new Error(`Unmocked dependency: ${id}`);
      return require(id);
    }, process: { env, cwd: () => root }, Buffer, AbortSignal, Response, Request, setTimeout, clearTimeout, console,
    fetch: () => assert.fail("Unexpected network request"), ...globals,
  }, { filename: file });
  return module.exports;
}
function localFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-cron-health-test-"));
  let now = 100000;
  class Clock extends Date { static now() { return now; } }
  const api = load("src/lib/publication-cron-health.ts", { env: { DATA_DIR: directory }, mocks: { "./server-db": { serverDb: () => null } }, globals: { Date: Clock } });
  return { api, directory, clock: value => { now = value; }, cleanup() {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.match(path.basename(directory), /^mi-cron-health-test-/);
    rmSync(directory, { recursive: true });
  } };
}

test("cron health records start/success/error without configuration, payload or secrets", async () => {
  const f = localFixture();
  try {
    assert.equal(await f.api.getPublicationCronHealth(), undefined);
    const first = await f.api.startPublicationCronRun();
    f.clock(101000); await f.api.finishPublicationCronRun(first, true);
    f.clock(102000); const second = await f.api.startPublicationCronRun();
    f.clock(103000); await f.api.finishPublicationCronRun(second, false);
    const health = await f.api.getPublicationCronHealth();
    assert.equal(health.lastStartedAt, 102000);
    assert.equal(health.lastSucceededAt, 101000);
    assert.equal(health.lastErrorAt, 103000);
    assert.equal(health.lastFinishedRunId, second.id);
    assert.ok(!("revision" in health));
    const stored = JSON.parse(readFileSync(path.join(f.directory, "publication-cron-health.json"), "utf8"));
    assert.deepEqual(Object.keys(stored).sort(), ["lastErrorAt", "lastFinishedRunId", "lastRunId", "lastStartedAt", "lastSucceededAt", "revision"].sort());
  } finally { f.cleanup(); }
});

test("an overlapping older invocation cannot complete or overwrite the newest run", async () => {
  const f = localFixture();
  try {
    const first = await f.api.startPublicationCronRun();
    f.clock(101000); const second = await f.api.startPublicationCronRun();
    f.clock(102000); await f.api.finishPublicationCronRun(first, true);
    let health = await f.api.getPublicationCronHealth();
    assert.equal(health.lastRunId, second.id);
    assert.equal(health.lastFinishedRunId, undefined);
    assert.equal(health.lastSucceededAt, undefined);
    f.clock(99000); const lateOldStart = await f.api.startPublicationCronRun();
    await f.api.finishPublicationCronRun(lateOldStart, false);
    health = await f.api.getPublicationCronHealth();
    assert.equal(health.lastStartedAt, 101000);
    assert.equal(health.lastRunId, second.id);
    f.clock(103000); await f.api.finishPublicationCronRun(second, true);
    assert.equal((await f.api.getPublicationCronHealth()).lastSucceededAt, 103000);
  } finally { f.cleanup(); }
});

test("remote cron health retries CAS conflicts and touches only its reserved settings row", async () => {
  let stored, inserts = 0, updates = 0;
  const tables = [], ids = [], signals = [];
  const db = { from(table) {
    tables.push(table); let operation = "read", patch, revision;
    const query = {
      select() { return query; }, eq(field, value) { if (field === "id") ids.push(value); else if (field === "data->>revision") revision = value; return query; },
      is() { return query; }, abortSignal(signal) { signals.push(signal); return query; },
      insert(value) { operation = "insert"; patch = value.data; ids.push(value.id); return query; },
      update(value) { operation = "update"; patch = value.data; return query; },
      async maybeSingle() { return { data: stored ? { data: structuredClone(stored) } : null }; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (operation === "insert") {
          inserts++; stored = { ...patch, revision: "concurrent-insert", lastSucceededAt: 10 };
          return { error: { code: "23505" } };
        }
        if (operation === "update") {
          updates++;
          if (updates === 1) { stored = { ...stored, revision: "concurrent-update", lastSucceededAt: 20 }; return { data: [] }; }
          if (stored.revision !== revision) return { data: [] };
          stored = patch; return { data: [{ id: "publication-cron-health" }] };
        }
        throw new Error("Unexpected remote operation");
      }).then(resolve, reject); },
    };
    return query;
  } };
  const api = load("src/lib/publication-cron-health.ts", { mocks: { "./server-db": { serverDb: () => db } } });
  const run = await api.startPublicationCronRun();
  assert.equal(inserts, 1); assert.equal(updates, 2);
  assert.equal(stored.lastRunId, run.id); assert.equal(stored.lastSucceededAt, 20);
  assert.ok(tables.every(value => value === "mi_settings"));
  assert.ok(ids.every(value => value === "publication-cron-health"));
  assert.ok(signals.length >= 3 && signals.every(signal => signal === signals[0]));
});

function routeFixture({ tick = async () => undefined, deadline = false, brokenHealth = false, env = { CRON_SECRET: "private-cron" } } = {}) {
  const events = [], logs = [];
  const api = load("src/app/api/cron/publish/route.ts", {
    env, mocks: {
      "@/lib/publisher": { publisherTick: async () => { events.push("tick"); return tick(); } },
      "@/lib/publication-cron-health": {
        startPublicationCronRun: async () => { events.push("start"); if (brokenHealth) throw new Error("Sensitive internal text"); return { id: "run", startedAt: 1000 }; },
        finishPublicationCronRun: async (run, success) => { events.push([run.id, success]); },
      },
    }, globals: {
      console: { error: (...values) => logs.push(values) },
      ...(deadline ? { setTimeout: (callback, delay) => { assert.equal(delay, 40000); queueMicrotask(callback); return 1; }, clearTimeout: () => undefined } : {}),
    },
  });
  return { api, events, logs, request: auth => new Request("https://app.example/api/cron/publish", { headers: auth === undefined ? {} : { authorization: auth } }) };
}

test("unauthenticated cron calls cannot write health or touch the publication queue", async () => {
  const f = routeFixture();
  for (const auth of [undefined, "Bearer wrong", "Bearer private-cron-extra"]) assert.equal((await f.api.GET(f.request(auth))).status, 401);
  assert.deepEqual(f.events, []);
  const missing = routeFixture({ env: {} });
  assert.equal((await missing.api.GET(missing.request("Bearer private-cron"))).status, 401);
  assert.deepEqual(missing.events, []);
});

test("authenticated completion persists success before returning an uncached response", async () => {
  const f = routeFixture();
  const response = await f.api.GET(f.request("Bearer private-cron"));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(f.events, ["start", "tick", ["run", true]]);
});

test("publisher failures and hung ticks persist failure without exposing their details", async () => {
  for (const config of [{ tick: async () => { throw new Error("private-provider-payload"); } }, { tick: () => new Promise(() => {}), deadline: true }]) {
    const f = routeFixture(config);
    const response = await f.api.GET(f.request("Bearer private-cron"));
    assert.equal(response.status, 503);
    assert.deepEqual(f.events, ["start", "tick", ["run", false]]);
    assert.ok(!(await response.text()).includes("private"));
    assert.deepEqual(f.logs, []);
  }
});

test("unavailable telemetry cannot prevent queue processing or leak exception text", async () => {
  const f = routeFixture({ brokenHealth: true });
  const response = await f.api.GET(f.request("Bearer private-cron"));
  assert.equal(response.status, 200);
  assert.deepEqual(f.events, ["start", "tick"]);
  assert.equal(JSON.stringify(f.logs), JSON.stringify([["[publication-cron]", { stage: "health-start" }]]));
});
