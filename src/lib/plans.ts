export type PlanId = "starter" | "pro" | "max";
export type Plan = { id: PlanId; name: string; priceMonthlyBRL: number; creditsMonthly: number; summary: string; features: string[]; highlighted?: boolean };
export const PLAN_CATALOG: Plan[] = [
  { id: "starter", name: "Starter", priceMonthlyBRL: 97, creditsMonthly: 1500, summary: "Seu primeiro personagem, suas primeiras criações.", features: ["1.500 créditos", "Criador de influencers", "Catálogo de referências", "Geração e exportação de vídeos"] },
  { id: "pro", name: "Pro", priceMonthlyBRL: 197, creditsMonthly: 3500, summary: "Crie com mais frequência e desenvolva sua estratégia.", highlighted: true, features: ["3.500 créditos", "Tudo do Starter", "Módulos de estratégia e produção", "Guias para organizar suas publicações"] },
  { id: "max", name: "Max", priceMonthlyBRL: 397, creditsMonthly: 7500, summary: "Mais créditos e acesso à próxima etapa da produção.", features: ["7.500 créditos", "Tudo do Pro", "Área Criação Ilimitada", "Aulas sobre GPU e ComfyUI quando disponíveis"] },
];
export const PLAN_DAYS = 30;
export const PLAN_RANK: Record<PlanId, number> = { starter: 1, pro: 2, max: 3 };
export type PlanGrant = { planId: PlanId; credits: number; startsAt: number; expiresAt: number; revoked?: boolean };
export function getPlan(value: unknown): Plan | undefined { return PLAN_CATALOG.find(p => p.id === value); }
export function getUserEntitlements(user: { planGrants?: Record<string, PlanGrant> } | null | undefined, now = Date.now()) {
  const grants = Object.values(user?.planGrants ?? {}).filter(g => !g.revoked && g.startsAt <= now && g.expiresAt > now && getPlan(g.planId));
  const active = grants.sort((a, b) => PLAN_RANK[b.planId] - PLAN_RANK[a.planId])[0];
  return { planId: active?.planId ?? null, modules: !!active && PLAN_RANK[active.planId] >= 2, unlimitedCreation: active?.planId === "max", expiresAt: active ? Math.max(...grants.filter(g => g.planId === active.planId).map(g => g.expiresAt)) : null };
}
