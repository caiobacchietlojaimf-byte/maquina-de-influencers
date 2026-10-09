import { CREDITS_PER_USD } from "./credit-pricing";

export const CREDIT_PACKS = [50, 100, 250, 500].map(credits => ({
  id: `credits-${credits}`,
  credits,
  usdAmountCents: credits * 100 / CREDITS_PER_USD,
}));
export function getCreditPack(value: unknown) { return CREDIT_PACKS.find(pack => pack.id === value); }
export type CreditPurchaseQuote = { token: string; usdBrlRate: number; exchangeRateDate: string; expiresAt: number };
