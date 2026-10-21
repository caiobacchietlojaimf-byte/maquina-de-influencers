import { getReadyTemplate } from "@/data/virais-proprios";
import { getPlan, getUserEntitlements, PLAN_RANK } from "./plans";

/* Para onde mandar quem acabou de entrar ou se cadastrar (e-mail/senha ou Google). */

/** Checkout do plano escolhido (levando o template) ou direto para criar com o template. */
export function nextPath(planId: unknown, templateSlug: unknown): string {
  const plan = getPlan(planId);
  const template = getReadyTemplate(templateSlug);
  if (plan) return `/app/planos?plano=${plan.id}${template ? `&template=${template.slug}` : ""}`;
  return template ? `/app/criar-videos?template=${template.slug}` : "/app";
}

/** Quem já tem um plano igual ou superior ao escolhido não volta ao checkout. */
export function alreadyCovered(user: Parameters<typeof getUserEntitlements>[0], wanted: unknown): boolean {
  const active = getUserEntitlements(user).planId;
  const plan = getPlan(wanted);
  return !!active && (!plan || PLAN_RANK[active] >= PLAN_RANK[plan.id]);
}

/** Destino depois de entrar com uma conta que já existe: pula o checkout se o plano já cobre. */
export function signInPath(user: Parameters<typeof getUserEntitlements>[0], planId: unknown, templateSlug: unknown): string {
  return nextPath(alreadyCovered(user, planId) ? null : planId, templateSlug);
}
