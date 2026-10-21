import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: id => id in mocks ? mocks[id] : require(id) });
  return module.exports;
}
const data = load("src/data/learning-modules.ts");
const pages = load("src/components/learning-pages.tsx", {
  "next/link": ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children),
  "./learning-pages.module.css": {},
  "./copy-model-button": { CopyModelButton: ({ text }) => React.createElement("button", { type: "button", "data-copy": text }, "Copiar modelo") },
  "./logo": { LogoMark: () => React.createElement("svg") },
  "@/data/learning-modules": data,
});
const plans = load("src/lib/plans.ts");
const userWithPlan = (planId, expiresAt = Date.now() + 86_400_000) => ({ planGrants: { fixture: { planId, startsAt: Date.now() - 1000, expiresAt, credits: 0 } } });
class NotFound extends Error {}
function loadPage(file, user, admin = false) {
  return load(file, { "@/lib/auth": { currentUser: async () => user }, "@/lib/admin": { isAdmin: () => admin }, "@/lib/plans": plans, "@/components/learning-pages": pages, "@/data/learning-modules": data, "next/navigation": { notFound: () => { throw new NotFound(); } } });
}
async function renderIndex(user, admin = false) { return renderToStaticMarkup(await loadPage("src/app/app/modulos/page.tsx", user, admin).default()); }
async function renderGuide(slug, user, admin = false) { return renderToStaticMarkup(await loadPage("src/app/app/modulos/[slug]/page.tsx", user, admin).default({ params: Promise.resolve({ slug }) })); }
const { LEARNING_MODULES } = data;
const CONTENT_SAMPLES = ["Um personagem reconhecível precisa de poucas decisões fortes", "Modelo para adaptar", "Seu exercício", "<pre>"];

test("the catalog keeps the five original guides with every text, list, model and exercise", () => {
  assert.equal(LEARNING_MODULES.length, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(LEARNING_MODULES.map((module) => module.title))), [
    "Uma identidade que você consegue repetir",
    "Uma referência melhor economiza tentativas",
    "Instruções claras para trocar o personagem",
    "Revisão antes de gastar de novo",
    "Transforme uma criação em uma série",
  ]);
  for (const module of LEARNING_MODULES) {
    assert.equal(module.paragraphs.length, 2);
    assert.ok(module.checklist.length >= 4);
    assert.ok(module.prompt.length > 100 && module.exercise.length > 60 && module.description.length > 20);
    assert.match(module.tool.href, /^\/app\/(influencers|virais|criar-videos|videos|publicar)$/);
    assert.match(module.cover, /^\/learn\/cover-[a-z]+\.svg$/);
  }
  assert.equal(new Set(LEARNING_MODULES.map((module) => module.slug)).size, 5);
});

test("without an active Pro or Max plan the index shows the trail and the cards, but no guide content", async () => {
  for (const user of [null, userWithPlan("starter"), userWithPlan("pro", Date.now() - 1000)]) {
    const html = await renderIndex(user);
    assert.match(html, /Aprenda\. Crie\. Evolua\./);
    assert.match(html, /Do personagem à primeira série/);
    assert.match(html, /Continue aprendendo no Pro ou Max/);
    assert.match(html, /Identidade do personagem/);
    assert.equal((html.match(/Guia escrito/g) ?? []).length, 5);
    for (const sample of CONTENT_SAMPLES) assert.doesNotMatch(html, new RegExp(sample));
    assert.doesNotMatch(html, /Abrir guia/, "locked users get no guide links");
    assert.doesNotMatch(html, /Começar trilha/);
    assert.match(html, /href="\/app\/planos"/);
    assert.match(html, /MÓDULO EXTRA · MAX/);
    assert.match(html, /Em preparação/);
    assert.match(html, /As aulas gravadas ainda não estão disponíveis/);
    assert.match(html, /href="\/app\/criacao-ilimitada"/);
    assert.doesNotMatch(html, /<video|<iframe/);
  }
});

