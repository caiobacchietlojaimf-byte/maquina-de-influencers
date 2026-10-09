import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash, createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url), root = fileURLToPath(new URL("..", import.meta.url));
const secret = "credit-checkout-fixture-secret", initialNow = Date.parse("2026-10-09T15:00:00Z");
function loader({ mocks = {}, globals = {}, env = { AUTH_SECRET: secret } } = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require(id) {
      if (id in mocks) return mocks[id];
      if (id === "server-only") return {};
      if (id.startsWith("./")) return load(path.resolve(path.dirname(file), `${id}.ts`));
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      return require(id);
    }, process: { env }, Buffer, URL, AbortSignal, Response, FormData, fetch: () => assert.fail("Real network/payment calls are forbidden"), ...globals }, { filename: file });
    return module.exports;
  }
  return load;
}
function clock(start = initialNow) {
  let now = start;
  return { Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }, advance(ms) { now += ms; }, now: () => now };
}
const rateBody = (rate = 5.1256, date = "2026-10-09 13:10:00.000") => ({ value: [{ cotacaoVenda: rate, dataHoraCotacao: date }] });
function rateFixture(options = {}) {
  const time = clock(options.now), requests = [];
  const load = loader({ env: options.env, globals: { Date: time.Date, fetch: async (url, init) => {
    requests.push({ url, init });
    return options.response ? options.response(requests.length) : Response.json(options.body ?? rateBody());
  } } });
  return { rate: load("src/lib/credit-exchange.ts"), requests, time };
}
function signedReceipt(patch = {}) {
  const payload = Buffer.from(JSON.stringify({ usdBrlRate: 5.1256, exchangeRateDate: "2026-10-09", userId: "buyer", expiresAt: initialNow + 900000, ...patch })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(`credit-purchase-v1:${payload}`).digest("base64url")}`;
}

test("BCB quote reads only the official rate endpoint, coalesces reads and caches a valid current rate", async () => {
  const f = rateFixture();
  const values = await Promise.all([f.rate.getUsdBrlRate(), f.rate.getUsdBrlRate(), f.rate.getUsdBrlRate()]);
  assert.equal(f.requests.length, 1);
  assert.equal(values[0].usdBrlRate, 5.1256); assert.equal(values[0].exchangeRateDate, "2026-10-09");
  const request = f.requests[0], url = new URL(request.url);
  assert.equal(url.origin, "https://olinda.bcb.gov.br");
  assert.equal(url.searchParams.get("$orderby"), "dataHoraCotacao desc"); assert.equal(url.searchParams.get("$top"), "1");
  assert.equal(request.url.includes("+"), false); assert.equal(request.init.redirect, "error"); assert.equal(request.init.cache, "no-store");
  await f.rate.getUsdBrlRate(); assert.equal(f.requests.length, 1);
  f.time.advance(3600001); await f.rate.getUsdBrlRate(); assert.equal(f.requests.length, 2);
});

test("BCB validation rejects malformed rates, stale/future/impossible dates and unsuccessful responses", async () => {
  for (const body of [null, {}, { value: [] }, rateBody(true), rateBody("5.1256"), rateBody(0), rateBody(-1), rateBody(101), rateBody(NaN), rateBody(5, "bad"), rateBody(5, "2026-10-10"), rateBody(5, "2026-09-30")]) {
    const f = rateFixture({ response: async () => Response.json(body) });
    await assert.rejects(() => f.rate.getUsdBrlRate(), /Cotação do dólar indisponível/);
  }
  const impossible = rateFixture({ now: Date.parse("2026-03-02T12:00:00Z"), body: rateBody(5, "2026-02-30") });
  await assert.rejects(() => impossible.rate.getUsdBrlRate(), /Cotação do dólar indisponível/);
  const failed = rateFixture({ response: async count => count === 1 ? new Response("provider unavailable", { status: 503 }) : Response.json(rateBody()) });
  await assert.rejects(() => failed.rate.getUsdBrlRate(), /Cotação do dólar indisponível/);
  assert.equal((await failed.rate.getUsdBrlRate()).usdBrlRate, 5.1256); assert.equal(failed.requests.length, 2);
});

test("purchase quote binds the user, FX rate and expiration; tampering and invalid signed data fail", async () => {
  const f = rateFixture(), quote = await f.rate.quoteCreditPurchase("buyer");
  const receipt = f.rate.readCreditPurchaseQuote(quote.token, "buyer");
  assert.equal(receipt.usdBrlRate, 5.1256); assert.equal(receipt.expiresAt, initialNow + 900000);
  assert.throws(() => f.rate.readCreditPurchaseQuote(quote.token, "other"), /Cotação inválida/);
  const [payload, sig] = quote.token.split(".");
  const altered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url")), usdBrlRate: 0.01 })).toString("base64url");
  for (const token of [`${altered}.${sig}`, quote.token + ".extra", quote.token + "x", "x".repeat(4097), null,
    signedReceipt({ usdBrlRate: true }), signedReceipt({ usdBrlRate: 0 }), signedReceipt({ expiresAt: "tomorrow" }), signedReceipt({ exchangeRateDate: "2026-10-10" })]) {
    assert.throws(() => f.rate.readCreditPurchaseQuote(token, "buyer"), /Cotação inválida/);
  }
  f.time.advance(900000);
  assert.throws(() => f.rate.readCreditPurchaseQuote(quote.token, "buyer"), f.rate.CreditQuoteExpiredError);
  f.time.advance(9 * 86400000);
  assert.throws(() => f.rate.readCreditPurchaseQuote(quote.token, "buyer"), f.rate.CreditQuoteExpiredError);
});

const nonce = "11111111-1111-4111-8111-111111111111";
function orderId(key = nonce, userId = "buyer") {
  const hex = createHash("sha256").update(`${userId}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function form(patch = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ packId: "credits-100", requestKey: nonce, quoteToken: signedReceipt(), name: "Fixture Buyer", cpf: "529.982.247-25", phone: "(11) 99999-9999", ...patch })) data.set(key, value);
  return data;
}
function checkoutFixture(options = {}) {
  const time = clock(), rows = new Map(), submissions = [], writes = [], checks = [];
  const load = loader({ globals: { Date: time.Date }, mocks: {
    "@/lib/auth": { requireUser: async () => ({ id: "buyer", email: "buyer@example.test" }) },
    "@/lib/commerce": {
      getOrder: async id => options.hidePrior ? undefined : rows.get(id),
      getSystemSettings: async () => ({ checkoutEnabled: options.enabled !== false }),
      creditTopupsReady: async () => { checks.push("ready"); return options.ready !== false; },
      createOrderOnce: async order => { writes.push(order); const prior = rows.get(order.id); if (prior) return { order: prior, created: false }; rows.set(order.id, order); return { order, created: true }; },
      attachPayment: async (id, patch) => { const next = { ...rows.get(id), ...patch }; rows.set(id, next); return next; },
    },
    "@/lib/syncpay": {
      syncPayConfigured: () => options.configured !== false,
      isUuid: value => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value),
      validCpf: value => value === "52998224725",
      createPix: async (order, customer) => { submissions.push({ order: structuredClone(order), customer }); if (options.pixError) throw new Error("sensitive upstream response"); return { referenceId: "22222222-2222-4222-8222-222222222222", pixCode: "fixture-pix" }; },
    },
    "@/lib/rate-limit": { rateLimit: async () => { checks.push("limit"); return options.rateLimited !== true; } },
  } });
  return { actions: load("src/app/actions/billing.ts"), packs: load("src/lib/credit-packs.ts"), time, rows, submissions, writes, checks };
}

