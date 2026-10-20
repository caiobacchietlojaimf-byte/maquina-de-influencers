import { notFound } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { getUserEntitlements } from "@/lib/plans";
import { isAdmin } from "@/lib/admin";
import { getLearningModule, LEARNING_MODULES } from "@/data/learning-modules";
import { LessonReader } from "@/components/learning-pages";

/* Leitura de um guia. A mesma regra de acesso do índice decide no servidor:
   sem plano Pro/Max (ou administrador), o conteúdo não é renderizado. */

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return LEARNING_MODULES.map((module) => ({ slug: module.slug }));
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const found = getLearningModule(slug);
  return { title: found ? `${found.module.shortTitle} · Módulos` : "Módulos" };
}

export default async function GuidePage({ params }: Params) {
  const { slug } = await params;
  const found = getLearningModule(slug);
  if (!found) notFound();
  const user = await currentUser();
  const unlocked = isAdmin(user) || getUserEntitlements(user).modules;
  return <LessonReader module={found.module} index={found.index} unlocked={unlocked} />;
}