test("a locked user cannot read a guide through its own route", async () => {
  for (const user of [null, userWithPlan("starter")]) {
    for (const module of LEARNING_MODULES) {
      const html = await renderGuide(module.slug, user);
      assert.match(html, new RegExp(module.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(html, /Continue aprendendo no Pro ou Max/);
      for (const text of [...module.paragraphs, ...module.checklist, module.exercise]) assert.equal(html.includes(text.slice(0, 40)), false, `content leaked: ${text.slice(0, 40)}`);
      assert.doesNotMatch(html, /<pre>|Copiar modelo|Colocar em prática/);
      assert.match(html, /href="\/app\/planos"/);
    }
  }
});

test("Pro, Max and administrators get the index with Começar trilha and an Abrir guia link per module", async () => {
  for (const [user, admin] of [[userWithPlan("pro"), false], [userWithPlan("max"), false], [{ id: "local-admin" }, true]]) {
    const html = await renderIndex(user, admin);
    assert.match(html, new RegExp(`href="/app/modulos/${LEARNING_MODULES[0].slug}"[^>]*>Começar trilha`));
    for (const module of LEARNING_MODULES) assert.match(html, new RegExp(`href="/app/modulos/${module.slug}"`));
    assert.equal((html.match(/aria-label="Abrir guia: /g) ?? []).length, 5);
    assert.doesNotMatch(html, /Continue aprendendo no Pro ou Max/);
    assert.doesNotMatch(html, /<pre>/, "the index never dumps the guide text");
    assert.match(html, /href="\/app\/criacao-ilimitada"/);
    assert.doesNotMatch(html, /Começar aula|Assistir/, "no lesson-player wording for the trail in preparation");
  }
});

test("each guide renders its full original content, the copy model, the practice link and prev/next navigation", async () => {
  for (const [user, admin] of [[userWithPlan("pro"), false], [userWithPlan("max"), false], [{ id: "local-admin" }, true]]) {
    for (const [index, module] of LEARNING_MODULES.entries()) {
      const html = await renderGuide(module.slug, user, admin);
      const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "(?:'|&#x27;)").replace(/"/g, "(?:\"|&quot;)");
      assert.match(html, new RegExp(`<h1>${escape(module.title)}</h1>`));
      for (const text of [...module.paragraphs, ...module.checklist, module.exercise, module.description]) assert.match(html, new RegExp(escape(text)), `missing: ${text.slice(0, 40)}`);
      assert.match(html, new RegExp(`<pre>${escape(module.prompt).replace(/\\n/g, "\n")}</pre>`));
      assert.match(html, new RegExp(`data-copy="${escape(module.prompt).replace(/\n/g, "(?:\n|&#10;)")}"`));
      assert.match(html, /Antes de seguir/);
      assert.match(html, /Modelo para adaptar/);
      assert.match(html, /Seu exercício/);
      assert.match(html, new RegExp(`href="${module.tool.href}"[^>]*>Colocar em prática`));
      assert.match(html, /href="\/app\/modulos"[^>]*>.*?Voltar aos módulos<\/a>/);
      if (index > 0) assert.match(html, new RegExp(`href="/app/modulos/${LEARNING_MODULES[index - 1].slug}"[^>]*rel="prev"`));
      else assert.doesNotMatch(html, /rel="prev"/);
      if (index < LEARNING_MODULES.length - 1) assert.match(html, new RegExp(`href="/app/modulos/${LEARNING_MODULES[index + 1].slug}"[^>]*rel="next"`));
      else assert.doesNotMatch(html, /rel="next"/);
      assert.doesNotMatch(html, /<video|<iframe/);
    }
  }
});

test("an unknown guide slug is a 404, never a blank or leaked page", async () => {
  await assert.rejects(renderGuide("nao-existe", userWithPlan("max")), NotFound);
});

test("the future GPU course states its availability and never renders a fake lesson player", async () => {
  for (const user of [null, userWithPlan("starter"), userWithPlan("pro"), userWithPlan("max")]) {
    const html = renderToStaticMarkup(await loadPage("src/app/app/criacao-ilimitada/page.tsx", user).default());
    assert.match(html, /As aulas gravadas ainda não estão disponíveis/);
    assert.match(html, /não inclui geração infinita no estúdio nem GPU gratuita/);
    assert.doesNotMatch(html, /<video|<iframe/);
    assert.equal(html.includes("O que você pode preparar agora"), plans.getUserEntitlements(user).unlimitedCreation);
    assert.match(html, /href="\/app\/modulos"[^>]*>.*?Voltar aos módulos<\/a>/);
  }
  const admin = renderToStaticMarkup(await loadPage("src/app/app/criacao-ilimitada/page.tsx", { id: "local-admin" }, true).default());
  assert.match(admin, /O que você pode preparar agora/);
});
