"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

/* Copia um modelo de texto e avisa o resultado de forma acessível (aria-live).
   Quando a API de área de transferência não está disponível, tenta a cópia por
   seleção; se nada funcionar, informa a falha em vez de fingir sucesso. */

function copyBySelection(text: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch { return false; }
}
export function CopyModelButton({ text, label = "Copiar modelo", className }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    let done = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); done = true; }
    } catch { /* tenta o caminho alternativo abaixo */ }
    if (!done) done = copyBySelection(text);
    setState(done ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  };

  return (
    <span className={className}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
        {state === "copied" ? <Check size={15} aria-hidden="true" /> : state === "failed" ? <TriangleAlert size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
        {state === "copied" ? "Modelo copiado" : state === "failed" ? "Não foi possível copiar" : label}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? "Modelo copiado para a área de transferência." : state === "failed" ? "Não foi possível copiar. Selecione o texto e copie manualmente." : ""}
      </span>
    </span>
  );
}
