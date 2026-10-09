import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const previewCode = compile("../src/components/video-preview.tsx");
const galleryCode = compile("../src/components/videos-gallery.tsx");
const styles = new Proxy({}, { get: (_, property) => property === "__esModule" ? false : String(property) });
function load(code, overrides = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, ...globals, require(id) {
    if (id in overrides) return overrides[id];
    if (id === "react" || id === "react/jsx-runtime" || id === "lucide-react") return require(id);
    if (id.endsWith(".css")) return styles;
    throw new Error(`Unexpected dependency: ${id}`);
  } });
  return module.exports;
}
function walk(element, predicate) {
  if (Array.isArray(element)) return element.flatMap(child => walk(child, predicate));
  if (!element?.props) return [];
  return [...(predicate(element) ? [element] : []), ...walk(element.props.children, predicate)];
}
const props = { videoId: "video-1", src: "https://media.test/result.mp4", title: "Meu vídeo" };

test("server rendering a cover or preview never emits a video resource before a play click", () => {
  const components = load(previewCode);
  for (const component of [components.VideoCover, components.VideoPreview]) {
    const html = renderToStaticMarkup(createElement(component, props));
    assert.doesNotMatch(html, /<video\b|<source\b|result\.mp4|preload=/);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /src="\/api\/videos\/video-1\/thumbnail"/);
  }
  const html = renderToStaticMarkup(createElement(components.VideoPreview, props));
  assert.match(html, /<button[^>]+aria-label="Reproduzir Meu vídeo"/);
});

test("gallery requests only actual result covers and keeps originals and segments unloaded", () => {
  const components = load(previewCode);
  const gallery = load(galleryCode, {
    "@/components/video-preview": components,
    "next/link": ({ href, children, ...rest }) => createElement("a", { href, ...rest }, children),
    "@/app/actions/videos": {},
    "@/lib/character-edit": { editModelLabel: () => "Modelo" },
    "@/lib/finalize-edit-client": { canFinalizeExistingEdit: () => false },
    "@/lib/display-date": { displayDate: () => "10 out." },
  });
  const first = { id: "video-1", status: "completed", resultUrl: props.src, kind: "viral", createdAt: 1, thumbnailUrl: "https://media.test/old-reference.jpg", edit: { source: { duration: 18 }, result: { width: 720, height: 1280, duration: 18 }, model: "model", resolution: "720p", sourceUrl: "https://media.test/original.mp4", target: "Personagem", segments: [{ sourceUrl: "part1", resultUrl: "https://media.test/part1.mp4", source: { duration: 9 } }, { sourceUrl: "part2", resultUrl: "https://media.test/part2.mp4", source: { duration: 9 } }] } };
  const second = { ...first, id: "video-2", edit: undefined, resultUrl: "https://media.test/result2.mp4", thumbnailUrl: "https://media.test/actual-result.jpg", thumbnailSourceUrl: "https://media.test/result2.mp4" };
  const html = renderToStaticMarkup(createElement(gallery.VideosGallery, { initialVideos: [first, second] }));
  assert.doesNotMatch(html, /<video\b|<source\b|preload="metadata"|old-reference\.jpg/);
  assert.match(html, /src="\/api\/videos\/video-1\/thumbnail"/);
  assert.match(html, /src="https:\/\/media.test\/actual-result.jpg"/);
  assert.match(html, /Reproduzir Original/);
  assert.match(html, /Reproduzir Resultado do trecho 1/);
});

