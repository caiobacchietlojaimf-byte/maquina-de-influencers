import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/logo";

export const metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return <main className="auth-shell">
    <div style={{ display: "grid", justifyItems: "center", gap: 18, textAlign: "center", maxWidth: 460 }}>
      <Link href="/" aria-label="Máquina de Influencers — início"><LogoMark size={40} /></Link>
      <span style={{ padding: "4px 10px", borderRadius: 8, background: "var(--accent)", color: "#0f0f12", fontSize: 12, fontWeight: 800 }}>Erro 404</span>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(32px, 6vw, 44px)", letterSpacing: "-0.04em", lineHeight: 1.05 }}>Essa página não existe.</h1>
      <p style={{ color: "var(--tx2)", fontSize: 16, lineHeight: 1.6 }}>O endereço pode estar errado, ou o conteúdo ainda não foi liberado. Volte para o início ou escolha um template pronto para recriar.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
        <Link href="/#templates" className="btn btn-accent btn-lg"><Sparkles size={18} /> Ver templates</Link>
        <Link href="/" className="btn btn-outline btn-lg">Ir para o início <ArrowRight size={18} /></Link>
      </div>
    </div>
  </main>;
}
