import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TemplateStudio } from "@/components/template-studio";
import { VIRAIS_PROPRIOS, getViral } from "@/data/virais-proprios";

export function generateStaticParams() {
  return VIRAIS_PROPRIOS.filter((item) => item.status !== "soon").map((item) => ({ slug: item.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const viral = getViral((await params).slug);
  return viral ? { title: viral.title, description: viral.description } : {};
}

export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const viral = getViral((await params).slug);
  if (!viral || viral.status === "soon") notFound();
  return <TemplateStudio viral={viral} />;
}
