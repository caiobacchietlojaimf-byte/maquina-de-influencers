import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { serverDb } from "./server-db";
import { grantPlanCredits, grantPurchasedCredits } from "./db";
import type { PlanId } from "./plans";

export type OrderStatus = "creating" | "pending" | "paid" | "failed" | "refunded" | "review";
export type Order = { id: string; userId: string; kind?: "plan" | "credits"; planId?: PlanId; packId?: string; usdAmountCents?: number; usdBrlRate?: number; exchangeRateDate?: string; amountCents: number; credits: number; status: OrderStatus; createdAt: number; updatedAt: number; referenceId?: string; pixCode?: string; paidAt?: number; error?: string };
export type SystemSettings = { registrationsOpen: boolean; checkoutEnabled: boolean; supportEmail: string; announcement: string };
export type AuditEntry = { id: string; actorId: string; action: string; targetId?: string; createdAt: number; details: Record<string, string | number | boolean> };
const defaults: SystemSettings = { registrationsOpen: true, checkoutEnabled: true, supportEmail: "pulsecoding2026@gmail.com", announcement: "" };
type Local = { orders: Order[]; settings: SystemSettings; audit: AuditEntry[] };
const file = () => path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "commerce.json");
function local(): Local { return existsSync(file()) ? JSON.parse(readFileSync(file(), "utf8")) : { orders: [], settings: { ...defaults }, audit: [] }; }
function save(data: Local) { mkdirSync(path.dirname(file()), { recursive: true }); const tmp = file() + "." + randomUUID() + ".tmp"; writeFileSync(tmp, JSON.stringify(data)); renameSync(tmp, file()); }
function dbError() { throw new Error("Não foi possível acessar os dados de pagamento. Tente novamente."); }
let localSettlement: Promise<void> = Promise.resolve();
/** Fail closed before issuing a PIX if the database cannot settle top-ups. */
export async function creditTopupsReady(): Promise<boolean> {
  try {
    const db = serverDb();
    if (!db) return true;
    const { data, error } = await db.rpc("mi_credit_topups_ready");
    return !error && data === true;
  } catch { return false; }
}
function validateOrder(order: Order) {
  const positiveInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647;
  if (!positiveInt(order.amountCents) || !positiveInt(order.credits)) throw new Error("Valor do pedido inválido");
  if (order.kind === "credits") {
    if (order.planId !== undefined || typeof order.packId !== "string" || !/^[a-z0-9-]{1,64}$/.test(order.packId)
      || !positiveInt(order.usdAmountCents) || order.usdAmountCents !== order.credits * 10
      || typeof order.usdBrlRate !== "number" || !Number.isFinite(order.usdBrlRate) || order.usdBrlRate <= 0 || order.usdBrlRate > 100
      || order.amountCents !== Math.round(order.usdAmountCents * order.usdBrlRate)
      || typeof order.exchangeRateDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(order.exchangeRateDate)) throw new Error("Cotação do pedido de créditos inválida");
  } else if (order.kind !== undefined && order.kind !== "plan" || !["starter", "pro", "max"].includes(order.planId ?? "")) {
    throw new Error("Plano do pedido inválido");
  }
}
export async function createOrderOnce(order: Order): Promise<{ order: Order; created: boolean }> {
  validateOrder(order);
  const db = serverDb();
  if (!db) { const data = local(); const old = data.orders.find(o => o.id === order.id); if (old) return { order: old, created: false }; data.orders.push(order); save(data); return { order, created: true }; }
  const result = await db.from("mi_orders").insert({ id: order.id, user_id: order.userId, status: order.status, created_at: order.createdAt, data: order });
  if (!result.error) return { order, created: true };
  if (result.error.code !== "23505") dbError();
  const existing = await getOrder(order.id); if (!existing) dbError();
  return { order: existing!, created: false };
}
export async function getOrder(id: string): Promise<Order | undefined> {
  const db = serverDb(); if (!db) return local().orders.find(o => o.id === id);
  const { data, error } = await db.from("mi_orders").select("data").eq("id", id).maybeSingle(); if (error) dbError(); return data?.data;
}
export async function findOrderByReference(reference: string): Promise<Order | undefined> {
  const db = serverDb(); if (!db) return local().orders.find(o => o.referenceId === reference);
  const { data, error } = await db.from("mi_orders").select("data").eq("reference_id", reference).maybeSingle(); if (error) dbError(); return data?.data;
}
export async function listOrders(userId?: string): Promise<Order[]> {
  const db = serverDb(); if (!db) return local().orders.filter(o => !userId || o.userId === userId).sort((a,b) => b.createdAt-a.createdAt);
  let query = db.from("mi_orders").select("data").order("created_at", { ascending: false }).limit(500); if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query; if (error) dbError(); return (data ?? []).map(r => r.data);
}
export async function attachPayment(id: string, patch: Pick<Order, "status"> & Partial<Pick<Order, "referenceId" | "pixCode" | "error">>): Promise<Order> {
  const order = await getOrder(id); if (!order) dbError();
  const next = { ...order!, ...patch, updatedAt: Date.now() };
  const db = serverDb();
  if (!db) { const data = local(); const index = data.orders.findIndex(o => o.id === id); if (data.orders[index].status === "creating") { data.orders[index] = next; save(data); } return data.orders[index]; }
  const { data, error } = await db.from("mi_orders").update({ reference_id: next.referenceId, status: next.status, data: next }).eq("id", id).eq("status", "creating").select("data").maybeSingle();
  if (error) dbError(); return data?.data ?? (await getOrder(id))!;
}
export async function settleOrder(reference: string, status: "paid" | "pending" | "failed" | "refunded", amountCents: number) {
  const db = serverDb(); const now = Date.now();
  if (db) { const { data, error } = await db.rpc("mi_settle_order", { p_reference: reference, p_status: status, p_amount_cents: amountCents, p_now: now }); if (error) dbError(); return data as Order | null; }
  // The file driver has no row locks. Serialize the entire order+credit
  // transition, including the awaited credit mutation and the final reread.
  const previous = localSettlement;
  let release!: () => void;
  localSettlement = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
  const order = await findOrderByReference(reference); if (!order) return null;
  validateOrder(order);
  if (!Number.isInteger(amountCents) || order.amountCents !== amountCents) throw new Error("Valor do pagamento não confere");
  if (!["paid", "pending", "failed", "refunded"].includes(status)) throw new Error("Status de pagamento inválido");
  if (order.status === "refunded" || order.status === "paid" && (status === "pending" || status === "failed")) return order;
  if (status === "paid" || status === "refunded") {
    if (order.kind === "credits") await grantPurchasedCredits(order.userId, order.id, order.credits, now, status === "refunded");
    else await grantPlanCredits(order.userId, order.id, order.planId!, order.credits, now, status === "refunded");
  }
  const data = local(); const index = data.orders.findIndex(o => o.id === order.id); const next = { ...data.orders[index], status, updatedAt: now, ...(status === "paid" && !order.paidAt ? { paidAt: now } : {}) }; data.orders[index] = next; save(data); return next;
  } finally { release(); }
}
export async function getSystemSettings(): Promise<SystemSettings> {
  const db = serverDb(); if (!db) return { ...defaults, ...local().settings };
  const { data, error } = await db.from("mi_settings").select("data").eq("id", "system").maybeSingle(); if (error) dbError(); return { ...defaults, ...data?.data };
}
export async function saveSystemSettings(settings: SystemSettings) {
  const db = serverDb(); if (!db) { const data = local(); data.settings = settings; save(data); return; }
  const { error } = await db.from("mi_settings").upsert({ id: "system", data: settings }); if (error) dbError();
}
export async function adminAudit(actorId: string, action: string, targetId: string | undefined, details: AuditEntry["details"] = {}) {
  const entry = { id: randomUUID(), actorId, action, targetId, details, createdAt: Date.now() };
  const db = serverDb(); if (!db) { const data = local(); data.audit.unshift(entry); data.audit = data.audit.slice(0,1000); save(data); return; }
  const { error } = await db.from("mi_admin_audit").insert({ id: entry.id, actor_id: actorId, action, target_id: targetId, details, created_at: entry.createdAt }); if (error) dbError();
}
export async function listAdminAudit(): Promise<AuditEntry[]> {
  const db = serverDb(); if (!db) return local().audit.slice(0,100);
  const { data, error } = await db.from("mi_admin_audit").select("*").order("created_at", { ascending: false }).limit(100); if (error) dbError();
  return (data ?? []).map(r => ({ id: r.id, actorId: r.actor_id, action: r.action, targetId: r.target_id, createdAt: r.created_at, details: r.details }));
}
