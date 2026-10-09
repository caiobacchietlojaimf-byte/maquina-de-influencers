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
const pages = load("src/components/learning-pages.tsx", {
  "next/link": ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children),
  "./learning-pages.module.css": {},
});
const plans = load("src/lib/plans.ts");
const userWithPlan = (planId, expiresAt = Date.now() + 86_400_000) => ({ planGrants: { fixture: { planId, startsAt: Date.now() - 1000, expiresAt, credits: 0 } } });
async function renderPage(file, user, admin = false) {
  const page = load(file, { "@/lib/auth": { currentUser: async () => user }, "@/lib/admin": { isAdmin: () => admin }, "@/lib/plans": plans, "@/components/learning-pages": pages });
  return renderToStaticMarkup(await page.default());
}

test("written course materials are absent from the server HTML without an active Pro or Max plan", async () => {
  for (const user of [null, userWithPlan("starter"), userWithPlan("pro", Date.now() - 1000)]) {
    const html = await renderPage("src/app/app/modulos/page.tsx", user);
    assert.match(html, /Continue aprendendo no Pro ou Max/);
    assert.match(html, /Uma identidade que você consegue repetir/);
    assert.doesNotMatch(html, /Um personagem reconhecível precisa de poucas decisões fortes/);
    assert.doesNotMatch(html, /Modelo para adaptar/);
    assert.doesNotMatch(html, /<pre>/);
  }
});

test("an administrator can review all learning material without a paid plan", async () => {
  const user = { id: "local-admin" };
  const modules = await renderPage("src/app/app/modulos/page.tsx", user, true);
  assert.equal((modules.match(/<details/g) ?? []).length, 5);
  assert.doesNotMatch(modules, /Continue aprendendo no Pro ou Max/);
  const unlimited = await renderPage("src/app/app/criacao-ilimitada/page.tsx", user, true);
  assert.match(unlimited, /O que você pode preparar agora/);
  assert.match(unlimited, /As aulas gravadas ainda não estão disponíveis/);
  assert.doesNotMatch(unlimited, /<video|<iframe/);
});

test("active Pro and Max plans render every written guide and exercise", async () => {
  for (const planId of ["pro", "max"]) {
    const html = await renderPage("src/app/app/modulos/page.tsx", userWithPlan(planId));
    assert.equal((html.match(/<details/g) ?? []).length, 5);
    assert.equal((html.match(/Seu exercício/g) ?? []).length, 5);
    assert.equal((html.match(/<pre>/g) ?? []).length, 5);
    assert.doesNotMatch(html, /Continue aprendendo no Pro ou Max/);
  }
});

test("the future GPU course states its availability and never renders a fake lesson player", async () => {
  for (const user of [null, userWithPlan("starter"), userWithPlan("pro"), userWithPlan("max")]) {
    const html = await renderPage("src/app/app/criacao-ilimitada/page.tsx", user);
    assert.match(html, /As aulas gravadas ainda não estão disponíveis/);
    assert.match(html, /não inclui geração infinita no estúdio nem GPU gratuita/);
    assert.doesNotMatch(html, /<video|<iframe/);
    assert.equal(html.includes("O que você pode preparar agora"), plans.getUserEntitlements(user).unlimitedCreation);
  }
});
