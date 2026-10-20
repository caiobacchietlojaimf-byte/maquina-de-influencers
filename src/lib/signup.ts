import "server-only";

/** Créditos iniciais de contas novas (cadastro por senha ou Google). */
export function initialCredits(): number {
  const parsed = Number(process.env.INITIAL_CREDITS);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10000 ? parsed : 0;
}
