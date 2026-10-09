"use client";

import { startTransition, useEffect, useId, useRef, useState } from "react";
import { ChartNoAxesCombined, ChevronDown, RefreshCw } from "lucide-react";
import { getInstagramPostInsightsAction } from "@/app/actions/publication-assistant";
import type { InstagramPostInsights as InsightsResult } from "@/lib/publication-assistant-types";
import { displayDateTime } from "@/lib/display-date";
import styles from "./instagram-post-insights.module.css";

const METRICS = [
  ["views", "Visualizações"], ["reach", "Alcance"], ["likes", "Curtidas"],
  ["comments", "Comentários"], ["saved", "Salvamentos"], ["shares", "Compartilhamentos"],
] as const;

/** Mount with a connection-specific key so a reconnection never retains another account's metrics. */
export function InstagramPostInsights({ postId }: { postId: string }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<InsightsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => () => {
    if (request.current) clearTimeout(request.current.timer);
    request.current = null;
  }, []);

  function load() {
    if (request.current) return;
    setLoading(true);
    setError("");
    const active = { timer: setTimeout(() => {
      if (request.current !== active) return;
      request.current = null;
      setLoading(false);
      setError("A consulta demorou. Tente novamente.");
    }, 35_000) };
    request.current = active;
    startTransition(() => {
      void getInstagramPostInsightsAction(postId).then(data => {
        if (request.current !== active) return;
        if (data.postId !== postId) throw new Error("Mismatched post");
        setResult(data);
      }).catch(() => {
        if (request.current === active) setError("Não foi possível consultar os insights agora.");
      }).finally(() => {
        clearTimeout(active.timer);
        if (request.current === active) { request.current = null; setLoading(false); }
      });
    });
  }

  return (
    <div className={styles.insights}>
      <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={panelId}
        onClick={() => { setOpen(!open); if (!open && (!result || Date.now() - result.checkedAt > 300_000)) load(); }}>
        <ChartNoAxesCombined size={15} /> Insights <ChevronDown size={13} className={open ? styles.expanded : undefined} />
      </button>
      {open && <section id={panelId} className={styles.panel} aria-label="Insights desta publicação" aria-busy={loading}>
        {loading && <p role="status">Consultando Instagram…</p>}
        {result?.status === "ready" && <>
          <dl className={styles.metrics}>
            {METRICS.map(([key, label]) => <div key={key}>
              <dt>{label}</dt>
              <dd title={result.metrics[key] === undefined ? "Não disponibilizado pelo Instagram" : undefined}>
                {result.metrics[key]?.toLocaleString("pt-BR") ?? "—"}
              </dd>
            </div>)}
          </dl>
          <p className={styles.note}>{result.message}</p>
        </>}
        {result && result.status !== "ready" && <p role="status">{result.message}</p>}
        {error && <p role="alert">{error}</p>}
        <div className={styles.footer}>
          {result?.status === "ready" && <span>Consultado em {displayDateTime(result.checkedAt, "short")}</span>}
          <button type="button" className={styles.refresh} disabled={loading} onClick={load}>
            <RefreshCw size={12} /> {error ? "Tentar novamente" : "Atualizar"}
          </button>
        </div>
      </section>}
    </div>
  );
}
