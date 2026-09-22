import Link from "next/link";
import { ArrowRight, Zap } from "lucide-react";

import { StreamPreview } from "@/components/stream-preview";
import { formatPrice } from "@/lib/utils";
import type { Site } from "@/lib/types";

export function Hero({
  site,
  startingPrice,
  annualPrice,
}: {
  site: Site;
  startingPrice: number;
  annualPrice: number;
}) {
  const symbol = site.currencySymbol;

  return (
    <section className="relative overflow-hidden pb-20 pt-16 sm:pt-24">
      <div className="hero-grid absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
        style={{ background: "var(--gradient-brand)" }}
        aria-hidden
      />

      <div className="container-page relative grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
        <div className="animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Channels provisioned same day
          </span>

          <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            Your stream,
            <span className="mt-2 block text-gradient">on air and accounted for</span>
          </h1>

          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            {site.description}
          </p>

          <ul className="mt-8 flex flex-wrap gap-2">
            {site.protocols.map((protocol) => (
              <li
                key={protocol}
                className="rounded-full border border-border-strong bg-surface px-3 py-1 text-xs font-semibold text-muted-foreground"
              >
                {protocol}
              </li>
            ))}
          </ul>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/contact"
              className="group inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--gradient-brand)" }}
            >
              Get started — {symbol}
              {formatPrice(startingPrice)}/mo
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <Link
              href="/plans"
              className="inline-flex items-center justify-center rounded-lg border border-border-strong px-6 py-3 text-sm font-semibold transition-colors hover:bg-surface-2"
            >
              Compare plans
            </Link>
          </div>

          <p className="mt-8 flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">Dedicated servers</span> with a
              yearly bandwidth allowance start at {symbol}
              {formatPrice(annualPrice)}/year — no cap on concurrent viewers.
            </span>
          </p>
        </div>

        <div className="animate-rise hidden lg:block">
          <StreamPreview />
        </div>
      </div>
    </section>
  );
}
