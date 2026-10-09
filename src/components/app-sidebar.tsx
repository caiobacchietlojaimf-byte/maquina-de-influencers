"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Clapperboard, CreditCard, Flame, Home, Infinity, LogOut, Menu, Send, ShieldCheck, Users, Wand2 } from "lucide-react";

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
  { href: "/app/criacao-ilimitada", label: "Criação Ilimitada", icon: Infinity, badge: "Max" },
  { href: "/app/planos", label: "Meu plano", icon: CreditCard },
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
          const active =
            "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="nav-item"
              data-active={active}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              onClick={() => { if (window.innerWidth < 760) setCollapsed(true); }}
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
        {isAdmin ? <Link href="/app/admin" className="nav-item" data-active={pathname.startsWith("/app/admin")} aria-label="Administração" title={collapsed ? "Administração" : undefined} onClick={() => { if (window.innerWidth < 760) setCollapsed(true); }}><ShieldCheck size={18} /><span data-hide={collapsed}>Administração</span></Link> : null}
      </nav>

      <div className="sidebar-footer">
        <ThemeToggle compact={collapsed} />
        <div className="credit-pill" title={`${credits.toLocaleString("pt-BR")} créditos`}>
          <span data-hide={collapsed}>Créditos</span>
          <b>{collapsed ? "✦" : credits.toLocaleString("pt-BR")}</b>
        </div>
        <div className="user-row">
          <div className="avatar" title={name}>
            {initial}
          </div>
          <div className="who" data-hide={collapsed}>
            <b>{name}</b>
            <span>{email}</span>
          </div>
          <form action={logout} style={{ marginLeft: collapsed ? 0 : "auto" }}>
            <button type="submit" title="Sair" className="nav-item" style={{ height: 34, padding: "0 8px" }}>
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
