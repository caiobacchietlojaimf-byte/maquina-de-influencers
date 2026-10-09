import { timingSafeEqual } from "node:crypto";
import { publisherTick } from "@/lib/publisher";
import { startPublicationCronRun, finishPublicationCronRun } from "@/lib/publication-cron-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(secret ? `Bearer ${secret}` : "");
  if (
    !secret ||
    authorization.length !== expected.length ||
    !timingSafeEqual(authorization, expected)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let run: Awaited<ReturnType<typeof startPublicationCronRun>> | undefined;
  try { run = await startPublicationCronRun(); }
  catch { console.error("[publication-cron]", { stage: "health-start" }); }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      publisherTick(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Cron deadline")), 40_000);
      }),
    ]);
    if (run) await finishPublicationCronRun(run, true).catch(() => {
      console.error("[publication-cron]", { stage: "health-success" });
    });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    if (run) await finishPublicationCronRun(run, false).catch(() => {
      console.error("[publication-cron]", { stage: "health-error" });
    });
    return Response.json({ error: "Publisher unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
