import Link from "next/link";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { LogoMark } from "@/components/logo";
import { AuthCard } from "./auth-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPlan } from "@/lib/plans";

export const metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; plano?: string }>;
}) {
  const user = await currentUser();
  const { modo, plano } = await searchParams;
  const plan = getPlan(plano);
  if (user) redirect(plan ? `/app/planos?plano=${plan.id}` : "/app");

  return (
    <div className="auth-shell">
      <div style={{ position: "absolute", top: 20, right: 20 }}><ThemeToggle compact /></div>
      <div style={{ display: "grid", gap: 18, justifyItems: "center" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }} className="display">
          <LogoMark />
          <span style={{ fontSize: 16 }}>MÁQUINA DE INFLUENCERS</span>
        </Link>
        <AuthCard initialMode={modo === "cadastro" ? "cadastro" : "login"} planId={plan?.id} />
      </div>
    </div>
  );
}
