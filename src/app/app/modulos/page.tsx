import { currentUser } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/plans";
import { LessonLibrary } from "@/components/learning-pages";
import { isAdmin } from "@/lib/admin";

export const metadata = { title: "Módulos" };

export default async function ModulesPage() {
  const user = await currentUser();
  return <LessonLibrary unlocked={isAdmin(user) || getUserEntitlements(user).modules} />;
}
