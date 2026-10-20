import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/actions/auth";
import { currentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { getUserEntitlements } from "@/lib/plans";
import { AppSidebar } from "@/components/app-sidebar";
import { getSystemSettings } from "@/lib/commerce";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Usuário e configurações em paralelo: uma ida ao banco a menos por página.
  const [user, settings] = await Promise.all([currentUser(), getSystemSettings()]);
  if (!user) redirect("/login");
  const admin = isAdmin(user);

  return (
    <div className="app-shell">
      <AppSidebar name={user.name} email={user.email} credits={user.credits} logout={logoutAction} isAdmin={admin} learnLocked={!admin && !getUserEntitlements(user).modules} />
      <main className="app-main">{settings.announcement && <div role="status" style={{ padding: "12px 16px", marginBottom: 20, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)" }}>{settings.announcement}</div>}{children}</main>
    </div>
  );
}
