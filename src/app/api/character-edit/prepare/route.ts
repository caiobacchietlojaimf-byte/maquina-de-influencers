import { cookies } from "next/headers";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { prepareEditStream } from "@/lib/prepare-edit-stream";
import type { prepareCharacterEdit } from "@/lib/prepare-character-edit";

export const runtime = "nodejs";
export const maxDuration = 240;
export const dynamic = "force-dynamic";
const MAX_BODY = 32_768;

export async function POST(request: Request) {
  // A custom header + same-origin request protects this resource-intensive operation.
  if (request.headers.get("X-MI-Prepare") !== "1" || request.headers.get("Origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Requisição inválida." }, { status: 403 });
  }
  const jar = await cookies();
  if (!readSessionToken(jar.get(SESSION_COOKIE)?.value)) return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return Response.json({ error: "Formato inválido." }, { status: 415 });
  if (Number(request.headers.get("Content-Length")) > MAX_BODY) return Response.json({ error: "Requisição muito grande." }, { status: 413 });
  let input: Parameters<typeof prepareCharacterEdit>[0];
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Empty body");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) return Response.json({ error: "Requisição muito grande." }, { status: 413 });
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input || typeof input.influencerId !== "string" || !input.influencerId || input.influencerId.length > 128 || !input.source || typeof input.source !== "object" || !["profile", "viral", "preset", "upload"].includes(input.source.kind)) throw new Error("Invalid input");
    if (input.source.kind === "upload" ? typeof input.source.token !== "string" : typeof input.source.id !== "string") throw new Error("Invalid source");
  } catch { return Response.json({ error: "Referência inválida. Selecione o vídeo novamente." }, { status: 400 }); }
  return new Response(prepareEditStream(input, { signal: request.signal }), { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "X-Content-Type-Options": "nosniff",
  } });
}
