import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { findOrderByReference, settleOrder, type Order } from "./commerce";
const ORIGIN = "https://api.syncpayments.com.br";
let cachedToken: { value: string; expires: number } | undefined;
let tokenFlight: Promise<string> | undefined;
export function syncPayConfigured() { return !!(process.env.SYNCPAY_CLIENT_ID && process.env.SYNCPAY_CLIENT_SECRET && process.env.SYNCPAY_WEBHOOK_SECRET); }
async function token() {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;
  if (tokenFlight) return tokenFlight;
  tokenFlight = (async () => {
    if (!syncPayConfigured()) throw new Error("O checkout ainda está sendo configurado.");
    const response = await fetch(`${ORIGIN}/api/partner/v1/auth-token`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ client_id: process.env.SYNCPAY_CLIENT_ID, client_secret: process.env.SYNCPAY_CLIENT_SECRET }), cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível autenticar o pagamento. Tente novamente mais tarde.");
    const body = await response.json(); if (typeof body.access_token !== "string" || !body.access_token) throw new Error("Resposta de pagamento inválida");
    cachedToken = { value: body.access_token, expires: Date.now() + Math.min(3300, Number(body.expires_in) || 300) * 1000 }; return cachedToken.value;
  })();
  try { return await tokenFlight; } finally { tokenFlight = undefined; }
}
export function validCpf(input: string) {
  const cpf = input.replace(/\D/g, ""); if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) { let sum = 0; for (let i=0;i<length;i++) sum += Number(cpf[i]) * (length + 1-i); const digit = (sum*10)%11%10; if (digit !== Number(cpf[length])) return false; } return true;
}
export async function createPix(order: Order, customer: { name: string; cpf: string; email: string; phone: string }) {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base || new URL(base).protocol !== "https:") throw new Error("Checkout indisponível");
  const item = order.kind === "credits" ? `${order.credits} créditos` : order.planId;
  const response = await fetch(`${ORIGIN}/api/partner/v1/cash-in`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(25000), cache: "no-store", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ amount: order.amountCents/100, description: `Máquina de Influencers — ${item} — ${order.id}`, webhook_url: `${new URL(base).origin}/api/payments/syncpay/webhook`, client: customer }) });
  if (!response.ok) throw new Error(response.status === 422 ? "Confira os dados de cobrança. Se persistir, entre em contato com o suporte." : "Não foi possível confirmar a criação do PIX. Confira este pedido antes de tentar novamente.");
  const body = await response.json();
  if (!isUuid(body.identifier) || typeof body.pix_code !== "string" || body.pix_code.length < 20 || body.pix_code.length > 4096) throw new Error("O gateway não retornou um PIX válido. Aguarde a conferência deste pedido.");
  return { referenceId: body.identifier as string, pixCode: body.pix_code as string };
}
export function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }
export function verifySyncPaySignature(raw: string, header: string | null, secret = process.env.SYNCPAY_WEBHOOK_SECRET, now = Date.now()) {
  if (!secret || !header || header.length > 256) return false;
  const m = /^t=(\d{1,12}),\s*v1=([a-f0-9]{64})$/i.exec(header); if (!m) return false;
  const timestamp = Number(m[1]); if (Math.abs(Math.floor(now/1000)-timestamp) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${m[1]}.${raw}`).digest();
  return timingSafeEqual(expected, Buffer.from(m[2], "hex"));
}
export async function reconcilePayment(reference: string) {
  if (!isUuid(reference)) throw new Error("Identificador inválido");
  const order = await findOrderByReference(reference); if (!order) return null;
  const response = await fetch(`${ORIGIN}/api/partner/v2/transactions/${reference}`, { redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store", headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json" } });
  if (!response.ok) throw new Error("Não foi possível consultar o pagamento agora.");
  const body = await response.json(); const tx = body?.data?.transaction;
  if (tx?.reference_id !== reference || tx.currency !== "BRL" || tx.payment_method !== "pix" || !Number.isFinite(Number(tx.amount)) || Math.round(Number(tx.amount)*100) !== order.amountCents) throw new Error("Os dados do pagamento precisam de revisão.");
  const status = tx.status === "completed" ? "paid" : ["refunded", "chargeback"].includes(tx.status) ? "refunded" : ["failed", "cancelled", "expired", "refused"].includes(tx.status) ? "failed" : "pending";
  return settleOrder(reference, status, Math.round(Number(tx.amount)*100));
}
