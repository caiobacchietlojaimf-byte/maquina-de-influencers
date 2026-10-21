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
  if (!viral) return {};
  const title = `${viral.title}: coloque você no viral`;
  return {
    title,
    description: `${viral.description}. Mande as fotos e gere o seu na Máquina de Influencers.`,
    alternates: { canonical: `/v/${viral.slug}` },
    openGraph: { title, description: viral.description, images: [{ url: viral.poster, width: 1280, height: 720, alt: viral.title }] },
    twitter: { card: "summary_large_image", title, images: [viral.poster] },
  };
}

export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const viral = getViral((await params).slug);
  if (!viral || viral.status === "soon") notFound();
  return <TemplateStudio viral={viral} />;
}
