/** One platform credit represents US$ 0.10 of generation balance. */
export const CREDITS_PER_USD = 10;
export const CREDIT_PRICING_VERSION = "usd-10-v1";

/** Debit whole credits, rounding a positive generation estimate upwards. */
export function usdToCredits(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("Valor em dólares inválido.");
  const credits = Math.max(1, Math.ceil(usd * CREDITS_PER_USD - 1e-9));
  if (!Number.isSafeInteger(credits)) throw new Error("Valor em dólares inválido.");
  return credits;
}

export function creditsToUsd(credits: number): number {
  if (!Number.isFinite(credits) || !Number.isSafeInteger(credits)) throw new Error("Valor de créditos inválido.");
  return credits / CREDITS_PER_USD;
}
