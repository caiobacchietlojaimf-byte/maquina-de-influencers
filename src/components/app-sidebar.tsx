"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, ChevronUp, Clapperboard, CreditCard, Flame, Home, LogOut, Menu, Send, ShieldCheck, Users, Wand2 } from "lucide-react";

import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const ITEMS = [
  { href: "/app", label: "Início", icon: Home, exact: true },
  { href: "/app/influencers", label: "Influencers", icon: Users, badge: "Novo" },
  { href: "/app/virais", label: "Vídeos Virais", icon: Flame, badge: "Hot" },
  { href: "/app/criar-videos", label: "Criar Vídeos", icon: Wand2, badge: "Novo" },
  { href: "/app/videos", label: "Vídeos", icon: Clapperboard },
  { href: "/app/publicar", label: "Publicar", icon: Send, badge: "Novo" },
  { href: "/app/modulos", label: "Módulos", icon: BookOpen, badge: "Pro" },
] as const;

const STORAGE_KEY = "mi-sidebar-collapsed";

export function AppSidebar({
  name,
  email,
  credits,
  logout,
  isAdmin = false,
}: {
  name: string;
  email: string;
  credits: number;
  logout: () => Promise<void>;
  isAdmin?: boolean;
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

      <div className="sidebar-credits" role="group" aria-label={`${credits.toLocaleString("pt-BR")} créditos disponíveis`} title={`${credits.toLocaleString("pt-BR")} créditos disponíveis`}>
        <div className="sidebar-credits-label"><span data-hide={collapsed}>Créditos</span><strong>{credits.toLocaleString("pt-BR")}</strong></div>
        <div className="sidebar-credits-bar" data-empty={credits <= 0} aria-hidden="true" />
      </div>

      <nav aria-label="Menu principal">
        {ITEMS.map((item) => {
          const active =
            "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href) || (item.href === "/app/modulos" && pathname.startsWith("/app/criacao-ilimitada"));
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
              {"badge" in item && item.badge && !collapsed ? (
                <span className="badge-new">{item.badge}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

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
