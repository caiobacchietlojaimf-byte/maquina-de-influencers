import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/actions/auth";
import { currentUser } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="app-shell">
      <AppSidebar name={user.name} email={user.email} credits={user.credits} logout={logoutAction} />
      <main className="app-main">{children}</main>
    </div>
  );
}
