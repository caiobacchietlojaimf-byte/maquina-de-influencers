import { timingSafeEqual } from "node:crypto";
import { runViralCollection } from "@/lib/viral-collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Coleta agendada de vídeos de personagens de IA (vercel.json: a cada 15 min).
   Autenticada pelo CRON_SECRET como os demais crons; o lease interno impede
   execuções sobrepostas mesmo se a Vercel disparar duas vezes.
   Desligada por padrão: sem VIRAL_COLLECTION_ENABLED=true a rodada encerra
   em runViralCollection sem consultar nenhum provedor, mesmo com o cron
   declarado e disparando. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(secret ? `Bearer ${secret}` : "");
  if (!secret || authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runViralCollection({ budgetMs: 50_000 });
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[viral-cron]", { stage: "collection" });
    return Response.json({ error: "Collection unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