test("checkout calculates every package and BRL amount on the server and ignores forged client prices", async () => {
  for (const pack of checkoutFixture().packs.CREDIT_PACKS) {
    const f = checkoutFixture();
    const result = await f.actions.createCreditCheckoutAction(null, form({ packId: pack.id, credits: "999999", amountCents: "1", usdAmountCents: "1", usdBrlRate: "0.00001", userId: "other", email: "attacker@example.test" }));
    assert.equal(result.order.kind, "credits"); assert.equal(result.order.status, "pending");
    assert.equal(result.order.userId, "buyer"); assert.equal(result.order.credits, pack.credits);
    assert.equal(result.order.usdAmountCents, pack.credits * 10); assert.equal(result.order.usdBrlRate, 5.1256);
    assert.equal(result.order.amountCents, Math.round(pack.credits * 10 * 5.1256));
    assert.equal(result.order.exchangeRateDate, "2026-10-09"); assert.equal(result.order.planId, undefined);
    assert.equal(f.submissions.length, 1); assert.equal(f.submissions[0].customer.email, "buyer@example.test");
    assert.equal(f.submissions[0].customer.cpf, "52998224725");
  }
  const invalid = checkoutFixture();
  assert.ok((await invalid.actions.createCreditCheckoutAction(null, form({ packId: "credits-999999" }))).error);
  assert.equal(invalid.submissions.length, 0); assert.equal(invalid.writes.length, 0);
});

