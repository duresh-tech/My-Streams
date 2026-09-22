import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { Site } from "@/lib/types";

export function CtaBand({ site }: { site: Site }) {
  return (
    <section className="container-page">
      <div className="surface-card relative overflow-hidden px-6 py-12 text-center sm:px-12">
        <div
          className="pointer-events-none absolute inset-x-0 -top-32 mx-auto h-64 w-2/3 rounded-full opacity-20 blur-[100px]"
          style={{ background: "var(--gradient-brand)" }}
          aria-hidden
        />
        <div className="relative">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Tell us what you are broadcasting
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Send the encoder you use and the audience you expect. We will come back with the
            right plan, the ingest details and a price — no call required.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/contact"
              className="group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--gradient-brand)" }}
            >
              Send an enquiry
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            {site.contact.email && (
              <a
                href={`mailto:${site.contact.email}`}
                className="inline-flex items-center justify-center rounded-lg border border-border-strong px-6 py-3 text-sm font-semibold transition-colors hover:bg-surface-2"
              >
                {site.contact.email}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
