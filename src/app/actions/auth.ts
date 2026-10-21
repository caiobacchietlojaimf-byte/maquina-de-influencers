"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { clearSessionCookie, hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { createUser, findUserByEmail, linkGoogleAccount } from "@/lib/db";
import { GOOGLE_LINK_COOKIE, googleLinkCookieOptions, openGoogleLink } from "@/lib/google-auth";
import { rateLimit, requestIdentity } from "@/lib/rate-limit";
import { getSystemSettings } from "@/lib/commerce";
import { nextPath, signInPath } from "@/lib/auth-destination";
import { initialCredits } from "@/lib/signup";

export type AuthState = { error?: string } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  redirect(nextPath(formData.get("planId"), formData.get("template")));
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (email.length > 254 || password.length > 128 || !EMAIL.test(email)) return { error: "E-mail ou senha incorretos" };
  const ip = await requestIdentity();
  if (!await rateLimit("login-ip", ip, 40) || !await rateLimit("login-account", email, 12)) return { error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." };

  const user = await findUserByEmail(email);
  // Contas criadas pelo Google não têm senha: o hash vazio nunca confere.
  if (!user || user.suspendedAt || !user.passwordHash || !verifyPassword(password, user.salt, user.passwordHash)) {
    return { error: "E-mail ou senha incorretos" };
  }

  // Vinculação pendente: o Google devolveu este mesmo e-mail e a senha acabou de ser provada.
  const jar = await cookies();
  const link = openGoogleLink(jar.get(GOOGLE_LINK_COOKIE)?.value);
  if (link) {
    jar.set(GOOGLE_LINK_COOKIE, "", { ...googleLinkCookieOptions, maxAge: 0 });
    if (link.email === user.email) {
      try { await linkGoogleAccount(user.id, link.sub); } catch { /* vínculo conflitante: login segue sem vincular */ }
    }
  }

  await setSessionCookie(user.id);
  redirect(signInPath(user, formData.get("planId") || link?.planId, formData.get("template") || link?.template));
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/");
}
