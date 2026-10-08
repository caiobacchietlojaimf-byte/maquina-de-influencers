import { timingSafeEqual } from "node:crypto";
import { publisherTick } from "@/lib/publisher";

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
  await publisherTick();
  return Response.json({ ok: true });
}
