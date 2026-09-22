import type { MetadataRoute } from "next";

import { getLegalDocuments, getSite } from "@/lib/db";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [site, legal] = await Promise.all([getSite(), getLegalDocuments()]);
  const lastModified = new Date();

  const pages: MetadataRoute.Sitemap = site.nav.map((item) => ({
    url: `${site.url}${item.href === "/" ? "" : item.href}`,
    lastModified,
    changeFrequency: "monthly",
    priority: item.href === "/" ? 1 : 0.8,
  }));

  const policies: MetadataRoute.Sitemap = legal.map((document) => ({
    url: `${site.url}/legal/${document.slug}`,
    lastModified: new Date(document.updated),
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  return [...pages, { url: `${site.url}/legal`, lastModified, priority: 0.4 }, ...policies];
}