test("same nonce produces one immutable order and one PIX, including replay after FX expiration", async () => {
  const f = checkoutFixture();
  const [a, b] = await Promise.all([f.actions.createCreditCheckoutAction(null, form()), f.actions.createCreditCheckoutAction(null, form())]);
  assert.equal(a.order.id, b.order.id); assert.equal(f.rows.size, 1); assert.equal(f.submissions.length, 1);
  f.time.advance(16 * 60000);
  const replay = await f.actions.createCreditCheckoutAction(null, form());
  assert.equal(replay.order.id, a.order.id); assert.equal(replay.order.amountCents, 5126); assert.equal(f.submissions.length, 1);
  const expired = await f.actions.createCreditCheckoutAction(null, form({ requestKey: "33333333-3333-4333-8333-333333333333" }));
  assert.equal(expired.quoteExpired, true); assert.equal(expired.order, undefined); assert.equal(f.submissions.length, 1);
  f.time.advance(9 * 86400000);
  const old = await f.actions.createCreditCheckoutAction(null, form({ requestKey: "44444444-4444-4444-8444-444444444444" }));
  assert.equal(old.quoteExpired, true); assert.equal(old.order, undefined); assert.equal(f.submissions.length, 1);
  assert.equal((await f.actions.createCreditCheckoutAction(null, form())).order.id, a.order.id);
});

test("credit checkout fails closed until settings, gateway and settlement migration are ready", async () => {
  for (const options of [{ ready: false }, { enabled: false }, { configured: false }, { rateLimited: true }]) {
    const f = checkoutFixture(options), result = await f.actions.createCreditCheckoutAction(null, form());
    assert.ok(result.error); assert.equal(result.order, undefined); assert.equal(f.submissions.length, 0); assert.equal(f.writes.length, 0);
  }
});

test("foreign or tampered quotes and invalid payer inputs cannot create orders or submit PIX", async () => {
  for (const patch of [{ quoteToken: signedReceipt({ userId: "other" }) }, { quoteToken: signedReceipt() + "x" }, { cpf: "00000000000" }, { phone: "123" }, { name: "X" }, { requestKey: "bad" }]) {
    const f = checkoutFixture(), result = await f.actions.createCreditCheckoutAction(null, form(patch));
    assert.ok(result.error); assert.equal(f.writes.length, 0); assert.equal(f.submissions.length, 0);
    assert.doesNotMatch(result.error, /secret|upstream/);
  }
});

test("plan and top-up nonce collisions are rejected both on lookup and after a concurrent insertion", async () => {
  for (const hidePrior of [false, true]) {
    const credit = checkoutFixture({ hidePrior });
    credit.rows.set(orderId(), { id: orderId(), userId: "buyer", planId: "starter", status: "pending" });
    assert.match((await credit.actions.createCreditCheckoutAction(null, form())).error, /Pedido inválido/);
    assert.equal(credit.submissions.length, 0);
    const plan = checkoutFixture({ hidePrior });
    plan.rows.set(orderId(), { id: orderId(), userId: "buyer", kind: "credits", packId: "credits-100", status: "pending" });
    assert.match((await plan.actions.createCheckoutAction(null, form({ planId: "starter" }))).error, /Pedido inválido/);
    assert.equal(plan.submissions.length, 0);
    const otherPack = checkoutFixture({ hidePrior });
    otherPack.rows.set(orderId(), { id: orderId(), userId: "buyer", kind: "credits", packId: "credits-50", status: "pending" });
    assert.match((await otherPack.actions.createCreditCheckoutAction(null, form())).error, /Pedido inválido/);
    assert.equal(otherPack.submissions.length, 0);
  }
});

test("an uncertain PIX response remains reviewable and cannot be resubmitted by replaying its nonce", async () => {
  const f = checkoutFixture({ pixError: true });
  const result = await f.actions.createCreditCheckoutAction(null, form());
  assert.equal(result.order.status, "review"); assert.doesNotMatch(result.order.error, /sensitive|upstream/);
  const replay = await f.actions.createCreditCheckoutAction(null, form());
  assert.equal(replay.order.id, result.order.id); assert.equal(f.submissions.length, 1);
});
