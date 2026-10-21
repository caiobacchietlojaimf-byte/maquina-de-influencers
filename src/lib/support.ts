/** Contato padrão; o admin pode trocar o e-mail exibido dentro do app nas configurações. */
export const DEFAULT_SUPPORT_EMAIL = "pulsecoding2026@gmail.com";

export const supportMailto = (email: string, subject: string, body = "") =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
