"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "mi-theme-v2";
const EVENT = "mi-theme-change";
type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
  const storageTheme = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    applyTheme(event.newValue === "dark" ? "dark" : "light");
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", storageTheme);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", storageTheme);
  };
}

function getTheme(): Theme { return document.documentElement.dataset.theme === "dark" ? "dark" : "light"; }

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "light" ? "Ativar tema claro" : "Ativar tema escuro";
  return <button type="button" className="theme-toggle" data-compact={compact} title={label} aria-label={label}
    onClick={() => { try { localStorage.setItem(KEY, next); } catch { /* Mantém a troca sem armazenamento. */ } applyTheme(next); }}>
    {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    {!compact ? <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span> : null}
  </button>;
}
