import Link from "next/link";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { LogoMark } from "@/components/logo";
import { AuthCard } from "./auth-card";

export const metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect("/app");
  const { modo } = await searchParams;

  return (
    <div className="auth-shell">
      <div style={{ display: "grid", gap: 18, justifyItems: "center" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }} className="display">
          <LogoMark />
          <span style={{ fontSize: 16 }}>MÁQUINA DE INFLUENCERS</span>
        </Link>
        <AuthCard initialMode={modo === "cadastro" ? "cadastro" : "login"} />
      </div>
    </div>
  );
}
