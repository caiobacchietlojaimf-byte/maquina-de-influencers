import { requirePageUser } from "@/lib/auth";
import { getSystemSettings, listOrders } from "@/lib/commerce";
import { getUserEntitlements, getPlan } from "@/lib/plans";
import { syncPayConfigured } from "@/lib/syncpay";
import { BillingCenter } from "@/components/billing-center";
import { getReadyTemplate } from "@/data/virais-proprios";
export const metadata = { title: "Planos" };
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ plano?: string; template?: string }> }) {
  const user = await requirePageUser(); const [orders, settings] = await Promise.all([listOrders(user.id), getSystemSettings()]);
  const params = await searchParams;
  const plan = getPlan(params.plano);
  const template = getReadyTemplate(params.template);
  return <><header className="page-header"><h1>Escolha seu <span>plano</span></h1><p>{template ? `Depois do pagamento, você volta direto para criar o seu vídeo com ${template.title}.` : "Créditos para criar. Conteúdo para evoluir."}</p></header><BillingCenter name={user.name} orders={orders.filter(order => order.kind !== "credits")} enabled={settings.checkoutEnabled && syncPayConfigured()} currentPlan={getUserEntitlements(user).planId} initialPlan={plan?.id} supportEmail={settings.supportEmail} nextStep={template ? { href: `/app/criar-videos?template=${template.slug}`, label: `Criar meu vídeo com ${template.title}` } : undefined}/></>;
}
