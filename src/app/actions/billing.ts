"use server";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { attachPayment, createOrderOnce, creditTopupsReady, getOrder, getSystemSettings, type Order } from "@/lib/commerce";
import { getPlan } from "@/lib/plans";
import { getCreditPack } from "@/lib/credit-packs";
import { CreditQuoteExpiredError, readCreditPurchaseQuote } from "@/lib/credit-exchange";
import { createPix, isUuid, reconcilePayment, syncPayConfigured, validCpf } from "@/lib/syncpay";
import { rateLimit } from "@/lib/rate-limit";
export type BillingState = { error?: string; order?: Order; quoteExpired?: boolean } | null;

function requestOrderId(userId: string, key: string) {
  const hex = createHash("sha256").update(`${userId}:${key}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

export async function createCreditCheckoutAction(_prev: BillingState, form: FormData): Promise<BillingState> {
  const user = await requireUser();
  const pack = getCreditPack(form.get("packId")); const key = String(form.get("requestKey") ?? "");
  const name = String(form.get("name") ?? "").trim(); const cpf = String(form.get("cpf") ?? "").replace(/\D/g, ""); const phone = String(form.get("phone") ?? "").replace(/\D/g, "");
  if (!pack || !isUuid(key)) return { error: "Selecione um pacote válido e tente novamente." };
  if (name.length < 3 || name.length > 120 || !validCpf(cpf) || !/^\d{10,13}$/.test(phone)) return { error: "Confira seu nome completo, CPF e telefone." };
  try {
    const id = requestOrderId(user.id, key);
    // Recover the immutable order before checking a quote that may have expired.
    const prior = await getOrder(id);
    if (prior) return prior.userId === user.id && prior.kind === "credits" && prior.packId === pack.id ? { order: prior } : { error: "Pedido inválido. Atualize a página." };
    const settings = await getSystemSettings();
    if (!settings.checkoutEnabled || !syncPayConfigured() || !await creditTopupsReady()) return { error: "A compra de créditos está em preparação. O checkout será liberado em breve." };
    const quote = readCreditPurchaseQuote(String(form.get("quoteToken") ?? ""), user.id);
    if (!await rateLimit("checkout", user.id, 8, 3600000)) return { error: "Você já criou vários pedidos. Confira os pagamentos pendentes antes de tentar novamente." };
    const now = Date.now();
    const { order, created } = await createOrderOnce({ id, userId: user.id, kind: "credits", packId: pack.id, credits: pack.credits, usdAmountCents: pack.usdAmountCents, usdBrlRate: quote.usdBrlRate, exchangeRateDate: quote.exchangeRateDate, amountCents: Math.round(pack.usdAmountCents * quote.usdBrlRate), status: "creating", createdAt: now, updatedAt: now });
    if (!created) return order.userId === user.id && order.kind === "credits" && order.packId === pack.id ? { order } : { error: "Pedido inválido. Atualize a página." };
    try { const payment = await createPix(order, { name, cpf, email: user.email, phone }); return { order: await attachPayment(id, { ...payment, status: "pending" }) }; }
    catch { return { order: await attachPayment(id, { status: "review", error: "Não foi possível confirmar o PIX. Entre em contato com o suporte informando o número do pedido antes de criar outro." }) }; }
  } catch (error) {
    if (error instanceof CreditQuoteExpiredError) return { error: error.message, quoteExpired: true };
    return { error: "Não foi possível preparar o pagamento. Atualize a cotação e tente novamente em instantes." };
  }
}
export async function createCheckoutAction(_prev: BillingState, form: FormData): Promise<BillingState> {
  const user = await requireUser();
  const plan = getPlan(form.get("planId")); const key = String(form.get("requestKey") ?? "");
  const name = String(form.get("name") ?? "").trim(); const cpf = String(form.get("cpf") ?? "").replace(/\D/g, ""); const phone = String(form.get("phone") ?? "").replace(/\D/g, "");
  if (!plan || !isUuid(key)) return { error: "Selecione um plano válido e tente novamente." };
  if (name.length < 3 || name.length > 120 || !validCpf(cpf) || !/^\d{10,13}$/.test(phone)) return { error: "Confira seu nome completo, CPF e telefone." };
  try {
    const settings = await getSystemSettings();
    if (!settings.checkoutEnabled || !syncPayConfigured()) return { error: "Os planos estão em preparação. O checkout será liberado em breve." };
    const id = requestOrderId(user.id, key);
    const prior = await getOrder(id);
    if (prior) return prior.userId === user.id && prior.kind !== "credits" && prior.planId === plan.id ? { order: prior } : { error: "Pedido inválido. Atualize a página." };
    if (!await rateLimit("checkout", user.id, 8, 3600000)) return { error: "Você já criou vários pedidos. Confira os pagamentos pendentes antes de tentar novamente." };
    const now = Date.now();
    const { order, created } = await createOrderOnce({ id, userId: user.id, planId: plan.id, amountCents: Math.round(plan.priceMonthlyBRL*100), credits: plan.creditsMonthly, status: "creating", createdAt: now, updatedAt: now });
    if (!created) return order.userId === user.id && order.kind !== "credits" && order.planId === plan.id ? { order } : { error: "Pedido inválido. Atualize a página." };
    try { const payment = await createPix(order, { name, cpf, email: user.email, phone }); return { order: await attachPayment(id, { ...payment, status: "pending" }) }; }
    catch { return { order: await attachPayment(id, { status: "review", error: "Não foi possível confirmar o PIX. Entre em contato com o suporte informando o número do pedido antes de criar outro." }) }; }
  } catch { return { error: "Não foi possível preparar o pagamento. Tente novamente em instantes." }; }
}
export async function refreshPaymentAction(orderId: string): Promise<BillingState> {
  const user = await requireUser(); if (!isUuid(orderId)) return { error: "Pedido inválido" };
  try {
    const order = await getOrder(orderId); if (!order || order.userId !== user.id) return { error: "Pedido não encontrado" };
    if (!order.referenceId || order.status === "refunded") return { order };
    if (!await rateLimit("check-payment", user.id, 20, 60000)) return { error: "Aguarde um instante antes de consultar novamente." };
    return { order: await reconcilePayment(order.referenceId) ?? order };
  } catch { return { error: "Pagamento ainda não conferido. Tente novamente em instantes." }; }
}
