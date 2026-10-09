import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id in mocks ? mocks[id] : require(id), ...globals });
  return module.exports;
}
const plans = load("src/lib/plans.ts");
const displayDates = load("src/lib/display-date.ts");
const order = (status = "pending", values = {}) => ({ id: "order-1", userId: "owner", planId: "pro", amountCents: 19700, credits: 3500, status, createdAt: 100, updatedAt: 100, ...values });
const children = node => Array.isArray(node) ? node.flatMap(children) : node && typeof node === "object" ? [node, ...children(node.props?.children)] : [];
const text = node => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props?.children) : node === false || node == null ? "" : String(node);
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

// Run the real component handlers with a tiny hook host; transport is always mocked.
// This covers order/nonce races without browser automation or payment credentials.
function fixture(initial = {}, actions = {}) {
  const slots = [], effects = [], submissions = [];
  let cursor = 0, dirty = false, uuid = 0, refreshes = 0, tree;
  let props = { name: "Test User", orders: [], enabled: true, currentPlan: null, ...initial };
  const hooks = {
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof value === "function" ? value() : value;
      return [slots[index], next => { const value = typeof next === "function" ? next(slots[index]) : next; dirty ||= !Object.is(value, slots[index]); slots[index] = value; }];
    },
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useMemo(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: callback() };
      return slots[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) { slots[index] = { deps }; effects.push(callback); }
    },
  };
  class FormDataFixture {
    constructor(values) { this.values = new Map(Object.entries(values ?? {})); }
    set(key, value) { this.values.set(key, value); }
    get(key) { return this.values.get(key); }
  }
  const { BillingCenter } = load("src/components/billing-center.tsx", {
    react: hooks,
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "next/link": "a",
    "@/lib/plans": plans,
    "@/lib/display-date": displayDates,
    "./commerce.module.css": {},
    "@/app/actions/billing": {
      createCheckoutAction: async (_, payload) => { submissions.push(payload); return actions.create?.(payload) ?? { order: order() }; },
      refreshPaymentAction: async id => actions.refresh?.(id) ?? { order: order() },
    },
  }, { FormData: FormDataFixture, crypto: { randomUUID: () => { if (actions.uuidError) throw new Error("Unavailable"); return `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`; } }, requestAnimationFrame: callback => callback() });
  function render(patch = {}) {
    props = { ...props, ...patch };
    for (let count = 0; count < 10; count++) {
      cursor = 0; dirty = false; tree = BillingCenter(props);
      for (const effect of effects.splice(0)) effect();
      if (!dirty) return tree;
    }
    throw new Error("Unexpected effect loop");
  }
  render();
  return {
    render, submissions, get refreshes() { return refreshes; },
    nodes: () => children(tree), text: () => text(tree),
    button: label => children(tree).find(node => node.type === "button" && text(node).includes(label)),
    plans: () => children(tree).filter(node => node.type === "button" && "aria-pressed" in node.props),
    form: () => children(tree).find(node => node.type === "form"),
    key: () => children(tree).find(node => node.props?.name === "requestKey")?.props.value,
    submit: () => children(tree).find(node => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: { name: "Test User", cpf: "52998224725", phone: "11999999999" } }),
  };
}

test("plan query navigation updates the selection without replacing an open order", () => {
  const ui = fixture({ currentPlan: "starter" });
  assert.equal(ui.plans()[0].props["aria-pressed"], true);
  ui.render({ initialPlan: "max" });
  assert.equal(ui.plans()[2].props["aria-pressed"], true);
  ui.render({ orders: [order("pending")], initialPlan: "starter" });
  assert.equal(ui.plans()[1].props["aria-pressed"], true);
  assert.ok(ui.plans().every(node => node.props.disabled));
  assert.equal(ui.form(), undefined);
});

