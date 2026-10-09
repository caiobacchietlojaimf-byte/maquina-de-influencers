import { currentUser } from "@/lib/auth";
import { retryVideoFinalization } from "@/lib/retry-video-finalization";

export const runtime = "nodejs";
export const maxDuration = 240;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (request.headers.get("X-MI-Finalize") !== "1" || request.headers.get("Origin") !== new URL(request.url).origin) return Response.json({ error: "Requisição inválida." }, { status: 403, headers });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401, headers });
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return Response.json({ error: "Formato inválido." }, { status: 415, headers });
  let input: { videoId: string };
  try {
    const body = await request.text();
    if (body.length > 1024) throw new Error("Invalid body");
    input = JSON.parse(body);
    if (!input || typeof input.videoId !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.videoId)) throw new Error("Invalid id");
  } catch { return Response.json({ error: "Selecione um vídeo válido." }, { status: 400, headers }); }
  const { status, ...body } = await retryVideoFinalization(user.id, input.videoId);
  return Response.json(body, { status, headers });
}
