/* Regras de exibição da biblioteca "Meus vídeos" (cliente e servidor):
   mapeamento dos estados reais, rótulos, duração e filtros combinados.
   Nada aqui altera o vídeo; só interpreta o registro existente. */

import type { Video, VideoKind } from "./db";

/** Agrupamento dos estados reais para os filtros da biblioteca. */
export type LibraryStatus = "generating" | "completed" | "failed" | "review";

export const LIBRARY_STATUS_LABEL: Record<LibraryStatus, string> = {
  generating: "Em geração",
  completed: "Concluídos",
  failed: "Com falha",
  review: "Revisão",
};

export const KIND_LABEL: Record<VideoKind, string> = { motion: "Movimento", viral: "Viral", custom: "Personalizado" };

export function libraryStatus(video: Pick<Video, "status">): LibraryStatus {
  if (video.status === "queued" || video.status === "processing") return "generating";
  if (video.status === "review") return "review";
  if (video.status === "failed") return "failed";
  return "completed";
}

/** Etiqueta curta do cartão. Geração concluída nunca vira "Publicado". */
export function statusLabel(video: Pick<Video, "status" | "edit" | "finalizationStartedAt">, finalizing = false): string {
  if (finalizing) return "Finalizando";
  switch (libraryStatus(video)) {
    case "generating": return video.finalizationStartedAt ? "Finalizando" : "Gerando";
    case "completed": return "Concluído";
    case "review": return "Precisa de revisão";
    default: return video.edit?.cancelledAt ? "Cancelado" : "Falhou";
  }
}

export function videoTitle(video: Pick<Video, "presetName" | "kind" | "edit">): string {
  if (video.presetName) return video.presetName;
  if (video.edit) return "Troca de personagem";
  return video.kind === "viral" ? "Efeito viral" : video.kind === "motion" ? "Movimento" : "Vídeo";
}

/** Duração real do resultado (segundos); ausente quando o registro não a informa. */
export function resultDuration(video: Pick<Video, "edit" | "status">): number | undefined {
  const duration = video.edit?.result?.duration;
  return typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

/** Sempre "mm:ss" (ou "h:mm:ss"). */
export function durationLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return hours ? `${hours}:${mmss}` : mmss;
}

/** Download só quando existe um resultado final confirmado. */
export function canDownload(video: Pick<Video, "status" | "resultUrl">): boolean {
  return video.status === "completed" && Boolean(video.resultUrl);
}

/** Resultado aberto para revisão: existe arquivo, mas não é o vídeo completo confirmado. */
export function hasReviewResult(video: Pick<Video, "status" | "resultUrl">): boolean {
  return video.status === "review" && Boolean(video.resultUrl);
}

/** Aviso que precisa ficar visível fora da aba de informações. */
export function videoWarning(video: Pick<Video, "status" | "error" | "edit" | "polling">): string | undefined {
  if (video.error) return video.error;
  if (video.status === "review") return "Este resultado precisa de revisão antes de ser tratado como vídeo completo.";
  if (video.status === "failed") return video.edit?.cancelledAt ? "Geração cancelada por você." : "A geração falhou.";
  if (video.polling?.error) return video.polling.error;
  return undefined;
}

export type LibraryFilters = {
  status: "all" | LibraryStatus;
  kind: "all" | VideoKind;
  influencerId: string;
  query: string;
  sort: "newest" | "oldest";
};

export const DEFAULT_FILTERS: LibraryFilters = { status: "all", kind: "all", influencerId: "", query: "", sort: "newest" };

export function activeFilterCount(filters: LibraryFilters): number {
  return [filters.status !== "all", filters.kind !== "all", filters.influencerId !== "", filters.query.trim() !== ""].filter(Boolean).length;
}

export function filterVideos<T extends Video>(videos: T[], filters: LibraryFilters, titleOf: (video: T) => string = videoTitle): T[] {
  const query = filters.query.trim().toLocaleLowerCase("pt-BR");
  return videos
    .filter((video) => filters.status === "all" || libraryStatus(video) === filters.status)
    .filter((video) => filters.kind === "all" || video.kind === filters.kind)
    .filter((video) => !filters.influencerId || video.influencerId === filters.influencerId)
    .filter((video) => !query || titleOf(video).toLocaleLowerCase("pt-BR").includes(query))
    .sort((a, b) => (filters.sort === "oldest" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt));
}

export function countByStatus(videos: Pick<Video, "status">[]): Record<LibraryStatus, number> {
  const counts: Record<LibraryStatus, number> = { generating: 0, completed: 0, failed: 0, review: 0 };
  for (const video of videos) counts[libraryStatus(video)] += 1;
  return counts;
}
