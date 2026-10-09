// Assemble display text ourselves: localized punctuation can differ between
// server and browser ICU versions even when locale and time zone are explicit.
export const DISPLAY_TIME_ZONE = "America/Sao_Paulo";
export type DisplayDateStyle = "numeric" | "short" | "long";

const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const shortMonths = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function dateParts(timestamp: number) {
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) return null;
  return Object.fromEntries(formatter.formatToParts(timestamp).map(part => [part.type, part.value]));
}

function dateText(parts: Record<string, string>, style: DisplayDateStyle) {
  const day = parts.day.padStart(2, "0"), month = parts.month.padStart(2, "0");
  if (style === "short") return `${day} de ${shortMonths[Number(month) - 1]}`;
  if (style === "long") return `${Number(day)} de ${months[Number(month) - 1]} de ${parts.year}`;
  return `${day}/${month}/${parts.year}`;
}

export function displayDate(timestamp: number, style: DisplayDateStyle = "numeric"): string {
  const parts = dateParts(timestamp);
  return parts ? dateText(parts, style) : "Data indisponível";
}

export function displayDateTime(timestamp: number, style: DisplayDateStyle = "numeric"): string {
  const parts = dateParts(timestamp);
  return parts ? `${dateText(parts, style)}, ${parts.hour.padStart(2, "0")}:${parts.minute.padStart(2, "0")}` : "Data indisponível";
}
