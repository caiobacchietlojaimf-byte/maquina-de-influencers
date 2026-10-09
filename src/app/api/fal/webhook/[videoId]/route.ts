import { after } from "next/server";
import { getVideoById } from "@/lib/db";
import { verifyFalWebhook } from "@/lib/fal-webhook";
import { reconcileFalVideo } from "@/lib/reconcile-fal-video";

export const runtime = "nodejs";
export const maxDuration = 240;
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ videoId: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { videoId } = await context.params;
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(videoId)) return new Response(null, { status: 404, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json") || Number(request.headers.get("content-length")) > 65536) return new Response(null, { status: 413, headers });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400, headers });
  let body: Buffer;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { timedOut = true; reject(new Error("Body deadline exceeded")); }, 10_000);
  });
  try {
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const part = await Promise.race([reader.read(), deadline]); if (part.done) break; size += part.value.length; if (size > 65536) return new Response(null, { status: 413, headers }); chunks.push(part.value); }
    body = Buffer.concat(chunks);
  } catch { return new Response(null, { status: timedOut ? 408 : 400, headers }); }
  finally { clearTimeout(timer); void reader.cancel().catch(() => undefined); }
  try {
    if (!await verifyFalWebhook(request.headers, body)) return new Response(null, { status: 401, headers });
  } catch { return new Response(null, { status: 503, headers }); }
  let requestId: string;
  try {
    const payload = JSON.parse(body.toString("utf8"));
    requestId = payload.request_id;
    const signedId = request.headers.get("x-fal-webhook-request-id");
    if (typeof requestId !== "string" || ![requestId, payload.gateway_request_id].includes(signedId)) throw new Error("Invalid request");
  } catch { return new Response(null, { status: 400, headers }); }
  const video = await getVideoById(videoId);
  if (!video || video.deletedAt || video.edit?.provider !== "fal") return new Response(null, { status: 404, headers });
  const known = [video.requestId, ...(video.edit.segments?.map(part => part.requestId) ?? [])].includes(requestId);
  if (!known) return new Response(null, { status: video.status === "queued" ? 503 : 400, headers });
  if (video.status === "queued" && Date.now() - video.createdAt <= 300_000) return new Response(null, { status: 503, headers });
  if (video.status !== "completed") after(async () => {
    try {
      const current = await getVideoById(videoId);
      if (current) await reconcileFalVideo(current, true);
    } catch { console.error("[fal-webhook]", { stage: "reconcile", videoId }); }
  });
  // The callback is only a wake-up. All state and media URLs come from authenticated GETs.
  return new Response(null, { status: 204, headers });
}
