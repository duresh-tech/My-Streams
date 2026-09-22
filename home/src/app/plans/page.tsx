import type { Metadata } from "next";

import { CtaBand } from "@/components/cta-band";
import { FaqList } from "@/components/faq-list";
import { PricingTabs } from "@/components/pricing-tabs";
import { SectionHeading } from "@/components/section-heading";
import { getFaqs, getPricing, getSite } from "@/lib/db";
import { formatPrice } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const [site, pricing] = await Promise.all([getSite(), getPricing()]);
  const lowest = Math.min(...pricing.groups.flatMap((g) => g.plans.map((p) => p.price)));

  return {
    title: "Plans and pricing",
    description: `${site.name} streaming plans from ${site.currencySymbol}${formatPrice(lowest)}/month. RTMP and SRT ingest, HLS delivery, dedicated servers and annual bandwidth packages up to 16 TB.`,
    alternates: { canonical: "/plans" },
  };
}

export default async function PlansPage() {
  const [site, pricing, faqs] = await Promise.all([getSite(), getPricing(), getFaqs()]);

  return (
    <>
      <section className="container-page pb-16 pt-16 sm:pt-20">
        <SectionHeading
          eyebrow="Pricing"
          title={
            <>
              Plans that scale with <span className="text-gradient">your audience</span>
            </>
          }
          description="Every plan includes RTMP and SRT ingest, HLS delivery, Full HD 1080p and support that answers at any hour. Change plan whenever you need to — upgrades are pro-rated."
        />
        <div className="mt-14">
          <PricingTabs pricing={pricing} currencySymbol={site.currencySymbol} />
        </div>
      </section>

      <section className="border-y border-border bg-surface/40 py-20">
        <div className="container-page">
          <SectionHeading
            eyebrow="Choosing"
            title="Monthly tier or annual plan?"
            description="Both are sized by concurrent viewers. What changes is how long you commit for, and what that commitment adds."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <article className="surface-card p-7">
              <h3 className="text-lg font-semibold">Monthly plans</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Priced by how many people watch at the same moment. Predictable, easy to start,
                and the right choice for a single channel with a known audience. You share
                infrastructure, so there is nothing to manage.
              </p>
              <p className="mt-5 text-sm font-medium text-brand-cyan">
                Best when you are starting out, or your needs may change in a few months.
              </p>
            </article>
            <article className="surface-card p-7">
              <h3 className="text-lg font-semibold">Annual plans</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The same viewer tiers, paid twelve months at a time and cheaper over the year
                than the equivalent monthly plan. Pro adds SRT ingest and delivery, your own
                subdomain and the control panel; Business lifts the bandwidth ceiling on a
                100 Mbps port.
              </p>
              <p className="mt-5 text-sm font-medium text-brand-cyan">
                Best once you know you are streaming all year, or you need SRT and dedicated
                support.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="container-page py-20">
        <SectionHeading eyebrow="Questions" title="Pricing, in plain terms" />
        <FaqList faqs={faqs} />
      </section>

      <CtaBand site={site} />
    </>
  );
}
