import type { Metadata } from "next";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { LeadForm } from "@/components/lead-form";
import { SectionHeading } from "@/components/section-heading";
import { getAllPlans, getSite } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSite();
  return {
    title: "Contact",
    description: `Tell ${site.name} what you are broadcasting and get ingest details, a plan recommendation and a price — usually the same day.`,
    alternates: { canonical: "/contact" },
  };
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const [site, plans, params] = await Promise.all([getSite(), getAllPlans(), searchParams]);

  // Only prefill with a plan that actually exists in the store.
  const requested = params.plan ?? "";
  const defaultPlanId = plans.some((plan) => plan.id === requested) ? requested : "";
  const { contact } = site;

  return (
    <section className="container-page pb-20 pt-16 sm:pt-20">
      <SectionHeading
        eyebrow="Contact"
        title={
          <>
            Let us get you <span className="text-gradient">on air</span>
          </>
        }
        description="Send your encoder setup and expected audience. We reply with the ingest URL, the plan that fits and what it costs."
      />

      <div className="mt-14 grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:gap-12">
        <LeadForm
          plans={plans}
          defaultPlanId={defaultPlanId}
          whatsappNumber={contact.whatsapp}
          siteName={site.name}
        />

        <aside className="space-y-4">
          <div className="surface-card p-6">
            <h2 className="text-base font-semibold">Reach us directly</h2>
            <ul className="mt-4 space-y-4 text-sm">
              {contact.email && (
                <li className="flex gap-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-cyan" aria-hidden />
                  <div>
                    <p className="font-medium">Email</p>
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {contact.email}
                    </a>
                  </div>
                </li>
              )}
              {contact.phone && (
                <li className="flex gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-cyan" aria-hidden />
                  <div>
                    <p className="font-medium">Phone</p>
                    <a
                      href={`tel:${contact.phone.replace(/\s/g, "")}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {contact.phone}
                    </a>
                  </div>
                </li>
              )}
              {contact.whatsapp && (
                <li className="flex gap-3">
                  <MessageCircle
                    className="mt-0.5 h-4 w-4 shrink-0 text-brand-cyan"
                    aria-hidden
                  />
                  <div>
                    <p className="font-medium">WhatsApp</p>
                    <a
                      href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Start a chat
                    </a>
                  </div>
                </li>
              )}
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-cyan" aria-hidden />
                <div>
                  <p className="font-medium">Support hours</p>
                  <p className="text-muted-foreground">{contact.supportHours}</p>
                </div>
              </li>
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-cyan" aria-hidden />
                <div>
                  <p className="font-medium">Based in</p>
                  <p className="text-muted-foreground">{contact.addressLocality}, India</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="surface-card p-6">
            <h2 className="text-base font-semibold">What happens next</h2>
            <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>1. We read your setup and suggest a plan — or confirm the one you picked.</li>
              <li>2. You get an ingest URL, a stream key and a playback link to test with.</li>
              <li>3. Once the picture looks right, we invoice and the channel goes live.</li>
            </ol>
          </div>
        </aside>
      </div>
    </section>
  );
}
