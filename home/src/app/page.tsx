import Link from "next/link";

import { CtaBand } from "@/components/cta-band";
import { FaqList } from "@/components/faq-list";
import { FeatureCard } from "@/components/feature-card";
import { Hero } from "@/components/hero";
import { Icon } from "@/components/icon";
import { PricingTabs } from "@/components/pricing-tabs";
import { SectionHeading } from "@/components/section-heading";
import { getFaqs, getFeatures, getPricing, getSite } from "@/lib/db";

export default async function HomePage() {
  const [site, pricing, features, faqs] = await Promise.all([
    getSite(),
    getPricing(),
    getFeatures(),
    getFaqs(),
  ]);

  const monthly = pricing.groups.find((group) => group.id === "monthly") ?? pricing.groups[0];
  const annual = pricing.groups.find((group) => group.id === "annual") ?? pricing.groups[0];
  const startingPrice = Math.min(...monthly.plans.map((plan) => plan.price));
  const annualPrice = Math.min(...annual.plans.map((plan) => plan.price));

  return (
    <>
      <Hero site={site} startingPrice={startingPrice} annualPrice={annualPrice} />

      <section className="border-y border-border bg-surface/40">
        <div className="container-page grid grid-cols-2 gap-6 py-12 md:grid-cols-4">
          {site.stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold tabular-nums sm:text-4xl">{stat.value}</p>
              <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page py-24">
        <SectionHeading
          eyebrow="Platform"
          title={
            <>
              Everything a live channel needs,{" "}
              <span className="text-gradient">nothing it does not</span>
            </>
          }
          description="Ingest, delivery and monitoring on infrastructure sized for Indian audiences."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.platform.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface/40 py-24">
        <div className="container-page grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <SectionHeading
            align="left"
            eyebrow="Control"
            title={
              <>
                Know what your stream is doing,{" "}
                <span className="text-gradient">while it is doing it</span>
              </>
            }
            description="The dashboard is not an afterthought. Viewer counts, bitrate and bandwidth are live, and the controls that matter are one click away."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {features.control.map((feature) => (
              <div key={feature.id} className="flex gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-2"
                  aria-hidden
                >
                  <Icon name={feature.icon} className="h-4 w-4 text-brand-cyan" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{feature.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-24">
        <SectionHeading
          eyebrow="Getting started"
          title="Three steps to your first broadcast"
        />
        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {features.steps.map((step, index) => (
            <li key={step.id} className="surface-card p-6">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-primary-foreground"
                style={{ background: "var(--gradient-brand)" }}
              >
                {index + 1}
              </span>
              <h3 className="mt-5 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section id="plans" className="border-y border-border bg-surface/40 py-24">
        <div className="container-page">
          <SectionHeading
            eyebrow="Pricing"
            title={
              <>
                Pick the plan that fits <span className="text-gradient">your audience</span>
              </>
            }
            description="Both tiers are sized by concurrent viewers. Paying for the year costs less than twelve months of the equivalent monthly plan, and adds SRT and the control panel from Pro upwards."
          />
          <div className="mt-12">
            <PricingTabs pricing={pricing} currencySymbol={site.currencySymbol} />
          </div>
        </div>
      </section>

      <section className="container-page py-24">
        <SectionHeading eyebrow="Questions" title="Before you commit" />
        <FaqList faqs={faqs.slice(0, 5)} />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          More questions?{" "}
          <Link href="/contact" className="font-medium text-brand-cyan hover:underline">
            Ask us directly
          </Link>
          .
        </p>
      </section>

      <CtaBand site={site} />
    </>
  );
}
