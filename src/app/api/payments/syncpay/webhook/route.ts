import { isUuid, reconcilePayment, verifySyncPaySignature } from "@/lib/syncpay";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!process.env.SYNCPAY_WEBHOOK_SECRET) return Response.json({ error: "Unavailable" }, { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > 131072) return new Response(null, { status: 413 });
  const reader = request.body?.getReader(); if (!reader) return new Response(null, { status: 400 });
  const parts: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 131072) { await reader.cancel(); return new Response(null, { status: 413 }); } parts.push(value); }
  const raw = Buffer.concat(parts).toString("utf8");
  if (!verifySyncPaySignature(raw, request.headers.get("x-syncpay-signature"))) return new Response(null, { status: 401 });
  try {
    const event = JSON.parse(raw);
    if (!["transaction.updated", "transaction.created"].includes(event.event)) return Response.json({ received: true });
    if (!isUuid(event.event_id) || !isUuid(event.transaction?.reference_id)) return new Response(null, { status: 400 });
    // The payload is only a notification. Financial state comes from the
    // authenticated seller API, and settlement is atomic in PostgreSQL.
    await reconcilePayment(event.transaction.reference_id);
    return Response.json({ received: true });
  } catch { return Response.json({ error: "Retry later" }, { status: 503 }); }
}
