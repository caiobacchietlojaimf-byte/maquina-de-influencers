/* Processos de fundo do servidor Next (só fora da Vercel):
   - agendador de publicações (a cada 60s)
   - coleta de vídeos de personagens de IA (a cada 15min, mesmo intervalo do cron)
   Registrado uma vez por processo; os erros são engolidos para o loop nunca
   derrubar o servidor. */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Em serverless não há processo persistente: publicação e coleta rodam
  // pelos crons de vercel.json (/api/cron/publish, /api/cron/virals).
  if (process.env.VERCEL) return;

  const { publisherTick } = await import("./lib/publisher");
  const { runViralCollection, COLLECT_INTERVAL_MS, collectionEnabled } = await import("./lib/viral-collector");

  setInterval(() => {
    publisherTick().catch(() => undefined);
  }, 60_000);

  // Coleta automática só com VIRAL_COLLECTION_ENABLED=true (mesma trava do cron).
  if (!collectionEnabled()) return;
  const collect = () => {
    runViralCollection().catch(() => undefined);
  };
  setTimeout(collect, 10_000);
  setInterval(collect, COLLECT_INTERVAL_MS);
}
