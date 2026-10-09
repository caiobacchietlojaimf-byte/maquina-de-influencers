import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/actions/auth";
import { currentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { AppSidebar } from "@/components/app-sidebar";
import { getSystemSettings } from "@/lib/commerce";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await getSystemSettings();

  return (
    <div className="app-shell">
      <AppSidebar name={user.name} email={user.email} credits={user.credits} logout={logoutAction} isAdmin={isAdmin(user)} />
      <main className="app-main">{settings.announcement && <div role="status" style={{ padding: "12px 16px", marginBottom: 20, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)" }}>{settings.announcement}</div>}{children}</main>
    </div>
  );
}
