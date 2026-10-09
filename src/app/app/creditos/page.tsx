import { requirePageUser } from "@/lib/auth";
import { creditTopupsReady, getSystemSettings, listOrders } from "@/lib/commerce";
import { syncPayConfigured } from "@/lib/syncpay";
import { quoteCreditPurchase } from "@/lib/credit-exchange";
import { BillingCenter } from "@/components/billing-center";
export const metadata = { title: "Comprar créditos" };
export default async function CreditsPage() {
  const user = await requirePageUser();
  const [orders, settings, ready, quote] = await Promise.all([
    listOrders(user.id), getSystemSettings(), creditTopupsReady(), quoteCreditPurchase(user.id).catch(() => null),
  ]);
  return <><header className="page-header"><h1>COMPRAR <span>CRÉDITOS</span></h1><p>Adicione saldo para suas próximas criações.</p></header><BillingCenter mode="credits" name={user.name} orders={orders.filter(order => order.kind === "credits")} enabled={settings.checkoutEnabled && syncPayConfigured() && ready} currentPlan={null} creditQuote={quote} supportEmail={settings.supportEmail} /></>;
}
