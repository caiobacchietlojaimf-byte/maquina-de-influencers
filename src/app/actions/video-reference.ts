"use server";
import { head } from "@vercel/blob";
import { requireUser } from "@/lib/auth";
import { validateEditSource } from "@/lib/character-edit";
import { MAX_REFERENCE_BYTES, mp4Metadata, validUploadPath, type StudioReference } from "@/lib/video-reference";
import { signUploadedReference } from "@/lib/uploaded-reference";

export async function verifyVideoReferenceAction(pathname: string, name: string): Promise<{ reference: StudioReference } | { error: string }> {
  const user = await requireUser();
  if (!validUploadPath(pathname, user.id)) return { error: "Referência não pertence à sua conta." };
  try {
    const blob = await head(pathname);
    if (blob.size > MAX_REFERENCE_BYTES || blob.contentType !== "video/mp4") return { error: "Envie um vídeo MP4 de até 50 MB." };
    const response = await fetch(blob.url, { redirect: "error", signal: AbortSignal.timeout(45000), cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível ler o vídeo enviado.");
    const metadata = mp4Metadata(new Uint8Array(await response.arrayBuffer()));
    const invalid = validateEditSource(metadata);
    if (invalid) return { error: invalid };
    const duration = metadata.duration;
    const reference: StudioReference = { kind: "upload", id: pathname, name: name.trim().slice(0, 100) || "Meu vídeo", videoUrl: blob.url, duration };
    return { reference: { ...reference, token: signUploadedReference(reference, user.id) } };
  } catch { return { error: "Não foi possível validar o vídeo. Use um MP4 reproduzível de 4 a 30 segundos e tente novamente." }; }
}
