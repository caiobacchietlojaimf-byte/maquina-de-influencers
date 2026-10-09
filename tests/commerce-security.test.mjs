import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url), root = fileURLToPath(new URL("..", import.meta.url));
function loader({ env = {}, mocks = {}, globals = {} } = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require(id) {
      if (id in mocks) return mocks[id];
      if (id === "server-only" || id === "@supabase/supabase-js") return {};
      if (id.startsWith("./")) return load(path.resolve(path.dirname(file), `${id}.ts`));
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      return require(id);
    }, process: { env, cwd: () => root }, Buffer, URL, URLSearchParams, AbortSignal, Response, Request, FormData, fetch: () => assert.fail("No real payment/network request is permitted"), setTimeout, clearTimeout, console, ...globals }, { filename: file });
    return module.exports;
  }
  return load;
}
const reference = "12345678-1234-1234-1234-123456789012";
const orderId = "22222222-1234-1234-1234-123456789012";
function cleanup(directory) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.match(path.basename(directory), /^mi-(?:commerce|credit-debt)-test-/);
  rmSync(directory, { recursive: true });
}
const json = body => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const paymentEnv = { SYNCPAY_CLIENT_ID: "fixture-id", SYNCPAY_CLIENT_SECRET: "fixture-secret", SYNCPAY_WEBHOOK_SECRET: "fixture-webhook" };

test("concurrent paid/refunded notifications cannot resurrect a refunded order in the local driver", async () => {
  for (const sequence of [["refunded", "paid"], ["paid", "refunded"]]) {
    const directory = mkdtempSync(path.join(tmpdir(), "mi-commerce-test-"));
    try {
      const load = loader({ env: { DATA_DIR: directory } }), db = load("src/lib/db.ts"), commerce = load("src/lib/commerce.ts");
      const user = await db.createUser({ name: "Fixture", email: "test@example.invalid", passwordHash: "disabled", salt: "disabled", credits: 0 });
      await commerce.createOrderOnce({ id: orderId, userId: user.id, planId: "starter", amountCents: 9700, credits: 1500, status: "creating", createdAt: 1, updatedAt: 1 });
      await commerce.attachPayment(orderId, { status: "pending", referenceId: reference, pixCode: "fixture" });
      await Promise.all(sequence.map(status => commerce.settleOrder(reference, status, 9700)));
      assert.equal((await commerce.getOrder(orderId)).status, "refunded");
      assert.equal((await db.findUserById(user.id)).credits, 0);
      await commerce.settleOrder(reference, "paid", 9700);
      assert.equal((await db.findUserById(user.id)).credits, 0);
      assert.equal((await commerce.getOrder(orderId)).status, "refunded");
    } finally { cleanup(directory); }
  }
});

test("a failed generation refund preserves the remaining debt from a refunded plan", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mi-credit-debt-test-"));
  try {
    const db = loader({ env: { DATA_DIR: directory } })("src/lib/db.ts");
    const user = await db.createUser({ name: "Fixture", email: "test@example.invalid", passwordHash: "disabled", salt: "disabled", credits: 0 });
    await db.grantPlanCredits(user.id, orderId, "max", 7500, Date.now());
    assert.equal(await db.reserveVideoCredits(user.id, 6000), true);
    await db.grantPlanCredits(user.id, orderId, "max", 7500, Date.now(), true);
    assert.equal((await db.findUserById(user.id)).credits, -6000);
    assert.equal(await db.adjustCredits(user.id, 1000), -5000);
    assert.equal(await db.reserveVideoCredits(user.id, 1000), false);
  } finally { cleanup(directory); }
});

test("payment HMAC covers the exact body and rejects changed or expired notifications", () => {
  const api = loader()("src/lib/syncpay.ts");
  const now = 1800000000000, t = String(now / 1000), body = '{"status":"paid"}';
  const signature = `t=${t},v1=${createHmac("sha256", "webhook-secret").update(`${t}.${body}`).digest("hex")}`;
  assert.equal(api.verifySyncPaySignature(body, signature, "webhook-secret", now), true);
  assert.equal(api.verifySyncPaySignature(body + " ", signature, "webhook-secret", now), false);
  assert.equal(api.verifySyncPaySignature(body, signature, "wrong-secret", now), false);
  assert.equal(api.verifySyncPaySignature(body, signature, "webhook-secret", now + 301000), false);
  assert.equal(api.verifySyncPaySignature(body, null, "webhook-secret", now), false);
});

