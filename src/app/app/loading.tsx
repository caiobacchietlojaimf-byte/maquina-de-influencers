/* Esqueleto exibido na hora em qualquer troca de página dentro do app: o
   Next.js pré-carrega este limite junto com os links do menu, então a
   navegação responde imediatamente enquanto o servidor monta a página. */
export default function AppLoading() {
  return (
    <div className="page-skeleton" role="status" aria-live="polite" aria-label="Carregando página">
      <div className="page-skeleton-head">
        <span className="skeleton-block" style={{ width: "42%", height: 30 }} />
        <span className="skeleton-block" style={{ width: "60%", height: 14 }} />
      </div>
      <span className="skeleton-block" style={{ height: 180, borderRadius: 20 }} />
      <div className="page-skeleton-grid">
        <span className="skeleton-block" style={{ height: 220, borderRadius: 16 }} />
        <span className="skeleton-block" style={{ height: 220, borderRadius: 16 }} />
        <span className="skeleton-block" style={{ height: 220, borderRadius: 16 }} />
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
