import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL("../src/components/published-post-editor.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const snapshot = (changes = {}) => ({ postId: "post-1", videoId: "video-1", platform: "instagram", currentCaption: "  Legenda original\n\n#Teste  ", revision: "r1", permalink: "https://www.instagram.com/reel/ABC_12/", canSync: true, canImprove: true, ...changes });
const suggestion = (changes = {}) => ({ videoId: "video-1", caption: "Uma sugestão melhor", alternatives: [{ label: "Direta", caption: "Melhoria direta" }], keywords: ["cena"], hashtags: [], goal: "comments", source: { title: "Referência", kind: "video-context" }, method: "ai", generatedAt: 1, ...changes });
const textOf = element => typeof element === "string" || typeof element === "number" ? String(element) : Array.isArray(element) ? element.map(textOf).join("") : element?.props ? textOf(element.props.children) : "";
function walk(element, predicate) {
  if (Array.isArray(element)) return element.flatMap(child => walk(child, predicate));
  if (!element?.props) return [];
  return [...(predicate(element) ? [element] : []), ...walk(element.props.children, predicate)];
}

function harness() {
  let cursor = 0;
  let tree;
  let timerId = 0;
  let closed = 0;
  const slots = [];
  const effects = [];
  const timers = new Map();
  const calls = { get: [], save: [], sync: [], improve: [], copied: [], synced: [] };
  const action = kind => input => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    calls[kind].push({ input, resolve });
    return promise;
  };
  const hooks = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === "function" ? initial() : initial }; return [slots[index].value, value => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }]; },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useEffect(effect, deps) { const index = cursor++; const old = slots[index]; if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) { slots[index] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); }); } },
    startTransition: callback => callback(),
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, URL,
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    navigator: { clipboard: { async writeText(text) { calls.copied.push(text); } } },
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime" || id === "lucide-react") return require(id);
      if (id === "@/app/actions/published-post-editor") return { getPublishedPostEditorAction: action("get"), savePublishedCaptionDraftAction: action("save"), syncPublishedPostCaptionAction: action("sync") };
      if (id === "@/app/actions/publication-assistant") return { improvePublicationAction: action("improve") };
      if (id === "@/lib/publish-caption") return { CAPTION_LIMIT: 2200, CAPTION_GOALS: { comments: { label: "Conversar" }, saves: { label: "Salvar" } } };
      if (id === "@/lib/display-date") return { displayDateTime: () => "09/10, 14:00" };
      if (id.endsWith(".css")) return {};
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  const inner = module.exports.PublishedPostEditor({ postId: "post-1", onClose: () => { closed++; }, onSynced: editor => calls.synced.push(editor) });
  function render() { cursor = 0; tree = inner.type(inner.props); tree.props.ref.current = { showModal() {}, close() {} }; effects.splice(0).forEach(effect => effect()); return tree; }
  const find = predicate => walk(tree, predicate);
  const button = label => { const result = find(element => element.type === "button" && (textOf(element) === label || element.props["aria-label"] === label))[0]; assert.ok(result, `Missing button: ${label}`); return result; };
  const click = label => { const target = button(label); assert.equal(Boolean(target.props.disabled), false, `Disabled button: ${label}`); target.props.onClick(); render(); };
  const change = (id, value) => { const target = find(element => element.props.id === id)[0]; assert.ok(target); target.props.onChange({ target: { value } }); render(); };
  render(); render();
  return {
    render, find, button, click, change, calls, safeUrl: module.exports.publishedInstagramUrl,
    caption: () => find(element => element.props.id === "published-caption")[0]?.props.value,
    text: () => textOf(tree), closed: () => closed,
    async settle(kind, result, index = calls[kind].length - 1) { calls[kind][index].resolve(result); for (let i = 0; i < 5; i++) await Promise.resolve(); render(); },
    timeout() { const current = [...timers.values()]; timers.clear(); current.forEach(timer => timer.callback()); render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test("opening reads local data without AI, synchronizing or publishing and preserves caption whitespace", async () => {
  const ui = harness();
  assert.equal(ui.calls.get.length, 1);
  await ui.settle("get", { editor: snapshot() });
  assert.equal(ui.caption(), snapshot().currentCaption);
  assert.equal(ui.calls.improve.length, 0);
  assert.equal(ui.calls.sync.length, 0);
  assert.equal(ui.calls.synced.length, 0);
  assert.match(ui.text(), /A legenda é aplicada no Instagram/);
  assert.match(ui.text(), /Legenda registrada na publicação/);
  assert.doesNotMatch(ui.text(), /Publicar agora|Agendar publicação|Salvar no Instagram/);
  ui.unmount();
});

test("a saved draft, including an empty draft, is resumed without changing the recorded caption", async () => {
  for (const caption of ["  Rascunho salvo\n", ""]) {
    const ui = harness();
    await ui.settle("get", { editor: snapshot({ draft: { caption, baseCaption: "Anterior", updatedAt: 1 } }) });
    assert.equal(ui.caption(), caption);
    assert.match(ui.text(), /Legenda original/);
    assert.equal(ui.calls.save.length, 0);
    ui.unmount();
  }
});

test("improvement is explicit and review-only; apply and undo retain edits made while it was running", async () => {
  const ui = harness();
  await ui.settle("get", { editor: snapshot() });
  ui.click("Melhorar post");
  assert.equal(ui.calls.improve[0].input.caption, snapshot().currentCaption);
  ui.change("published-caption", "Texto digitado enquanto espera");
  await ui.settle("improve", { suggestion: suggestion() });
  assert.equal(ui.caption(), "Texto digitado enquanto espera");
  ui.click("Direta");
  assert.equal(ui.caption(), "Texto digitado enquanto espera");
  ui.click("Aplicar melhoria");
  assert.equal(ui.caption(), "Melhoria direta");
  ui.click("Desfazer melhoria");
  assert.equal(ui.caption(), "Texto digitado enquanto espera");
  assert.equal(ui.calls.save.length, 0);
  assert.equal(ui.calls.sync.length, 0);
  ui.unmount();
});

test("saving preserves newer typing and never reports that Instagram was updated", async () => {
  const ui = harness();
  await ui.settle("get", { editor: snapshot() });
  ui.change("published-caption", "  Texto enviado\n");
  ui.click("Salvar edição no sistema");
  assert.equal(ui.calls.save[0].input.caption, "  Texto enviado\n");
  assert.equal(ui.calls.save[0].input.baseRevision, "r1");
  ui.change("published-caption", "Mais uma alteração");
  await ui.settle("save", { editor: snapshot({ revision: "r2", draft: { caption: "  Texto enviado\n", baseCaption: snapshot().currentCaption, updatedAt: 2 } }) });
  assert.equal(ui.caption(), "Mais uma alteração");
  assert.match(ui.text(), /alterações mais recentes/);
  assert.equal(ui.calls.synced.length, 0);
  assert.equal(ui.calls.sync.length, 0);
  ui.unmount();
});

test("only an explicit successful sync updates the parent and preserves the local editor", async () => {
  const ui = harness();
  await ui.settle("get", { editor: snapshot() });
  ui.change("published-caption", "Meu rascunho");
  ui.click("Conferir alteração");
  ui.change("published-caption", "Edição durante conferência");
  const current = snapshot({ currentCaption: "Texto realmente lido no Instagram", checkedAt: 123, revision: "r2" });
  await ui.settle("sync", { editor: current });
  assert.equal(ui.caption(), "Edição durante conferência");
  assert.equal(ui.calls.synced.length, 1);
  assert.equal(ui.calls.synced[0], current);
  assert.match(ui.text(), /Texto realmente lido no Instagram/);
  assert.match(ui.text(), /Legenda conferida no Instagram/);
  ui.unmount();
});

test("checking an unchanged caption does not claim that a change was applied", async () => {
  const ui = harness();
  await ui.settle("get", { editor: snapshot() });
  ui.click("Conferir alteração");
  await ui.settle("sync", { editor: snapshot({ checkedAt: 123, revision: "r2" }) });
  assert.match(ui.text(), /A legenda do sistema confere com a do Instagram/);
  assert.doesNotMatch(ui.text(), /Alteração confirmada/);
  ui.change("published-caption", "Texto revisado");
  ui.click("Conferir alteração");
  await ui.settle("sync", { editor: snapshot({ currentCaption: "Texto revisado", checkedAt: 124, revision: "r3" }) });
  assert.match(ui.text(), /Alteração confirmada no Instagram/);
  ui.unmount();
});

test("revision conflicts can reload the latest snapshot without discarding manual text", async () => {
  const ui = harness();
  await ui.settle("get", { editor: snapshot() });
  ui.change("published-caption", "Meu rascunho"); ui.click("Salvar edição no sistema");
  await ui.settle("save", { error: "Outra aba alterou o rascunho", conflict: true });
  ui.click("Recarregar dados sem apagar meu texto");
  await ui.settle("get", { editor: snapshot({ revision: "r3", draft: { caption: "Outra aba", baseCaption: "Anterior", updatedAt: 3 } }) });
  assert.equal(ui.caption(), "Meu rascunho");
  assert.match(ui.text(), /Outra aba/);
  ui.click("Salvar edição no sistema");
  assert.equal(ui.calls.save[1].input.baseRevision, "r3");
  ui.unmount();
});

test("timeout, closing, changing goal and mismatched posts ignore late or unrelated responses", async () => {
  const ui = harness();
  await ui.settle("get", { editor: snapshot() });
  ui.click("Melhorar post"); ui.change("published-goal", "saves");
  await ui.settle("improve", { suggestion: suggestion() });
  assert.doesNotMatch(ui.text(), /Sugestão de melhoria/);
  ui.click("Melhorar post"); ui.timeout();
  await ui.settle("improve", { suggestion: suggestion() });
  assert.doesNotMatch(ui.text(), /Sugestão de melhoria/);
  ui.click("Conferir alteração");
  await ui.settle("sync", { editor: snapshot({ postId: "another-post", currentCaption: "Não usar" }) });
  assert.equal(ui.calls.synced.length, 0);
  assert.equal(ui.caption(), snapshot().currentCaption);
  ui.click("Conferir alteração"); ui.click("Fechar edição");
  await ui.settle("sync", { editor: snapshot({ currentCaption: "Resposta após fechar" }) });
  assert.equal(ui.calls.synced.length, 0);
  assert.equal(ui.closed(), 1);
  ui.unmount();
});

test("offline accounts and deleted videos retain manual draft editing without AI or sync", async () => {
  const ui = harness();
  await ui.settle("get", { editor: snapshot({ canSync: false, canImprove: false, connectionMessage: "Reconecte para conferir." }) });
  assert.equal(ui.button("Melhorar post").props.disabled, true);
  assert.equal(ui.button("Conferir alteração").props.disabled, true);
  ui.change("published-caption", "");
  ui.click("Copiar legenda");
  assert.deepEqual(ui.calls.copied, [""]);
  ui.click("Salvar edição no sistema");
  assert.equal(ui.calls.save[0].input.caption, "");
  assert.equal(ui.calls.improve.length, 0);
  assert.equal(ui.calls.sync.length, 0);
  ui.unmount();
});

test("Instagram links accept only canonical HTTPS post paths", () => {
  const ui = harness();
  assert.equal(ui.safeUrl("https://www.instagram.com/reel/ABC_1/?utm=test#fragment"), "https://www.instagram.com/reel/ABC_1/");
  for (const url of ["https://instagram.com.evil.test/reel/a/", "javascript:alert(1)", "https://user:pass@instagram.com/p/a/", "http://instagram.com/p/a/", "https://instagram.com:444/p/a/", "https://instagram.com/accounts/login/", "/reel/a/"]) assert.equal(ui.safeUrl(url), undefined);
  ui.unmount();
});
