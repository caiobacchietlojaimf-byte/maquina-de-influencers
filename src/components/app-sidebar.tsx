"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ChevronUp, Clapperboard, Coins, CreditCard, Flame, GraduationCap, Home, LogOut, Menu, Send, ShieldCheck, Users, Wand2 } from "lucide-react";

import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

/* Produção: cada destino aparece uma vez, sem selos promocionais. */
const ITEMS = [
  { href: "/app", label: "Início", icon: Home, exact: true },
  { href: "/app/influencers", label: "Influencers", icon: Users },
  { href: "/app/virais", label: "Explorar virais", icon: Flame },
  { href: "/app/criar-videos", label: "Criar vídeos", icon: Wand2 },
  { href: "/app/videos", label: "Meus vídeos", icon: Clapperboard },
  { href: "/app/publicar", label: "Publicações", icon: Send },
] as const;
/* Aprendizado fica separado da produção; "Pro" só aparece quando o plano ainda não libera. */
const LEARN = { href: "/app/modulos", label: "Aprender", icon: GraduationCap } as const;

const STORAGE_KEY = "mi-sidebar-collapsed";

export function AppSidebar({
  name,
  email,
  credits,
  logout,
  isAdmin = false,
  learnLocked = false,
}: {
  name: string;
  email: string;
  credits: number;
  logout: () => Promise<void>;
  isAdmin?: boolean;
  /** Conteúdo de aprendizado ainda bloqueado pelo plano atual. */
  learnLocked?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileId = useId();
  const profileRoot = useRef<HTMLDivElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const profilePanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    profilePanel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const outside = (event: Event) => {
      if (event.target instanceof Node && !profileRoot.current?.contains(event.target)) setProfileOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setProfileOpen(false);
      profileTrigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [profileOpen]);

  // Estado inicial: preferência salva; sem preferência, recolhe em telas estreitas.
  useEffect(() => {
    if (window.innerWidth < 760) { setCollapsed(true); return; }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        setCollapsed(saved === "1");
        return;
      }
    } catch {
      /* armazenamento indisponível: segue o padrão por largura */
    }
    if (window.innerWidth < 1100) setCollapsed(true);
  }, []);

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 759px)");
    const collapseOnMobile = () => { if (narrow.matches) setCollapsed(true); };
    narrow.addEventListener("change", collapseOnMobile);
    return () => narrow.removeEventListener("change", collapseOnMobile);
  }, []);

  const toggle = () => {
    setProfileOpen(false);
    setCollapsed((prev) => {
      try {
        localStorage.setItem(STORAGE_KEY, prev ? "0" : "1");
      } catch {
        /* sem persistência, só alterna */
      }
      return !prev;
    });
  };

  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <aside className="app-sidebar" data-collapsed={collapsed}>
      <div className="sidebar-top">
        <button type="button" className="burger" onClick={toggle} title={collapsed ? "Expandir menu" : "Recolher menu"} aria-label={collapsed ? "Expandir menu" : "Recolher menu"} aria-expanded={!collapsed}>
          <Menu size={19} />
        </button>
        <Link href="/app" className="brand" data-hide={collapsed}>
          <LogoMark size={22} />
          <span>MÁQUINA DE INFLUENCERS</span>
        </Link>
      </div>

      <nav aria-label="Menu principal">
        {ITEMS.map((item) => {
          const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="nav-item"
              data-active={active}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              onClick={() => { setProfileOpen(false); if (window.innerWidth < 760) setCollapsed(true); }}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} />
              <span data-hide={collapsed}>{item.label}</span>
            </Link>
          );
        })}
        <span className="nav-separator" role="separator" aria-orientation="horizontal" />
        {(() => {
          const active = pathname.startsWith(LEARN.href) || pathname.startsWith("/app/criacao-ilimitada");
          const label = learnLocked ? `${LEARN.label} (disponível no Pro e no Max)` : LEARN.label;
          return (
            <Link
              href={LEARN.href}
              className="nav-item"
              data-active={active}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              onClick={() => { setProfileOpen(false); if (window.innerWidth < 760) setCollapsed(true); }}
              title={collapsed || learnLocked ? label : undefined}
            >
              <LEARN.icon size={18} />
              <span data-hide={collapsed}>{LEARN.label}</span>
              {learnLocked && !collapsed ? <span className="nav-tag">Pro</span> : null}
            </Link>
          );
        })()}
      </nav>

      <div className="sidebar-credits">
        <Link
          href="/app/creditos"
          className="sidebar-credits-link"
          aria-label={`${credits.toLocaleString("pt-BR")} créditos. Adicionar créditos`}
          aria-current={pathname.startsWith("/app/creditos") ? "page" : undefined}
          title={collapsed ? `${credits.toLocaleString("pt-BR")} créditos · Adicionar créditos` : undefined}
          onClick={() => { setProfileOpen(false); if (window.innerWidth < 760) setCollapsed(true); }}
        >
          <span className="sidebar-credits-icon" aria-hidden="true"><Coins size={17} /></span>
          <span className="sidebar-credits-text" data-hide={collapsed}>
            <strong>{credits.toLocaleString("pt-BR")} créditos</strong>
            <span>Adicionar créditos <ArrowRight size={13} aria-hidden="true" /></span>
          </span>
        </Link>
      </div>

      <div className="sidebar-footer" ref={profileRoot}>
        {profileOpen && <div id={profileId} className="profile-panel" ref={profilePanel}>
          <div className="profile-heading"><strong>{name}</strong><span>{email}</span></div>
          <div className="profile-options" aria-label="Opções do perfil">
            <Link href="/app/planos" className="profile-action" aria-current={pathname.startsWith("/app/planos") ? "page" : undefined} onClick={() => { setProfileOpen(false); if (window.innerWidth < 760) setCollapsed(true); }}><CreditCard size={17} />Meu plano</Link>
            {isAdmin && <Link href="/app/admin" className="profile-action" aria-current={pathname.startsWith("/app/admin") ? "page" : undefined} onClick={() => { setProfileOpen(false); if (window.innerWidth < 760) setCollapsed(true); }}><ShieldCheck size={17} />Administração</Link>}
            <ThemeToggle />
          </div>
          <form action={logout} className="profile-logout"><button type="submit" className="profile-action"><LogOut size={17} />Sair</button></form>
        </div>}
        <button type="button" className="user-row profile-trigger" ref={profileTrigger} aria-label={`Menu do perfil de ${name}`} aria-expanded={profileOpen} aria-controls={profileOpen ? profileId : undefined} title={collapsed ? name : undefined} onClick={() => setProfileOpen(open => !open)} onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setProfileOpen(true); } }}>
          <span className="avatar" aria-hidden="true">{initial}</span>
          <span className="who" data-hide={collapsed}><b>{name}</b><span>{email}</span></span>
          <ChevronUp size={16} className="profile-chevron" data-hide={collapsed} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
