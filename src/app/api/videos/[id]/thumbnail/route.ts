import { currentUser } from "@/lib/auth";
import { getVideoThumbnail } from "@/lib/video-thumbnail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 75;
const HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return Response.json({ error: "Requisição inválida." }, { status: 403, headers: HEADERS });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Faça login para continuar." }, { status: 401, headers: HEADERS });
  const { id } = await context.params;
  try {
    const result = await getVideoThumbnail(user.id, id);
    if ("url" in result) return new Response(null, { status: 307, headers: { ...HEADERS, Location: result.url } });
    return Response.json({ error: result.status === 404 ? "Vídeo indisponível." : "A capa está sendo preparada. Tente novamente em instantes." }, {
      status: result.status, headers: { ...HEADERS, ...(result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {}) },
    });
  } catch { return Response.json({ error: "Não foi possível preparar a capa agora." }, { status: 503, headers: { ...HEADERS, "Retry-After": "5" } }); }
}

// Avoid implicit GET execution (and frame extraction) for link-preview HEADs.
export async function HEAD() { return new Response(null, { status: 405, headers: { ...HEADERS, Allow: "GET" } }); }
