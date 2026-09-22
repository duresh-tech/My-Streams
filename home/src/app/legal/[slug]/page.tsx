import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionHeading } from "@/components/section-heading";
import { getLegalDocument, getLegalDocuments, getSite } from "@/lib/db";
import { interpolate } from "@/lib/utils";

export async function generateStaticParams() {
  const documents = await getLegalDocuments();
  return documents.map((document) => ({ slug: document.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const document = await getLegalDocument(slug);

  if (!document) return {};

  return {
    title: document.title,
    description: document.summary,
    alternates: { canonical: `/legal/${document.slug}` },
  };
}

export default async function LegalDocumentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [site, document, documents] = await Promise.all([
    getSite(),
    getLegalDocument(slug),
    getLegalDocuments(),
  ]);

  if (!document) notFound();

  // Contact details live in site.json only; the documents reference them as
  // {{tokens}} so they cannot drift apart.
  const tokens = {
    siteName: site.name,
    siteUrl: site.url.replace("https://", ""),
    email: site.contact.email,
  };
  const fill = (text: string) => interpolate(text, tokens);

  const updated = new Date(document.updated).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const others = documents.filter((entry) => entry.slug !== document.slug);

  return (
    <article className="container-page pb-20 pt-16 sm:pt-20">
      <SectionHeading
        align="left"
        eyebrow="Legal"
        title={document.title}
        description={document.summary}
      />

      <p className="mt-6 text-sm text-subtle-foreground">Last updated {updated}</p>

      <div className="mt-10 max-w-3xl">
        <p className="text-base leading-relaxed text-muted-foreground">{fill(document.intro)}</p>

        {document.sections.map((section) => (
          <section key={section.heading} className="mt-10">
            <h2 className="text-lg font-semibold text-foreground">{section.heading}</h2>

            {/* Index keys: these lists are static and never reorder, and the raw
                text would otherwise leak un-interpolated into the RSC payload. */}
            {section.body.map((paragraph, index) => (
              <p key={index} className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {fill(paragraph)}
              </p>
            ))}

            {section.list && (
              <ul className="mt-4 space-y-2">
                {section.list.map((item, index) => (
                  <li
                    key={index}
                    className="flex gap-3 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-cyan" aria-hidden />
                    <span>{fill(item)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <nav aria-label="Other policies" className="mt-16 border-t border-border pt-8">
        <h2 className="text-sm font-semibold">Other policies</h2>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {others.map((entry) => (
            <li key={entry.slug}>
              <Link
                href={`/legal/${entry.slug}`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {entry.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
