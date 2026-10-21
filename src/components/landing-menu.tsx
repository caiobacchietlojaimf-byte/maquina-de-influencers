"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import styles from "./landing-menu.module.css";

export function LandingMenu({ links }: { links: ReadonlyArray<{ href: string; label: string }> }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return <>
    <button type="button" className={styles.toggle} aria-expanded={open} aria-controls="menu-mobile" aria-label={open ? "Fechar menu" : "Abrir menu"} onClick={() => setOpen(!open)}>
      {open ? <X size={20} /> : <Menu size={20} />}
    </button>
    {open ? createPortal(<div id="menu-mobile" className={styles.panel}>
      <nav aria-label="Seções da página">
        {links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}<ArrowRight size={16} aria-hidden /></a>)}
      </nav>
      <div className={styles.actions}>
        <Link href="/login" className="btn btn-ghost">Entrar</Link>
        <Link href="/login?modo=cadastro" className="btn btn-accent">Criar meu influencer <ArrowRight size={16} /></Link>
      </div>
    </div>, document.body) : null}
  </>;
}
