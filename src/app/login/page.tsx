import Link from "next/link";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { LogoMark } from "@/components/logo";
import { AuthCard } from "./auth-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPlan, getUserEntitlements, PLAN_RANK } from "@/lib/plans";
import { getReadyTemplate } from "@/data/virais-proprios";

export const metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; plano?: string; template?: string }>;
}) {
  const user = await currentUser();
  const { modo, plano, template: templateSlug } = await searchParams;
  const plan = getPlan(plano);
  const template = getReadyTemplate(templateSlug);
  if (user) {
    const active = getUserEntitlements(user).planId;
    const covered = !!active && (!plan || PLAN_RANK[active] >= PLAN_RANK[plan.id]);
    if (!covered && plan) redirect(`/app/planos?plano=${plan.id}${template ? `&template=${template.slug}` : ""}`);
    redirect(template ? `/app/criar-videos?template=${template.slug}` : "/app");
  }

  return (
    <div className="auth-shell">
      <div style={{ position: "absolute", top: 20, right: 20 }}><ThemeToggle compact /></div>
      <div style={{ display: "grid", gap: 18, justifyItems: "center" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>
          <LogoMark size={28} />
          <span>Máquina de Influencers</span>
        </Link>
        <AuthCard initialMode={modo === "cadastro" ? "cadastro" : "login"} planId={plan?.id} planName={plan?.name} template={template ? { slug: template.slug, title: template.title, poster: template.poster } : undefined} />
      </div>
    </div>
  );
}
