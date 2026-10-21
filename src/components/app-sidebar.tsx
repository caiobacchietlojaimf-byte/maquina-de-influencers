"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, ChevronUp, Clapperboard, Coins, CreditCard, Flame, Home, LogOut, Menu, Plus, Send, ShieldCheck, Sparkles, Users, Wand2 } from "lucide-react";

import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const GROUPS = [
  { label: null, items: [{ href: "/app", label: "Início", icon: Home, exact: true }] },
  {
    label: "Criar",
    items: [
      { href: "/app/virais", label: "Vídeos Virais", icon: Flame },
      { href: "/app/influencers", label: "Influencers", icon: Users },
      { href: "/app/criar-videos", label: "Criar Vídeos", icon: Wand2 },
    ],
  },
  {
    label: "Distribuir",
    items: [
      { href: "/app/videos", label: "Vídeos", icon: Clapperboard },
      { href: "/app/publicar", label: "Publicar", icon: Send },
    ],
  },
  { label: "Aprender", items: [{ href: "/app/modulos", label: "Módulos", icon: BookOpen, badge: "Pro" }] },
] as const;

const STORAGE_KEY = "mi-sidebar-collapsed";

/** Nome salvo todo em caixa alta aparece como "Paulo Victor" no menu. */
function prettyName(name: string) {
  const trimmed = name.trim();
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed.toLocaleLowerCase("pt-BR").replace(/(^|\s)(\p{L})/gu, (_, space: string, letter: string) => space + letter.toLocaleUpperCase("pt-BR"));
}

/** Saldo curto para o menu recolhido (10.000 → 10 mil). */
function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

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
  const displayName = prettyName(name);

  return (
    <aside className="app-sidebar" data-collapsed={collapsed}>
      <div className="sidebar-top">
        <button type="button" className="burger" onClick={toggle} title={collapsed ? "Expandir menu" : "Recolher menu"} aria-label={collapsed ? "Expandir menu" : "Recolher menu"} aria-expanded={!collapsed}>
          <Menu size={19} />
        </button>
        <Link href="/app" className="brand" data-hide={collapsed}>
          <LogoMark size={22} />
          <span>Máquina de Influencers</span>
        </Link>
      </div>

      <Link href="/app/criar-videos" className="sidebar-cta" title={collapsed ? "Criar vídeo" : undefined} aria-label="Criar vídeo"
        onClick={() => { setProfileOpen(false); if (window.innerWidth < 760) setCollapsed(true); }}>
        <Sparkles size={17} aria-hidden="true" />
        <span data-hide={collapsed}>Criar vídeo</span>
      </Link>

      <nav aria-label="Menu principal">
        {GROUPS.map((group) => (
          <div key={group.label ?? "home"} className="nav-group">
            {group.label ? <span className="nav-label" data-hide={collapsed}>{group.label}</span> : null}
            {group.items.map((item) => {
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
                    <span className="nav-tag">{item.badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer" ref={profileRoot}>
      <div className="sidebar-credits" role="group" aria-label={`${credits.toLocaleString("pt-BR")} créditos disponíveis`} title={`${credits.toLocaleString("pt-BR")} créditos disponíveis`}>
        <span className="sidebar-credits-icon" aria-hidden="true"><Coins size={15} /></span>
        <span className="sidebar-credits-label" data-hide={collapsed}>
          <span>Créditos</span>
          <strong data-empty={credits <= 0}>{credits.toLocaleString("pt-BR")}</strong>
        </span>
        <strong className="sidebar-credits-mini" data-empty={credits <= 0} aria-hidden="true">{compactNumber(credits)}</strong>
        <Link href="/app/creditos" className="sidebar-buy-credits" aria-label="Comprar créditos" title="Comprar créditos" aria-current={pathname.startsWith("/app/creditos") ? "page" : undefined}
          onClick={() => { setProfileOpen(false); if (window.innerWidth < 760) setCollapsed(true); }}>
          <Plus size={15} strokeWidth={2.4} aria-hidden="true" />
        </Link>
      </div>
        {profileOpen && <div id={profileId} className="profile-panel" ref={profilePanel}>
          <div className="profile-heading"><strong>{displayName}</strong><span>{email}</span></div>
          <div className="profile-options" aria-label="Opções do perfil">
            <Link href="/app/planos" className="profile-action" aria-current={pathname.startsWith("/app/planos") ? "page" : undefined} onClick={() => { setProfileOpen(false); if (window.innerWidth < 760) setCollapsed(true); }}><CreditCard size={17} />Meu plano</Link>
            {isAdmin && <Link href="/app/admin" className="profile-action" aria-current={pathname.startsWith("/app/admin") ? "page" : undefined} onClick={() => { setProfileOpen(false); if (window.innerWidth < 760) setCollapsed(true); }}><ShieldCheck size={17} />Administração</Link>}
            <ThemeToggle />
          </div>
          <form action={logout} className="profile-logout"><button type="submit" className="profile-action"><LogOut size={17} />Sair</button></form>
        </div>}
        <button type="button" className="user-row profile-trigger" ref={profileTrigger} aria-label={`Menu do perfil de ${name}`} aria-expanded={profileOpen} aria-controls={profileOpen ? profileId : undefined} title={collapsed ? name : undefined} onClick={() => setProfileOpen(open => !open)} onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setProfileOpen(true); } }}>
          <span className="avatar" aria-hidden="true">{initial}</span>
          <span className="who" data-hide={collapsed}><b>{displayName}</b><span>{email}</span></span>
          <ChevronUp size={16} className="profile-chevron" data-hide={collapsed} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
