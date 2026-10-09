"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "mi-theme-v1";
const EVENT = "mi-theme-change";
type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const systemTheme = () => {
    try { if (localStorage.getItem(KEY)) return; } catch { /* Preferência só nesta aba. */ }
    applyTheme(media.matches ? "light" : "dark");
  };
  const storageTheme = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    applyTheme(event.newValue === "light" || event.newValue === "dark" ? event.newValue : media.matches ? "light" : "dark");
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", storageTheme);
  media.addEventListener("change", systemTheme);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", storageTheme);
    media.removeEventListener("change", systemTheme);
  };
}

function getTheme(): Theme { return document.documentElement.dataset.theme === "light" ? "light" : "dark"; }

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark" as Theme);
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "light" ? "Ativar tema claro" : "Ativar tema escuro";
  return <button type="button" className="theme-toggle" data-compact={compact} title={label} aria-label={label}
    onClick={() => { try { localStorage.setItem(KEY, next); } catch { /* Mantém a troca sem armazenamento. */ } applyTheme(next); }}>
    {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    {!compact ? <span>{theme === "dark" ? "Tema claro" : "Tema escuro"}</span> : null}
  </button>;
}
