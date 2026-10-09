import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const componentCode = compile("../src/components/publish-center.tsx");
const captionModule = { exports: {} };
vm.runInNewContext(compile("../src/lib/publish-caption.ts"), { module: captionModule, exports: captionModule.exports });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const suggestion = (caption = "Legenda melhorada", videoId = "video-1") => ({ videoId, caption, alternatives: [{ label: "Principal", caption }, { label: "Direta", caption: "Outra melhoria" }], keywords: ["personagem"], hashtags: [], goal: "comments", source: { kind: "video-context", title: "Cena real" }, method: "ai", generatedAt: 1, notice: "Revise antes de publicar." });
const textOf = element => typeof element === "string" || typeof element === "number" ? String(element) : Array.isArray(element) ? element.map(textOf).join("") : element?.props ? textOf(element.props.children) : "";
function walk(element, predicate) {
  if (Array.isArray(element)) return element.flatMap(child => walk(child, predicate));
  if (!element?.props) return [];
  return [...(predicate(element) ? [element] : []), ...walk(element.props.children, predicate)];
}

/** Run the actual editor handlers/effects with local hooks and deferred actions; no network or publication. */
function editor() {
  let cursor = 0;
  let tree;
  let timerId = 0;
  const slots = [];
  const pendingEffects = [];
  const timers = new Map();
  const prepareCalls = [];
  const improveCalls = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, value => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }];
    },
    useRef(value) {
      const index = cursor++;
      slots[index] ??= { current: value };
      return slots[index];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        pendingEffects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
    startTransition: callback => callback(),
  };
  const loaded = { exports: {} };
  vm.runInNewContext(componentCode, {
    module: loaded, exports: loaded.exports,
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(id) {
      if (id === "react") return hooks;
      if (id === "react/jsx-runtime" || id === "lucide-react") return require(id);
      if (id === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
      if (id === "@/lib/publish-caption") return captionModule.exports;
      if (id === "./video-preview" || id === "./instagram-post-insights") return {};
      if (id === "@/app/actions/publication-assistant") return {
        preparePublicationAction(input) { const call = { input, ...deferred() }; prepareCalls.push(call); return call.promise; },
        improvePublicationAction(input) { const call = { input, ...deferred() }; improveCalls.push(call); return call.promise; },
      };
      if (id.startsWith("@/") || id.startsWith("next/") || id.endsWith(".css")) return {};
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  const props = { initialAccounts: [], initialPosts: [], videos: [{ id: "video-1", name: "Cena 1", resultUrl: "https://example.test/1.mp4", kind: "motion" }, { id: "video-2", name: "Cena 2", resultUrl: "https://example.test/2.mp4", kind: "motion" }], tiktokOAuth: false, instagramOAuth: false, preselectVideoId: "video-1", flash: null };
  const render = () => { cursor = 0; tree = loaded.exports.PublishCenter(props); pendingEffects.splice(0).forEach(effect => effect()); return tree; };
  const find = predicate => walk(tree, predicate);
  const button = label => {
    const result = find(element => element.type === "button" && textOf(element) === label)[0];
    assert.ok(result, `Missing button: ${label}`);
    return result;
  };
  const click = label => { const element = button(label); assert.equal(Boolean(element.props.disabled), false, `Disabled: ${label}`); element.props.onClick(); render(); };
  const change = (id, value) => { const element = find(item => item.props.id === id)[0]; assert.ok(element, `Missing field: ${id}`); element.props.onChange({ target: { value } }); render(); };
  render(); render();
  return {
    render, find, button, click, change, prepareCalls, improveCalls,
    caption: () => find(element => element.props.id === "pub-caption")[0]?.props.value,
    text: () => textOf(tree),
    async settle(call, result) { call.resolve(result); for (let i = 0; i < 5; i++) await Promise.resolve(); render(); },
    timeout() { const callbacks = [...timers.values()].filter(timer => timer.ms === 80_000); timers.clear(); callbacks.forEach(timer => timer.callback()); render(); },
    close() { const dialog = find(element => element.props.titleId === "composer-title")[0]; assert.ok(dialog); dialog.props.onClose(); render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test("improvement requires a valid caption and an explicit click, without double dispatch", () => {
  const ui = editor();
  assert.equal(ui.improveCalls.length, 0);
  assert.equal(ui.button("Melhorar post").props.disabled, true);
  ui.change("pub-caption", "x".repeat(2201));
  assert.equal(ui.button("Melhorar post").props.disabled, true);
  ui.change("pub-caption", "Minha legenda");
  const click = ui.button("Melhorar post").props.onClick;
  click(); click(); ui.render();
  assert.equal(ui.improveCalls.length, 1);
  assert.equal(ui.improveCalls[0].input.caption, "Minha legenda");
  assert.equal(ui.caption(), "Minha legenda");
  ui.unmount();
});

test("late automatic preparation cannot replace an improvement or the current caption", async () => {
  const ui = editor();
  ui.change("pub-caption", "Meu texto");
  ui.click("Melhorar post");
  await ui.settle(ui.prepareCalls[0], { suggestion: suggestion("Automática atrasada") });
  assert.equal(ui.caption(), "Meu texto");
  await ui.settle(ui.improveCalls[0], { suggestion: suggestion() });
  assert.equal(ui.caption(), "Meu texto", "Preview must not automatically apply");
  assert.match(ui.text(), /Sugestão de melhoria/);
  assert.match(ui.text(), /Revise antes de publicar/);
  ui.click("Descartar");
  assert.equal(ui.caption(), "Meu texto");
  assert.doesNotMatch(ui.text(), /Sugestão de melhoria/);
  ui.unmount();
});

test("typing during improvement is preserved; applying and undoing restore the latest text", async () => {
  const ui = editor();
  ui.change("pub-caption", "Texto enviado"); ui.click("Melhorar post");
  ui.change("pub-caption", "Edição durante a melhoria");
  await ui.settle(ui.improveCalls[0], { suggestion: suggestion() });
  assert.equal(ui.caption(), "Edição durante a melhoria");
  assert.match(ui.text(), /Você editou a legenda/);
  ui.click("Direta");
  assert.equal(ui.caption(), "Edição durante a melhoria", "Changing preview alternatives must not apply them");
  ui.click("Aplicar melhoria");
  assert.equal(ui.caption(), "Outra melhoria");
  ui.click("Desfazer melhoria");
  assert.equal(ui.caption(), "Edição durante a melhoria");
  ui.unmount();
});

test("edits after applying an improvement disable undo so newer text cannot be discarded", async () => {
  const ui = editor();
  ui.change("pub-caption", "Meu texto"); ui.click("Melhorar post");
  await ui.settle(ui.improveCalls[0], { suggestion: suggestion() });
  ui.click("Aplicar melhoria");
  const staleUndo = ui.button("Desfazer melhoria").props.onClick;
  ui.change("pub-caption", "Minha edição posterior");
  staleUndo(); ui.render();
  assert.equal(ui.caption(), "Minha edição posterior");
  assert.equal(ui.find(element => element.type === "button" && textOf(element) === "Desfazer melhoria").length, 0);
  ui.unmount();
});

test("changing goal invalidates an in-flight improvement and hides an existing preview", async () => {
  const ui = editor();
  ui.change("pub-caption", "Meu texto"); ui.click("Melhorar post");
  ui.change("pub-goal", "saves");
  await ui.settle(ui.improveCalls[0], { suggestion: suggestion("Resposta antiga") });
  assert.equal(ui.caption(), "Meu texto");
  assert.doesNotMatch(ui.text(), /Sugestão de melhoria|Resposta antiga/);
  ui.click("Melhorar post");
  assert.equal(ui.improveCalls[1].input.goal, "saves");
  await ui.settle(ui.improveCalls[1], { suggestion: suggestion() });
  ui.change("pub-goal", "shares");
  assert.doesNotMatch(ui.text(), /Sugestão de melhoria/);
  ui.unmount();
});

test("timeout and action errors preserve the caption, and late results cannot reopen the preview", async () => {
  const ui = editor();
  ui.change("pub-caption", "Meu texto"); ui.click("Melhorar post");
  ui.timeout();
  assert.match(ui.text(), /A melhoria demorou/);
  await ui.settle(ui.improveCalls[0], { suggestion: suggestion() });
  assert.equal(ui.caption(), "Meu texto");
  assert.doesNotMatch(ui.text(), /Sugestão de melhoria/);
  ui.click("Tentar melhoria novamente");
  await ui.settle(ui.improveCalls[1], { error: "Serviço indisponível" });
  assert.match(ui.text(), /Serviço indisponível/);
  assert.equal(ui.caption(), "Meu texto");
  ui.unmount();
});

test("changing video or platform invalidates improvement responses for the previous context", async () => {
  for (const change of [ui => ui.change("pub-video", "video-2"), ui => ui.click("TikTok")]) {
    const ui = editor();
    ui.change("pub-caption", "Meu texto"); ui.click("Melhorar post");
    change(ui);
    await ui.settle(ui.improveCalls[0], { suggestion: suggestion("Melhoria antiga") });
    assert.equal(ui.caption(), "Meu texto");
    assert.doesNotMatch(ui.text(), /Sugestão de melhoria|Melhoria antiga/);
    ui.unmount();
  }
});

test("a closed and reopened composer ignores the old improvement even for the same video", async () => {
  const ui = editor();
  ui.change("pub-caption", "Meu texto"); ui.click("Melhorar post");
  ui.close();
  ui.click("Nova publicação");
  await ui.settle(ui.improveCalls[0], { suggestion: suggestion("Melhoria antiga") });
  assert.equal(ui.caption(), "");
  assert.doesNotMatch(ui.text(), /Sugestão de melhoria|Melhoria antiga/);
  ui.unmount();
});

test("an improvement returned for another video is not offered", async () => {
  const ui = editor();
  ui.change("pub-caption", "Meu texto"); ui.click("Melhorar post");
  await ui.settle(ui.improveCalls[0], { suggestion: suggestion("Outro vídeo", "video-2") });
  assert.equal(ui.caption(), "Meu texto");
  assert.match(ui.text(), /Não foi possível conferir a melhoria/);
  assert.doesNotMatch(ui.text(), /Sugestão de melhoria/);
  ui.unmount();
});