test("credit settlement only trusts the authenticated seller lookup and matching BRL PIX amount", async () => {
  for (const wrong of [{ amount: 1 }, { currency: "USD" }, { reference_id: orderId }, { payment_method: "card" }]) {
    let settled = 0;
    const api = loader({ env: paymentEnv, mocks: { "./commerce": { findOrderByReference: async () => ({ amountCents: 9700 }), settleOrder: async () => { settled++; } } }, globals: { fetch: async url => url.endsWith("auth-token") ? json({ access_token: "fixture-token", expires_in: 300 }) : json({ data: { transaction: { reference_id: reference, currency: "BRL", amount: 97, payment_method: "pix", status: "completed", ...wrong } } }) } })("src/lib/syncpay.ts");
    await assert.rejects(api.reconcilePayment(reference));
    assert.equal(settled, 0);
  }
  let args;
  const api = loader({ env: paymentEnv, mocks: { "./commerce": { findOrderByReference: async () => ({ amountCents: 9700 }), settleOrder: async (...values) => { args = values; } } }, globals: { fetch: async url => url.endsWith("auth-token") ? json({ access_token: "fixture-token" }) : json({ data: { transaction: { reference_id: reference, currency: "BRL", amount: 97, payment_method: "pix", status: "completed" } } }) } })("src/lib/syncpay.ts");
  await api.reconcilePayment(reference);
  assert.deepEqual(args, [reference, "paid", 9700]);
});

test("the unauthenticated payment webhook rejects forgery before any lookup", async () => {
  let lookups = 0;
  const load = loader({ env: paymentEnv });
  const signature = load("src/lib/syncpay.ts").verifySyncPaySignature;
  const route = loader({ env: paymentEnv, mocks: { "@/lib/syncpay": { isUuid: () => true, verifySyncPaySignature: signature, reconcilePayment: async () => lookups++ } } })("src/app/api/payments/syncpay/webhook/route.ts");
  const response = await route.POST(new Request("https://app.example/webhook", { method: "POST", body: JSON.stringify({ event: "transaction.updated", transaction: { reference_id: reference, status: "completed", amount: 97 } }) }));
  assert.equal(response.status, 401); assert.equal(lookups, 0);
});

test("admin authorization depends on server allowlist, never a client/user role property", async () => {
  let current = { id: "attacker", role: "admin", isAdmin: true };
  const api = loader({ env: { ADMIN_USER_IDS: "authorized-user" }, mocks: { "./auth": { currentUser: async () => current }, "next/navigation": { notFound() { throw new Error("not-found"); } } } })("src/lib/admin.ts");
  assert.equal(api.isAdmin(current), false);
  await assert.rejects(api.requireAdmin(), /not-found/);
  current = { id: "authorized-user" }; assert.equal((await api.requireAdmin()).id, "authorized-user");
  current = null; await assert.rejects(api.requireAdmin(), /not-found/);
});

test("checkout ignores client prices/credits and only submits a request key once", async () => {
  let stored, paidCalls = 0;
  const api = loader({ mocks: {
    "@/lib/auth": { requireUser: async () => ({ id: "user", email: "fixture@example.invalid" }) },
    "@/lib/commerce": { getSystemSettings: async () => ({ checkoutEnabled: true }), getOrder: async () => stored, createOrderOnce: async order => { stored = order; return { order, created: true }; }, attachPayment: async (_id, patch) => stored = { ...stored, ...patch } },
    "@/lib/syncpay": { isUuid: value => /^[\w-]{36}$/.test(value), validCpf: () => true, syncPayConfigured: () => true, createPix: async order => { paidCalls++; assert.equal(order.amountCents, 9700); assert.equal(order.credits, 1500); return { referenceId: reference, pixCode: "fixture-pix" }; } },
    "@/lib/rate-limit": { rateLimit: async () => true },
  } })("src/app/actions/billing.ts");
  const form = new FormData();
  for (const [key, value] of Object.entries({ planId: "starter", requestKey: orderId, name: "Fixture Name", cpf: "12345678909", phone: "11999999999", amountCents: "1", credits: "99999999", userId: "attacker" })) form.set(key, value);
  const first = await api.createCheckoutAction(null, form), second = await api.createCheckoutAction(null, form);
  assert.equal(first.order.userId, "user"); assert.equal(second.order.id, first.order.id); assert.equal(paidCalls, 1);
});
