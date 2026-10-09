"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, isAdmin } from "@/lib/admin";
import { adminAudit, getOrder, saveSystemSettings } from "@/lib/commerce";
import { findUserById, setUserSuspended } from "@/lib/db";
import { isUuid, reconcilePayment } from "@/lib/syncpay";
export type AdminState = { error?: string; success?: string } | null;
export async function saveSettingsAction(_previous: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const supportEmail = String(form.get("supportEmail") ?? "").trim().toLowerCase(); const announcement = String(form.get("announcement") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail) || supportEmail.length > 254 || announcement.length > 280) return { error: "Confira o e-mail e o aviso (até 280 caracteres)." };
  const settings = { supportEmail, announcement, registrationsOpen: form.get("registrationsOpen") === "on", checkoutEnabled: form.get("checkoutEnabled") === "on" };
  try { await adminAudit(admin.id, "settings.update", "system", { registrationsOpen: settings.registrationsOpen, checkoutEnabled: settings.checkoutEnabled }); await saveSystemSettings(settings); revalidatePath("/app"); return { success: "Configurações salvas" }; } catch { return { error: "Não foi possível salvar as configurações." }; }
}
export async function suspendUserAction(form: FormData) {
  const admin = await requireAdmin(); const id = String(form.get("userId") ?? ""); if (!isUuid(id)) return;
  const user = await findUserById(id); if (!user || isAdmin(user)) return;
  const suspended = form.get("suspended") === "true";
  await adminAudit(admin.id, suspended ? "user.suspend" : "user.restore", id);
  await setUserSuspended(id, suspended); revalidatePath("/app/admin");
}
export async function reconcileOrderAction(form: FormData) {
  const admin = await requireAdmin(); const id = String(form.get("orderId") ?? ""); if (!isUuid(id)) return;
  const order = await getOrder(id); if (!order?.referenceId) return;
  await adminAudit(admin.id, "order.reconcile", id);
  await reconcilePayment(order.referenceId); revalidatePath("/app/admin");
}
