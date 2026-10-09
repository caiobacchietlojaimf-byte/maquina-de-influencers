import { currentUser } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/plans";
import { UnlimitedLearning } from "@/components/learning-pages";
import { isAdmin } from "@/lib/admin";

export const metadata = { title: "Criação Ilimitada" };

export default async function UnlimitedPage() {
  const user = await currentUser();
  return <UnlimitedLearning unlocked={isAdmin(user) || getUserEntitlements(user).unlimitedCreation} />;
}
