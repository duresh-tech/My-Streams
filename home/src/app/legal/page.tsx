import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SectionHeading } from "@/components/section-heading";
import { getLegalDocuments, getSite } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return {
    title: "Legal",
    description: `Terms, refund policy and privacy policy for ${site.name}.`,
    alternates: { canonical: "/legal" },
  };
}

export default async function LegalIndexPage() {
  const documents = await getLegalDocuments();

  return (
    <section className="container-page pb-20 pt-16 sm:pt-20">
      <SectionHeading
        align="left"
        eyebrow="Legal"
        title="Policies"
        description="The agreements that govern the service. Written to be read, not to be skipped."
      />

      <ul className="mt-12 grid max-w-3xl gap-4">
        {documents.map((document) => (
          <li key={document.slug}>
            <Link
              href={`/legal/${document.slug}`}
              className="surface-card group flex items-start justify-between gap-6 p-6 transition-colors hover:border-border-strong"
            >
              <span>
                <span className="block text-base font-semibold">{document.title}</span>
                <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
                  {document.summary}
                </span>
              </span>
              <ArrowRight
                className="mt-1 h-4 w-4 shrink-0 text-brand-cyan transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
