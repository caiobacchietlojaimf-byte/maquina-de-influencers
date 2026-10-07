"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, Flame, Home, Users } from "lucide-react";

const ITEMS = [
  { href: "/app", label: "Início", icon: Home, exact: true },
  { href: "/app/virais", label: "Vídeos Virais", icon: Flame, badge: "Hot" },
  { href: "/app/influencers", label: "Influencers", icon: Users, badge: "Novo" },
  { href: "/app/videos", label: "Vídeos", icon: Clapperboard },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav style={{ display: "grid", gap: 4 }}>
      {ITEMS.map((item) => {
        const active =
          "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className="nav-item" data-active={active}>
            <Icon size={18} />
            <span>{item.label}</span>
            {"badge" in item && item.badge ? <span className="badge-new">{item.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
