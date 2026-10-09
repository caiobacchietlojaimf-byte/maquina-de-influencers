import { requirePageUser } from "@/lib/auth";
import { getSystemSettings, listOrders } from "@/lib/commerce";
import { getUserEntitlements, getPlan } from "@/lib/plans";
import { syncPayConfigured } from "@/lib/syncpay";
import { BillingCenter } from "@/components/billing-center";
export const metadata = { title: "Planos" };
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ plano?: string }> }) {
  const user = await requirePageUser(); const [orders, settings] = await Promise.all([listOrders(user.id), getSystemSettings()]);
  const plan = getPlan((await searchParams).plano);
  return <><header className="page-header"><h1>ESCOLHA SEU <span>PLANO</span></h1><p>Créditos para criar. Conteúdo para evoluir.</p></header><BillingCenter name={user.name} orders={orders} enabled={settings.checkoutEnabled && syncPayConfigured()} currentPlan={getUserEntitlements(user).planId} initialPlan={plan?.id} supportEmail={settings.supportEmail}/></>;
}
