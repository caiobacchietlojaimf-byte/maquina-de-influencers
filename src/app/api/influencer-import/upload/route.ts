import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth";
import { IMPORT_CONTENT_TYPES, MAX_IMPORT_BYTES, validImportPath } from "@/lib/influencer-import";

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({
      request, body,
      onBeforeGenerateToken: async pathname => {
        const user = await requireUser();
        if (!validImportPath(pathname, user.id)) throw new Error("Caminho de upload inválido.");
        return { allowedContentTypes: IMPORT_CONTENT_TYPES, maximumSizeInBytes: MAX_IMPORT_BYTES, addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 10 * 60 * 1000 };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (error) {
    console.error("influencer-import-upload", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Não foi possível autorizar o envio. Entre novamente e use uma imagem PNG, JPG ou WebP de até 15 MB." }, { status: 400 });
  }
}