test("a double submit makes one checkout and locks every plan until it resolves", async () => {
  let finish;
  const ui = fixture({}, { create: () => new Promise(resolve => { finish = resolve; }) });
  const submitAgain = ui.form().props.onSubmit;
  const pending = ui.submit();
  ui.render();
  assert.ok(ui.plans().every(node => node.props.disabled));
  await submitAgain({ preventDefault() {}, currentTarget: {} });
  assert.equal(ui.submissions.length, 1);
  finish({ order: order() }); await pending; ui.render();
  assert.match(ui.text(), /Aguardando pagamento/);
  assert.equal(ui.form(), undefined);
});

test("a lost checkout response keeps the exact payload and nonce for confirmation", async () => {
  let count = 0;
  const ui = fixture({}, { create: () => { if (!count++) throw new Error("Network lost"); return { order: order() }; } });
  const key = ui.key();
  await ui.submit(); ui.render();
  assert.match(ui.text(), /conexão foi interrompida/);
  assert.ok(ui.button("Conferir esta solicitação"));
  assert.ok(ui.plans().every(node => node.props.disabled));
  assert.ok(ui.nodes().filter(node => ["name", "cpf", "phone"].includes(node.props?.name)).every(node => node.props.disabled));
  assert.equal(ui.key(), key);
  await ui.submit(); ui.render();
  assert.equal(ui.submissions.length, 2);
  assert.equal(ui.submissions[0], ui.submissions[1]);
  assert.equal(ui.submissions[1].get("requestKey"), key);
  assert.equal(ui.form(), undefined);
});

test("a refresh connection failure remains accessible and preserves the existing order", async () => {
  const ui = fixture({ orders: [order()] }, { refresh: async () => { throw new Error("Offline"); } });
  ui.button("conferir pagamento").props.onClick();
  await new Promise(resolve => setImmediate(resolve)); ui.render();
  const alert = ui.nodes().find(node => node.props?.role === "alert");
  assert.match(text(alert), /Seu pedido foi mantido/);
  assert.equal(ui.form(), undefined);
  assert.ok(ui.plans().every(node => node.props.disabled));
  assert.equal(ui.button("conferir pagamento").props.disabled, false);
});

test("confirmed failed payment permits an explicit fresh nonce and latest chosen plan", async () => {
  const ui = fixture({}, { create: () => ({ order: order("failed") }) });
  const originalKey = ui.key();
  await ui.submit(); ui.render({ initialPlan: "max" });
  assert.equal(ui.form(), undefined);
  ui.button("Escolher outro plano / novo pedido").props.onClick(); ui.render();
  assert.ok(ui.form());
  assert.notEqual(ui.key(), originalKey);
  assert.ok(ui.plans().every(node => !node.props.disabled));
  assert.equal(ui.plans()[2].props["aria-pressed"], true);
});

test("review directs to support and cannot create another charge", () => {
  const ui = fixture({ orders: [order("review")], supportEmail: "support@example.test" });
  assert.equal(ui.form(), undefined);
  assert.equal(ui.button("novo pedido"), undefined);
  assert.ok(ui.plans().every(node => node.props.disabled));
  assert.match(ui.text(), /antes de criar outra cobrança/);
  assert.ok(ui.nodes().some(node => node.props?.href?.startsWith("mailto:support@example.test")));
  assert.equal(ui.submissions.length, 0);
});

test("viewing a historical paid or refunded order does not trap plan selection", () => {
  for (const status of ["paid", "refunded"]) {
    const ui = fixture({ orders: [order(status)] });
    ui.button("Ver pedido").props.onClick(); ui.render();
    assert.equal(ui.form(), undefined);
    assert.ok(ui.plans().every(node => node.props.disabled));
    ui.button("Voltar aos planos").props.onClick(); ui.render();
    assert.ok(ui.form());
    assert.ok(ui.plans().every(node => !node.props.disabled));
    assert.equal(ui.submissions.length, 0);
  }
});

test("missing secure nonce disables checkout and gives a recoverable error", () => {
  const ui = fixture({}, { uuidError: true });
  assert.equal(ui.button("Gerar PIX").props.disabled, true);
  assert.match(ui.text(), /Recarregue a página/);
  assert.equal(ui.submissions.length, 0);
});
