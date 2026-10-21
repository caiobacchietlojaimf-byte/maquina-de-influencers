/* Formatação compartilhada pelas três áreas de Explorar virais (cliente e servidor). */

import { displayDateTime } from "./display-date";

export type ExplorePlatform = "tiktok" | "instagram" | "youtube" | "url";

export const PLATFORM_LABEL: Record<ExplorePlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  url: "Link",
};

/** Sempre "mm:ss" (ou "h:mm:ss"), nunca segundos com casas decimais. */
export function durationLabel(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return hours ? `${hours}:${mmss}` : mmss;
}

/** Tempo relativo curto em português; depois de um dia mostra a data. */
export function relativeTime(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return displayDateTime(timestamp, "short");
}
