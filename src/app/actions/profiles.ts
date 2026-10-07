"use server";

import { requireUser } from "@/lib/auth";
import { followProfile, listFollows, unfollowProfile } from "@/lib/db";

/** Alterna o acompanhamento de um perfil; devolve a lista atualizada de handles. */
export async function toggleFollowAction(handle: string): Promise<string[]> {
  const user = await requireUser();
  const follows = await listFollows(user.id);
  if (follows.some((f) => f.handle === handle)) {
    await unfollowProfile(user.id, handle);
  } else {
    await followProfile(user.id, handle, "instagram");
  }
  return (await listFollows(user.id)).map((f) => f.handle);
}
