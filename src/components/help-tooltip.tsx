"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./help-tooltip.module.css";

export function HelpTooltip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinned = useRef(false);
  const hovered = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }
  function dismiss() {
    cancelClose();
    pinned.current = false;
    hovered.current = false;
    setOpen(false);
  }
  function leave() {
    hovered.current = false;
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!pinned.current && document.activeElement !== trigger.current) setOpen(false);
    }, 150);
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current || !tooltip.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const bubble = tooltip.current.getBoundingClientRect();
    const below = anchor.bottom + 8;
    setPosition({
      left: Math.max(12, Math.min(anchor.right - bubble.width, window.innerWidth - bubble.width - 12)),
      top: Math.max(12, below + bubble.height <= window.innerHeight - 12 ? below : anchor.top - bubble.height - 8),
    });
  }, [open, children]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !tooltip.current?.contains(event.target)) dismiss();
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    function scroll(event: Event) {
      if (!(event.target instanceof Node) || !tooltip.current?.contains(event.target)) dismiss();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keydown);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  return <>
    <button
      ref={trigger}
      type="button"
      className={styles.trigger}
      aria-label={label}
      aria-describedby={open ? id : undefined}
      onPointerEnter={event => { if (event.pointerType === "mouse") { hovered.current = true; cancelClose(); setOpen(true); } }}
      onPointerLeave={leave}
      onFocus={() => { cancelClose(); setOpen(true); }}
      onBlur={() => { pinned.current = false; if (!hovered.current) dismiss(); }}
      onClick={() => { cancelClose(); pinned.current = !pinned.current; setOpen(pinned.current); }}
    >?</button>
    {open && createPortal(
      <span ref={tooltip} id={id} role="tooltip" className={styles.tooltip} style={position}
        onPointerEnter={() => { hovered.current = true; cancelClose(); }}
        onPointerLeave={leave}
      >{children}</span>,
      document.body,
    )}
  </>;
}
