import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { Logo } from "@/components/logo";
import type { LegalDocument, Site } from "@/lib/types";

export function SiteFooter({ site, legal }: { site: Site; legal: LegalDocument[] }) {
  const { contact } = site;
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-border bg-surface/50">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1.1fr]">
        <div>
          <Logo name={site.name} src={site.logo} />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {site.description}
          </p>
          <p className="mt-4 text-sm text-subtle-foreground">{site.url.replace("https://", "")}</p>
        </div>

        <nav aria-label="Footer">
          <h2 className="text-sm font-semibold text-foreground">Site</h2>
          <ul className="mt-4 space-y-2.5">
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal">
          <h2 className="text-sm font-semibold text-foreground">Legal</h2>
          <ul className="mt-4 space-y-2.5">
            {legal.map((document) => (
              <li key={document.slug}>
                <Link
                  href={`/legal/${document.slug}`}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {document.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold text-foreground">Get in touch</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            {contact.email && (
              <li>
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-2 transition-colors hover:text-foreground"
                >
                  <Mail className="h-4 w-4 shrink-0 text-brand-cyan" aria-hidden />
                  {contact.email}
                </a>
              </li>
            )}
            {contact.phone && (
              <li>
                <a
                  href={`tel:${contact.phone.replace(/\s/g, "")}`}
                  className="flex items-center gap-2 transition-colors hover:text-foreground"
                >
                  <Phone className="h-4 w-4 shrink-0 text-brand-cyan" aria-hidden />
                  {contact.phone}
                </a>
              </li>
            )}
            {contact.whatsapp && (
              <li>
                <a
                  href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`}
                  className="flex items-center gap-2 transition-colors hover:text-foreground"
                >
                  <MessageCircle className="h-4 w-4 shrink-0 text-brand-cyan" aria-hidden />
                  WhatsApp
                </a>
              </li>
            )}
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-brand-cyan" aria-hidden />
              {contact.addressLocality}, India
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-subtle-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {year} {site.legalName}. All rights reserved.
          </p>
          <p>Support {contact.supportHours}</p>
        </div>
      </div>
    </footer>
  );
}
