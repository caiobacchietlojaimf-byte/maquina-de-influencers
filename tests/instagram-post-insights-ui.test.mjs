import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL("../src/components/instagram-post-insights.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const text = item => Array.isArray(item) ? item.map(text).join("") : item?.props ? text(item.props.children) : typeof item === "string" || typeof item === "number" ? String(item) : "";
const walk = (item, predicate) => Array.isArray(item) ? item.flatMap(child => walk(child, predicate)) : !item?.props ? [] : [...(predicate(item) ? [item] : []), ...walk(item.props.children, predicate)];
function ui() {
  let cursor = 0, tree, timerId = 0;
  const slots = [], effects = [], timers = new Map(), calls = [];
  const hooks = {
    useId: () => "panel-1", startTransition: fn => fn(),
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === "function" ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i]; },
    useEffect(fn) { const i = cursor++; if (!slots[i]) { slots[i] = {}; effects.push(() => { slots[i].cleanup = fn(); }); } },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(code, {
    module: loaded, exports: loaded.exports, Date,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime" || id === "lucide-react") return require(id);
      if (id === "@/lib/display-date") return { displayDateTime: () => "hoje" };
      if (id.endsWith(".css")) return {};
      if (id === "@/app/actions/publication-assistant") return { getInstagramPostInsightsAction(postId) { let resolve; const promise = new Promise(done => { resolve = done; }); calls.push({ postId, resolve }); return promise; } };
      throw new Error(`Unexpected dependency ${id}`);
    },
  });
  const render = () => { cursor = 0; tree = loaded.exports.InstagramPostInsights({ postId: "post-1" }); effects.splice(0).forEach(fn => fn()); };
  const find = predicate => walk(tree, predicate);
  const button = label => { const item = find(node => node.type === "button" && text(node).trim() === label)[0]; assert.ok(item, `Missing ${label}`); return item; };
  const click = label => { button(label).props.onClick(); render(); };
  render();
  return { calls, find, button, click, render, text: () => text(tree),
    async settle(index, value) { calls[index].resolve(value); for (let i = 0; i < 5; i++) await Promise.resolve(); render(); },
    timeout() { [...timers.values()].forEach(fn => fn()); timers.clear(); render(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
  };
}
const result = overrides => ({ postId: "post-1", status: "ready", checkedAt: Date.now(), metrics: { likes: 0, comments: 12 }, metricsAvailable: ["likes", "comments"], message: "Dados da Meta.", ...overrides });

test("per-post metrics only load on demand and repeated opening reuses fresh data", async () => {
  const view = ui(); assert.equal(view.calls.length, 0);
  view.click("Insights"); view.click("Insights"); view.click("Insights");
  assert.equal(view.calls.length, 1); assert.equal(view.calls[0].postId, "post-1");
  await view.settle(0, result());
  view.click("Insights"); view.click("Insights"); assert.equal(view.calls.length, 1);
  assert.equal(view.button("Insights").props["aria-expanded"], true);
  view.unmount();
});
test("missing metrics stay missing while actual zero remains visible", async () => {
  const view = ui(); view.click("Insights"); await view.settle(0, result());
  const values = view.find(item => item.type === "dd").map(text);
  assert.deepEqual(values, ["—", "—", "0", "12", "—", "—"]);
  assert.match(view.text(), /Dados da Meta/); view.unmount();
});
test("a timeout stops loading and ignores a late response after a fresh request", async () => {
  const view = ui(); view.click("Insights"); view.timeout();
  assert.match(view.text(), /A consulta demorou/); view.click("Tentar novamente");
  await view.settle(0, result({ metrics: { likes: 999 } })); assert.doesNotMatch(view.text(), /999/);
  await view.settle(1, result({ metrics: { likes: 7 } })); assert.match(view.text(), /Curtidas7/); view.unmount();
});
test("wrong post responses and unavailable connections never show a metrics grid", async () => {
  const view = ui(); view.click("Insights"); await view.settle(0, result({ postId: "someone-else" }));
  assert.match(view.text(), /Não foi possível consultar/); assert.equal(view.find(item => item.type === "dd").length, 0);
  view.click("Tentar novamente"); await view.settle(1, result({ status: "disconnected", message: "Conecte seu Instagram.", metrics: {} }));
  assert.match(view.text(), /Conecte seu Instagram/); assert.equal(view.find(item => item.type === "dd").length, 0); view.unmount();
});
test("unmount invalidates in-flight responses", async () => {
  const view = ui(); view.click("Insights"); view.unmount(); await view.settle(0, result({ metrics: { likes: 555 } }));
  assert.equal(view.find(item => item.type === "dd").length, 0);
});
