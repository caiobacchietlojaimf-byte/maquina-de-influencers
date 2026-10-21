"use server";

import { redirect } from "next/navigation";

import { clearSessionCookie, hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { createUser, findUserByEmail } from "@/lib/db";
import { rateLimit, requestIdentity } from "@/lib/rate-limit";
import { getSystemSettings } from "@/lib/commerce";
import { getPlan, getUserEntitlements, PLAN_RANK } from "@/lib/plans";
import { getReadyTemplate } from "@/data/virais-proprios";

export type AuthState = { error?: string } | null;

function nextPath(formData: FormData): string {
  const plan = getPlan(formData.get("planId"));
  const template = getReadyTemplate(formData.get("template"));
  if (plan) return `/app/planos?plano=${plan.id}${template ? `&template=${template.slug}` : ""}`;
  return template ? `/app/criar-videos?template=${template.slug}` : "/app";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initialCredits(): number {
  const parsed = Number(process.env.INITIAL_CREDITS);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10000 ? parsed : 0;
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (name.length < 2 || name.length > 100) return { error: "Informe seu nome (2 a 100 caracteres)" };
  if (email.length > 254 || !EMAIL.test(email)) return { error: "E-mail inválido" };
  if (password.length < 10 || password.length > 128) return { error: "Use uma senha de 10 a 128 caracteres" };
  if (!await rateLimit("register", await requestIdentity(), 5, 3600000)) return { error: "Limite de cadastros atingido. Tente mais tarde." };
  if (!(await getSystemSettings()).registrationsOpen) return { error: "Novos cadastros estão temporariamente pausados." };
  if (await findUserByEmail(email)) return { error: "Já existe uma conta com esse e-mail" };

  const { hash, salt } = hashPassword(password);
  const user = await createUser({ name, email, passwordHash: hash, salt, credits: initialCredits() });
  await setSessionCookie(user.id);
  redirect(nextPath(formData));
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (email.length > 254 || password.length > 128 || !EMAIL.test(email)) return { error: "E-mail ou senha incorretos" };
  const ip = await requestIdentity();
  if (!await rateLimit("login-ip", ip, 40) || !await rateLimit("login-account", email, 12)) return { error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." };

  const user = await findUserByEmail(email);
  if (!user || user.suspendedAt || !verifyPassword(password, user.salt, user.passwordHash)) {
    return { error: "E-mail ou senha incorretos" };
  }
  await setSessionCookie(user.id);
  redirect(alreadyCovered(user, formData.get("planId")) ? nextPath(withoutPlan(formData)) : nextPath(formData));
}

/** Quem já tem um plano igual ou superior ao escolhido não volta ao checkout. */
function alreadyCovered(user: Parameters<typeof getUserEntitlements>[0], wanted: unknown): boolean {
  const active = getUserEntitlements(user).planId;
  const plan = getPlan(wanted);
  return !!active && (!plan || PLAN_RANK[active] >= PLAN_RANK[plan.id]);
}

function withoutPlan(formData: FormData): FormData {
  const copy = new FormData();
  const template = formData.get("template");
  if (typeof template === "string") copy.set("template", template);
  return copy;
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/");
}
