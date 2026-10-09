import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return <main style={{ maxWidth: 820, margin: "0 auto", padding: "28px 22px 80px", lineHeight: 1.85 }}><header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 48 }}><Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}><LogoMark/><span>Máquina de Influencers</span></Link><ThemeToggle compact/></header><h1 style={{ fontSize: "clamp(28px,5vw,42px)", lineHeight: 1.2, marginBottom: 18 }}>{title}</h1><p style={{ color: "var(--tx3)" }}>Atualizado em 9 de outubro de 2026</p>{children}<footer style={{ display:"flex",flexWrap:"wrap",gap:18,marginTop:48,borderTop:"1px solid var(--line)",paddingTop:20 }}><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos de uso</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></footer></main>;
}
