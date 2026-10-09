"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  getPublishedPostEditor, savePublishedPostCaptionDraft, syncPublishedPostCaption,
  type PublishedPostEditorResult, type SavePublishedCaptionDraftInput,
} from "@/lib/published-post-editor";

export async function getPublishedPostEditorAction(postId: string): Promise<PublishedPostEditorResult> {
  const user = await requireUser();
  try { return await getPublishedPostEditor(user.id, postId); }
  catch { return { error: "Não foi possível abrir esta publicação agora. Tente novamente em instantes." }; }
}

export async function savePublishedCaptionDraftAction(input: SavePublishedCaptionDraftInput): Promise<PublishedPostEditorResult> {
  const user = await requireUser();
  try {
    const result = await savePublishedPostCaptionDraft(user.id, input);
    if ("editor" in result) revalidatePath("/app/publicar");
    return result;
  } catch { return { error: "Não foi possível salvar o rascunho agora. Mantenha o texto aberto e tente novamente." }; }
}

export async function syncPublishedPostCaptionAction(postId: string): Promise<PublishedPostEditorResult> {
  const user = await requireUser();
  try {
    const result = await syncPublishedPostCaption(user.id, postId);
    if ("editor" in result) revalidatePath("/app/publicar");
    return result;
  } catch { return { error: "Não foi possível conferir a legenda no Instagram agora. Seu rascunho foi preservado." }; }
}
