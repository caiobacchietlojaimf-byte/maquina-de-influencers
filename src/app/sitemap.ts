import type { MetadataRoute } from "next";
import { VIRAIS_PROPRIOS } from "@/data/virais-proprios";
import { siteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...VIRAIS_PROPRIOS.filter((item) => item.status !== "soon").map((item) => ({ url: `${base}/v/${item.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...["/termos", "/privacidade", "/exclusao-de-dados"].map((path) => ({ url: `${base}${path}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
