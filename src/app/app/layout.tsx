import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/actions/auth";
import { currentUser } from "@/lib/auth";
import { LogoMark } from "@/components/logo";
import { SidebarNav } from "@/components/sidebar-nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link href="/app" className="brand">
          <LogoMark size={24} />
          <span>MÁQUINA DE INFLUENCERS</span>
        </Link>
        <SidebarNav />
        <div className="sidebar-footer">
          <div className="credit-pill" title="Seus créditos de geração">
            <span>Créditos</span>
            <b>{user.credits.toLocaleString("pt-BR")}</b>
          </div>
          <div className="user-row">
            <div className="avatar">{initial}</div>
            <div className="who">
              <b>{user.name}</b>
              <span>{user.email}</span>
            </div>
            <form action={logoutAction} style={{ marginLeft: "auto" }}>
              <button type="submit" title="Sair" className="nav-item" style={{ height: 34, padding: "0 8px" }}>
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="app-main">{children}</main>
    </div>
  );
}