/** Exercise component event handlers and timeout cleanup without browser/network media. */
function harness(exportName, input = props, imageState = () => ({ complete: false, naturalWidth: 0 })) {
  let cursor = 0;
  let timerId = 0;
  let tree;
  let previousVideoKey;
  const slots = [];
  const effects = [];
  const timers = new Map();
  const media = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, value => { slots[index].value = typeof value === "function" ? value(slots[index].value) : value; }];
    },
    useRef(initial) { const index = cursor++; slots[index] ??= { current: initial }; return slots[index]; },
    useEffect(effect, deps) {
      const index = cursor++;
      const old = slots[index];
      if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) {
        slots[index] = { deps, cleanup: old?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const component = load(previewCode, { react: hooks }, {
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const inner = component[exportName](input);
  function render() {
    cursor = 0; tree = inner.type(inner.props);
    const image = walk(tree, element => element.type === "img")[0];
    if (image?.props.ref) image.props.ref.current = imageState(image.props.src);
    const player = walk(tree, element => element.type === "video")[0];
    if (player && player.key !== previousVideoKey) {
      const element = { paused: 0, removed: [], loaded: 0, focused: 0, pause() { this.paused++; }, removeAttribute(name) { this.removed.push(name); }, load() { this.loaded++; }, focus() { this.focused++; } };
      player.props.ref.current = element;
      media.push(element);
      previousVideoKey = player.key;
    }
    effects.splice(0).forEach(effect => effect());
    return tree;
  }
  const find = predicate => walk(tree, predicate);
  render();
  return {
    render, find, media, timers,
    click() { const button = find(element => element.type === "button")[0]; assert.ok(button); button.props.onClick(); render(); },
    event(type, name) { const element = find(item => item.type === type)[0]; assert.ok(element, `Missing ${type}`); element.props[name](); render(); },
    fire(ms) { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.callback(); } render(); },
    state: () => tree.props["data-state"],
    coverLoaded: () => tree.props["data-loaded"],
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test("clicking play mounts one unmuted native player and unloads it when its preview closes", () => {
  const ui = harness("VideoPreview");
  assert.equal(ui.find(element => element.type === "video").length, 0);
  ui.click();
  const player = ui.find(element => element.type === "video")[0];
  assert.equal(player.props.src, props.src);
  assert.equal(player.props.controls, true);
  assert.equal(player.props.autoPlay, true);
  assert.notEqual(player.props.muted, true, "The original audio must remain enabled");
  assert.equal(ui.media[0].focused, 1);
  ui.event("video", "onLoadedData");
  assert.equal(ui.state(), "ready");
  assert.equal(ui.timers.size, 0);
  ui.unmount();
  assert.equal(ui.media[0].paused, 1);
  assert.deepEqual(ui.media[0].removed, ["src"]);
  assert.equal(ui.media[0].loaded, 1);
});

test("a stalled player stops within 30 seconds and requires an explicit retry", () => {
  const ui = harness("VideoPreview");
  ui.click();
  const lateReady = ui.find(element => element.type === "video")[0].props.onCanPlay;
  ui.fire(30_000);
  assert.equal(ui.state(), "error");
  assert.equal(ui.find(element => element.type === "video").length, 0);
  assert.equal(ui.media[0].paused, 1);
  lateReady(); ui.render();
  assert.equal(ui.state(), "error", "A late media event cannot hide the timeout");
  ui.click();
  assert.equal(ui.state(), "loading");
  assert.equal(ui.media.length, 2);
  lateReady(); ui.render();
  assert.equal(ui.state(), "loading", "Events from the previous player cannot mark a retry ready");
  ui.event("video", "onPlaying");
  assert.equal(ui.state(), "ready");
  ui.event("video", "onWaiting");
  assert.equal(ui.state(), "buffering");
  ui.fire(30_000);
  assert.equal(ui.state(), "error");
  ui.unmount();
});

test("media errors unload the file and retry never starts by itself", () => {
  const ui = harness("VideoPreview");
  ui.click();
  ui.event("video", "onError");
  assert.equal(ui.state(), "error");
  assert.equal(ui.timers.size, 0);
  assert.equal(ui.find(element => element.type === "video").length, 0);
  assert.equal(ui.find(element => element.type === "a")[0].props.href, props.src);
  ui.unmount();
});

test("cover failures retry the authenticated endpoint only twice, then keep a quiet fallback", () => {
  const ui = harness("VideoCover", { ...props, thumbnailUrl: "https://media.test/expired-cover.jpg" });
  ui.event("img", "onError");
  assert.equal(ui.find(element => element.type === "img").length, 0);
  ui.fire(1500);
  assert.equal(ui.find(element => element.type === "img")[0].props.src, "/api/videos/video-1/thumbnail?retry=1");
  ui.event("img", "onError");
  ui.fire(4000);
  assert.equal(ui.find(element => element.type === "img")[0].props.src, "/api/videos/video-1/thumbnail?retry=2");
  ui.event("img", "onError");
  assert.equal(ui.timers.size, 0);
  assert.equal(ui.find(element => element.type === "img" || element.type === "video").length, 0);
  assert.match(ui.find(element => element.props.role === "img")[0].props["aria-label"], /Capa indisponível/);
  ui.unmount();
});

test("unmounting a failed cover cancels queued retries", () => {
  const ui = harness("VideoCover");
  ui.event("img", "onError");
  assert.equal(ui.timers.size, 1);
  ui.unmount();
  assert.equal(ui.timers.size, 0);
});

test("a cached cover loaded before hydration becomes visible without receiving onLoad", () => {
  const ui = harness("VideoCover", props, () => ({ complete: true, naturalWidth: 360 }));
  ui.render();
  assert.equal(ui.coverLoaded(), true);
  assert.equal(ui.find(element => element.props.role === "img").length, 0, "The Film fallback must disappear");
  assert.equal(ui.find(element => element.type === "img").length, 1);
  assert.equal(ui.timers.size, 0);
  ui.unmount();
});

test("a cached image is detected after the cover retry changes its source", () => {
  const ui = harness("VideoCover", props, source => ({ complete: source.includes("retry="), naturalWidth: source.includes("retry=") ? 360 : 0 }));
  assert.equal(ui.coverLoaded(), false);
  ui.event("img", "onError");
  ui.fire(1500); ui.render();
  assert.equal(ui.coverLoaded(), true);
  assert.equal(ui.find(element => element.props.role === "img").length, 0);
  ui.unmount();
});

test("a completed but broken image never becomes a visible cover", () => {
  const ui = harness("VideoCover", props, () => ({ complete: true, naturalWidth: 0 }));
  ui.render();
  assert.equal(ui.coverLoaded(), false);
  assert.equal(ui.find(element => element.props.role === "img").length, 1);
  ui.unmount();
});
