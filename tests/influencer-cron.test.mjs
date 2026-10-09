import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const routeFile = "src/app/api/cron/influencers/route.ts";

function fixture({ env = { CRON_SECRET: "private-cron" }, records = [{ id: "saved-request", requestId: "existing-provider-request" }], list, finalize, deadline = false } = {}) {
  const module = { exports: {} };
  const events = [], logs = [], timers = [], cleared = [];
  const failPaidOperation = () => assert.fail("Cron must not create an influencer or submit a paid generation");
  const mocks = {
    "@/lib/db": {
      listPendingInfluencers: async limit => {
        events.push(["list", limit]);
        return list ? list(limit) : records;
      },
      createInfluencer: failPaidOperation,
      createInfluencerOnce: failPaidOperation,
      reserveInfluencerCredits: failPaidOperation,
    },
    "@/lib/influencer-finalization": {
      finalizeInfluencers: async pending => {
        events.push(["finalize", pending]);
        return finalize ? finalize(pending) : undefined;
      },
    },
    "@/lib/influencer-generation": {
      submitInfluencerGeneration: failPaidOperation,
      submitInfluencerImageEdit: failPaidOperation,
    },
  };
  const code = ts.transpileModule(readFileSync(new URL(`../${routeFile}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(id) {
      if (id in mocks) return mocks[id];
      if (id === "node:crypto") return require(id);
      throw new Error(`Unexpected cron dependency: ${id}`);
    },
    process: { env }, Buffer, Request, Response,
    fetch: () => assert.fail("Unexpected network request"),
    console: { error: (...values) => logs.push(values) },
    setTimeout(callback, delay) {
      const handle = timers.length + 1;
      timers.push({ handle, delay });
      if (deadline) queueMicrotask(callback);
      return handle;
    },
    clearTimeout: handle => cleared.push(handle),
  }, { filename: routeFile });
  return {
    api: module.exports, events, logs, timers, cleared, records,
    request: authorization => new Request("https://app.example/api/cron/influencers", {
      headers: authorization === undefined ? {} : { authorization },
    }),
  };
}

test("influencer cron rejects missing and invalid authorization before querying records or providers", async () => {
  const f = fixture();
  for (const authorization of [undefined, "Bearer wrong", "Bearer private-croo", "Bearer private-cron-extra", "Basic private-cron"]) {
    const response = await f.api.GET(f.request(authorization));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Unauthorized" });
  }
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.timers, []);
  assert.deepEqual(f.logs, []);
});

test("influencer cron fails closed when CRON_SECRET is missing or empty", async () => {
  for (const env of [{}, { CRON_SECRET: "" }]) {
    const f = fixture({ env });
    assert.equal((await f.api.GET(f.request("Bearer private-cron"))).status, 401);
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.timers, []);
  }
});

test("authorized cron finalizes only the bounded batch of existing jobs without submitting a new generation", async () => {
  const f = fixture();
  const snapshot = structuredClone(f.records);
  const response = await f.api.GET(f.request("Bearer private-cron"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(f.events.length, 2);
  assert.deepEqual(f.events[0], ["list", 8]);
  assert.equal(f.events[1][0], "finalize");
  assert.equal(f.events[1][1], f.records);
  assert.deepEqual(f.records, snapshot);
  assert.deepEqual(f.logs, []);
  assert.deepEqual(f.timers, [{ handle: 1, delay: 95000 }]);
  assert.deepEqual(f.cleared, [1]);
});

test("database and finalization failures return a generic uncached 503 without secrets in responses or logs", async () => {
  for (const config of [
    { list: async () => { throw new Error("private-cron database-credential"); } },
    { finalize: async () => { throw new Error("private-provider-payload private-cron"); } },
  ]) {
    const f = fixture(config);
    const response = await f.api.GET(f.request("Bearer private-cron"));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.deepEqual(body, { error: "Finalization unavailable" });
    assert.doesNotMatch(JSON.stringify([body, f.logs]), /private|credential|payload/);
    assert.equal(JSON.stringify(f.logs), JSON.stringify([["[influencer-cron]", { stage: "finalization" }]]));
    assert.deepEqual(f.cleared, [1]);
    if (config.list) assert.deepEqual(f.events, [["list", 8]]);
    else assert.equal(f.events[1][0], "finalize");
  }
});

test("a hung finalization reaches the deadline and cannot leave the cron waiting indefinitely", async () => {
  const f = fixture({ deadline: true, finalize: () => new Promise(() => {}) });
  const response = await f.api.GET(f.request("Bearer private-cron"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error: "Finalization unavailable" });
  assert.deepEqual(f.timers, [{ handle: 1, delay: 95000 }]);
  assert.deepEqual(f.cleared, [1]);
  assert.doesNotMatch(JSON.stringify(f.logs), /private|deadline/i);
  assert.equal(f.events[0][1], 8);
});

test("deployment retains publication scheduling alongside influencer finalization", () => {
  const { crons } = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  for (const path of ["/api/cron/publish", "/api/cron/influencers"]) {
    const matches = crons.filter(item => item.path === path);
    assert.equal(matches.length, 1, `${path} must remain configured exactly once`);
    assert.equal(matches[0].schedule, "* * * * *");
  }
});
