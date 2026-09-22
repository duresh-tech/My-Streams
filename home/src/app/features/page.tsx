import type { Metadata } from "next";

import { CtaBand } from "@/components/cta-band";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeading } from "@/components/section-heading";
import { StreamPreview } from "@/components/stream-preview";
import { getFeatures, getSite } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return {
    title: "Features",
    description: `RTMP and SRT ingest, HLS delivery, dedicated servers, live health monitoring and phone control — what ${site.name} gives every channel.`,
    alternates: { canonical: "/features" },
  };
}

export default async function FeaturesPage() {
  const [site, features] = await Promise.all([getSite(), getFeatures()]);

  return (
    <>
      <section className="container-page pb-16 pt-16 sm:pt-20">
        <SectionHeading
          eyebrow="Platform"
          title={
            <>
              Built for streams that <span className="text-gradient">stay up</span>
            </>
          }
          description={site.description}
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.platform.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-surface/40 py-20">
        <div className="container-page grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Dashboard"
              title="Every number you need, live"
              description="Bitrate, frame rate, viewer count and bandwidth are sampled continuously — so you find out about a problem from the dashboard, not from your viewers."
            />
          </div>
          <StreamPreview />
        </div>
      </section>

      <section className="container-page py-20">
        <SectionHeading
          eyebrow="Control"
          title="Run the channel from anywhere"
          description="The same controls in the browser and in the Android app."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.control.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      </section>

      <CtaBand site={site} />
    </>
  );
}
