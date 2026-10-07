"use client";

import { useEffect, useState } from "react";

/* Sonda de renderização do construtor: depois da hidratação, mede um texto
   sentinela real do builder. Se ele existir no DOM mas estiver invisível
   (largura zero, cor igual ao fundo ou filtro aplicado), alguma extensão ou
   modo do navegador está reescrevendo a página — mostra um aviso objetivo
   em vez de deixar o usuário com barras vazias sem explicação. */

export function RenderProbe() {
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const span = document.querySelector<HTMLElement>(".trait-head span");
        if (!span) return;
        const style = getComputedStyle(span);
        const invisible =
          span.offsetWidth === 0 ||
          span.offsetHeight === 0 ||
          style.visibility === "hidden" ||
          style.display === "none" ||
          Number(style.opacity) < 0.05 ||
          style.fontSize === "0px";
        const html = document.documentElement;
        const darkened =
          html.hasAttribute("data-darkreader-mode") ||
          Boolean(document.querySelector("style.darkreader")) ||
          getComputedStyle(document.body).filter.includes("invert");
        const translated =
          html.classList.contains("translated-ltr") ||
          html.classList.contains("translated-rtl") ||
          Boolean(document.querySelector("font[face]"));

        if (invisible || darkened || translated) {
          const causes: string[] = [];
          if (darkened) causes.push("extensão de modo escuro (ex.: Dark Reader)");
          if (translated) causes.push("tradutor automático");
          if (!causes.length) causes.push("alguma extensão ou modo do navegador");
          setProblem(causes.join(" e "));
          console.warn("[maquina] builder ilegível:", {
            invisible,
            darkened,
            translated,
            spanW: span.offsetWidth,
            color: style.color,
            fontSize: style.fontSize,
            filter: getComputedStyle(document.body).filter,
          });
        }
      } catch {
        /* sonda nunca pode quebrar a página */
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  if (!problem) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 200,
        background: "#2a1313",
        border: "1px solid rgba(255,141,120,.5)",
        color: "#ffd9d1",
        borderRadius: 14,
        padding: "12px 16px",
        fontSize: 13,
        lineHeight: 1.5,
        boxShadow: "0 8px 30px rgba(0,0,0,.5)",
      }}
    >
      <b>O editor está sendo alterado pelo seu navegador.</b> Detectamos {problem} interferindo
      nesta página e apagando os textos do construtor. Desative para este site e recarregue —
      o app já é escuro e em português por padrão.
    </div>
  );
}
