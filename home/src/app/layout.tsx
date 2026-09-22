import type { Metadata, Viewport } from "next";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getLegalDocuments, getPricing, getSite } from "@/lib/db";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();

  return {
    metadataBase: new URL(site.url),
    title: {
      default: `${site.name} — ${site.tagline}`,
      template: `%s | ${site.name}`,
    },
    description: site.description,
    applicationName: site.name,
    keywords: [
      "RTMP streaming server India",
      "SRT streaming hosting",
      "HLS streaming service",
      "live streaming hosting India",
      "dedicated streaming server",
      "MyStreams",
    ],
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: site.name,
      locale: site.locale,
      url: site.url,
      title: `${site.name} — ${site.tagline}`,
      description: site.description,
      images: [{ url: site.logo, width: 512, height: 512, alt: site.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${site.name} — ${site.tagline}`,
      description: site.description,
      images: [site.logo],
    },
    icons: { icon: site.logo, apple: site.logo },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: "#070b16",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [site, pricing, legal] = await Promise.all([
    getSite(),
    getPricing(),
    getLegalDocuments(),
  ]);

  // Search engines read the catalogue from the same JSON the pages render.
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${site.name} — RTMP & SRT streaming hosting`,
    url: site.url,
    description: site.description,
    serviceType: "Live streaming hosting",
    areaServed: { "@type": "Country", name: "India" },
    provider: {
      "@type": "Organization",
      name: site.legalName,
      url: site.url,
      logo: `${site.url}${site.logo}`,
      ...(site.contact.email && {
        contactPoint: {
          "@type": "ContactPoint",
          email: site.contact.email,
          contactType: "customer support",
          availableLanguage: ["English", "Tamil"],
        },
      }),
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Streaming hosting plans",
      itemListElement: pricing.groups.flatMap((group) =>
        group.plans.map((plan) => ({
          "@type": "Offer",
          name: `${plan.name} (${group.label})`,
          description: plan.summary,
          price: String(plan.price),
          priceCurrency: site.currency,
          billingIncrement: group.period === "year" ? "P1Y" : "P1M",
        })),
      ),
    },
  };

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <SiteHeader site={site} />
        <main className="flex-1">{children}</main>
        <SiteFooter site={site} legal={legal} />
      </body>
    </html>
  );
}
