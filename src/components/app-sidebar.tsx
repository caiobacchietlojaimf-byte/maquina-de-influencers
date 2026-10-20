"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ChevronUp, Clapperboard, Coins, CreditCard, Flame, GraduationCap, Home, LogOut, Menu, Send, ShieldCheck, Users, Wand2, X } from "lucide-react";

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
/* Abaixo desta largura o menu vira uma gaveta fechada por padrão, aberta pela barra superior. */
const NARROW_QUERY = "(max-width: 760px)";

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
  const [narrow, setNarrow] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileId = useId();
  const sidebarId = useId();
  const topBurger = useRef<HTMLButtonElement>(null);
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

  // Estado inicial (desktop): preferência salva; sem preferência, recolhe em telas médias.
  useEffect(() => {
    if (window.matchMedia(NARROW_QUERY).matches) return;
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
    const media = window.matchMedia(NARROW_QUERY);
    const sync = () => { setNarrow(media.matches); setMobileOpen(false); };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // Gaveta aberta: trava a rolagem da página e fecha com Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileOpen(false);
      topBurger.current?.focus();
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", escape);
    };
  }, [mobileOpen]);

  const closeDrawer = () => setMobileOpen(false);

  const toggle = () => {
    setProfileOpen(false);
    if (narrow) { setMobileOpen((open) => !open); return; }
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

  const shown = narrow ? false : collapsed;
  const burgerLabel = narrow ? "Fechar menu" : collapsed ? "Expandir menu" : "Recolher menu";

  return (
    <>
      <header className="app-topbar">
        <button type="button" className="burger" ref={topBurger} onClick={toggle} title="Abrir menu" aria-label="Abrir menu" aria-expanded={mobileOpen} aria-controls={sidebarId}>
          <Menu size={20} />
        </button>
        <Link href="/app" className="brand" onClick={closeDrawer}>
          <LogoMark size={22} />
          <span>MÁQUINA DE INFLUENCERS</span>
        </Link>
        <Link href="/app/creditos" className="topbar-credits" aria-label={`${credits.toLocaleString("pt-BR")} créditos. Adicionar créditos`} onClick={closeDrawer}>
          <Coins size={15} aria-hidden="true" />
          {credits.toLocaleString("pt-BR")}
        </Link>
      </header>
      {mobileOpen ? <div className="sidebar-backdrop" onClick={closeDrawer} aria-hidden="true" /> : null}
    <aside id={sidebarId} className="app-sidebar" data-collapsed={shown} data-mobile-open={mobileOpen} inert={narrow && !mobileOpen ? true : undefined}>
      <div className="sidebar-top">
        <button type="button" className="burger" onClick={toggle} title={burgerLabel} aria-label={burgerLabel} aria-expanded={narrow ? mobileOpen : !collapsed}>
          {narrow ? <X size={19} /> : <Menu size={19} />}
        </button>
        <Link href="/app" className="brand" data-hide={shown} onClick={closeDrawer}>
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
              onClick={() => { setProfileOpen(false); closeDrawer(); }}
              title={shown ? item.label : undefined}
            >
              <Icon size={18} />
              <span data-hide={shown}>{item.label}</span>
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
              onClick={() => { setProfileOpen(false); closeDrawer(); }}
              title={shown || learnLocked ? label : undefined}
            >
              <LEARN.icon size={18} />
              <span data-hide={shown}>{LEARN.label}</span>
              {learnLocked && !shown ? <span className="nav-tag">Pro</span> : null}
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
          title={shown ? `${credits.toLocaleString("pt-BR")} créditos · Adicionar créditos` : undefined}
          onClick={() => { setProfileOpen(false); closeDrawer(); }}
        >
          <span className="sidebar-credits-icon" aria-hidden="true"><Coins size={17} /></span>
          <span className="sidebar-credits-text" data-hide={shown}>
            <strong>{credits.toLocaleString("pt-BR")} créditos</strong>
            <span>Adicionar créditos <ArrowRight size={13} aria-hidden="true" /></span>
          </span>
        </Link>
      </div>

      <div className="sidebar-footer" ref={profileRoot}>
        {profileOpen && <div id={profileId} className="profile-panel" ref={profilePanel}>
          <div className="profile-heading"><strong>{name}</strong><span>{email}</span></div>
          <div className="profile-options" aria-label="Opções do perfil">
            <Link href="/app/planos" className="profile-action" aria-current={pathname.startsWith("/app/planos") ? "page" : undefined} onClick={() => { setProfileOpen(false); closeDrawer(); }}><CreditCard size={17} />Meu plano</Link>
            {isAdmin && <Link href="/app/admin" className="profile-action" aria-current={pathname.startsWith("/app/admin") ? "page" : undefined} onClick={() => { setProfileOpen(false); closeDrawer(); }}><ShieldCheck size={17} />Administração</Link>}
            <ThemeToggle />
          </div>
          <form action={logout} className="profile-logout"><button type="submit" className="profile-action"><LogOut size={17} />Sair</button></form>
        </div>}
        <button type="button" className="user-row profile-trigger" ref={profileTrigger} aria-label={`Menu do perfil de ${name}`} aria-expanded={profileOpen} aria-controls={profileOpen ? profileId : undefined} title={shown ? name : undefined} onClick={() => setProfileOpen(open => !open)} onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setProfileOpen(true); } }}>
          <span className="avatar" aria-hidden="true">{initial}</span>
          <span className="who" data-hide={shown}><b>{name}</b><span>{email}</span></span>
          <ChevronUp size={16} className="profile-chevron" data-hide={shown} aria-hidden="true" />
        </button>
      </div>
    </aside>
    </>
  );
}
