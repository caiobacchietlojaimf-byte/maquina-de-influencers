import "server-only";
import { notFound } from "next/navigation";
import { currentUser } from "./auth";
import type { User } from "./db";
export function isAdmin(user: Pick<User, "id"> | null | undefined): boolean {
  const ids = (process.env.ADMIN_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return !!user && ids.includes(user.id);
}
export async function requireAdmin() {
  const user = await currentUser();
  if (!isAdmin(user)) notFound();
  return user!;
}
