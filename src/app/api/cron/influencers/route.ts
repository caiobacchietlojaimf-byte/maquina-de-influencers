import { timingSafeEqual } from "node:crypto";
import { listPendingInfluencers } from "@/lib/db";
import { finalizeInfluencers } from "@/lib/influencer-finalization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(secret ? `Bearer ${secret}` : "");
  if (!secret || authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      listPendingInfluencers(8).then(finalizeInfluencers),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Finalization deadline")), 95_000);
      }),
    ]);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[influencer-cron]", { stage: "finalization" });
    return Response.json({ error: "Finalization unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
