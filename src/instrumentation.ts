/* Processos de fundo do servidor Next:
   - agendador de publicações (a cada 60s)
   - mineração periódica de tendências (a cada 30min, região BR)
   Registrado uma vez por processo; os erros são engolidos para o loop nunca
   derrubar o servidor. */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Em serverless não há processo persistente: o agendador roda pelo polling
  // das páginas (pollPostsAction) e a mineração na visita à página de virais.
  if (process.env.VERCEL) return;

  const { publisherTick } = await import("./lib/publisher");
  const { mineTrending } = await import("./lib/miner");

  setInterval(() => {
    publisherTick().catch(() => undefined);
  }, 60_000);

  const mine = () => {
    mineTrending("BR").catch(() => undefined);
  };
  setTimeout(mine, 10_000);
  setInterval(mine, 30 * 60_000);
}
