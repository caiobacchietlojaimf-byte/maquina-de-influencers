import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { GOOGLE_LINK_COOKIE, googleErrorMessage, openGoogleLink } from "@/lib/google-auth";
import { getPlan } from "@/lib/plans";
import { signInPath } from "@/lib/auth-destination";
import { getSystemSettings } from "@/lib/commerce";
import { DEFAULT_SUPPORT_EMAIL } from "@/lib/support";
import { getReadyTemplate } from "@/data/virais-proprios";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthCard } from "./auth-card";
import { LoginShowcase } from "./login-showcase";

export const metadata = { title: "Entrar" };

/* Vídeo do catálogo de referências (9:16) com a capa já extraída em /reel-thumbs. */
const SHOWCASE = { src: "/reel-videos/Dd7M365SS0X.mp4", poster: "/reel-thumbs/Dd7M365SS0X.jpg" };

function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={className ? `auth-brand ${className}` : "auth-brand"} aria-label="Máquina de Influencers — página inicial">
      <LogoMark />
      <span>Máquina de Influencers</span>
    </Link>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; plano?: string; template?: string; erro?: string; vincular?: string }>;
}) {
  const user = await currentUser();
  const { modo, plano, template: templateSlug, erro, vincular } = await searchParams;
  const plan = getPlan(plano);
  const template = getReadyTemplate(templateSlug);
  if (user) redirect(signInPath(user, plan?.id, template?.slug));

  const link = vincular ? openGoogleLink((await cookies()).get(GOOGLE_LINK_COOKIE)?.value) : null;
  const notice = googleErrorMessage(erro);
  const initialMode = link ? "login" : modo === "cadastro" ? "cadastro" : "login";
  const supportEmail = (await getSystemSettings()).supportEmail || DEFAULT_SUPPORT_EMAIL;

  return (
    <div className="auth-split">
      <aside className="auth-showcase">
        <LoginShowcase src={SHOWCASE.src} poster={SHOWCASE.poster} />
        <div className="auth-showcase-top">
          <Brand />
        </div>
        <div className="auth-showcase-copy">
          <span className="auth-eyebrow">Estúdio de personagens de IA</span>
          <h2>Crie influencers de IA e transforme ideias em vídeos.</h2>
          <p>Personagens com identidade consistente, referências do catálogo e vídeos prontos para publicar.</p>
        </div>
      </aside>

      <main className="auth-panel">
        <div className="auth-panel-top">
          <Brand className="auth-brand-mobile" />
          <ThemeToggle compact />
        </div>
        <div className="auth-panel-body">
          <AuthCard
            initialMode={initialMode}
            planId={plan?.id}
            planName={plan?.name}
            template={template ? { slug: template.slug, title: template.title, poster: template.poster } : undefined}
            supportEmail={supportEmail}
            notice={notice}
            linkEmail={link?.email}
          />
          <p className="auth-legal">
            Ao continuar, você concorda com os <Link href="/termos">Termos de Uso</Link> e a{" "}
            <Link href="/privacidade">Política de Privacidade</Link>.
          </p>
        </div>
      </main>
    </div>
  );
}
