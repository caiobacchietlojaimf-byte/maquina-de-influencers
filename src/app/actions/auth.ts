"use server";

import { redirect } from "next/navigation";

import { clearSessionCookie, hashPassword, setSessionCookie, verifyPassword } from "@/lib/auth";
import { createUser, findUserByEmail } from "@/lib/db";

export type AuthState = { error?: string } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initialCredits(): number {
  const parsed = Number(process.env.INITIAL_CREDITS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 10000;
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (name.length < 2) return { error: "Informe seu nome" };
  if (!EMAIL.test(email)) return { error: "E-mail inválido" };
  if (password.length < 6) return { error: "A senha precisa de pelo menos 6 caracteres" };
  if (await findUserByEmail(email)) return { error: "Já existe uma conta com esse e-mail" };

  const { hash, salt } = hashPassword(password);
  const user = await createUser({ name, email, passwordHash: hash, salt, credits: initialCredits() });
  await setSessionCookie(user.id);
  redirect("/app");
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.salt, user.passwordHash)) {
    return { error: "E-mail ou senha incorretos" };
  }
  await setSessionCookie(user.id);
  redirect("/app");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/");
}
