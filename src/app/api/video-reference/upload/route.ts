import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth";
import { MAX_REFERENCE_BYTES, validUploadPath } from "@/lib/video-reference";

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({
      request, body,
      onBeforeGenerateToken: async pathname => {
        const user = await requireUser();
        if (!validUploadPath(pathname, user.id)) throw new Error("Caminho de upload inválido.");
        return { allowedContentTypes: ["video/mp4"], maximumSizeInBytes: MAX_REFERENCE_BYTES, addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 10 * 60 * 1000 };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch {
    return Response.json({ error: "Não foi possível autorizar o envio. Entre novamente e use um MP4 de até 50 MB." }, { status: 400 });
  }
}
