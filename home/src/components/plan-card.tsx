import Link from "next/link";
import { Check } from "lucide-react";

import { cn, formatPrice } from "@/lib/utils";
import type { Plan } from "@/lib/types";

interface PlanCardProps {
  plan: Plan;
  periodSuffix: string;
  currencySymbol: string;
}

export function PlanCard({ plan, periodSuffix, currencySymbol }: PlanCardProps) {
  return (
    <article
      className={cn(
        "surface-card relative flex flex-col p-6 transition-transform duration-300 hover:-translate-y-1",
        plan.popular && "border-brand-blue/60 shadow-[var(--shadow-glow)]",
      )}
    >
      {plan.popular && (
        <span
          className="absolute -top-3 left-6 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground"
          style={{ background: "var(--gradient-brand)" }}
        >
          Most popular
        </span>
      )}

      <h3 className="text-lg font-semibold">{plan.name}</h3>
      <p className="mt-1.5 min-h-10 text-sm leading-relaxed text-muted-foreground">
        {plan.summary}
      </p>

      <p className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight tabular-nums">
          {currencySymbol}
          {formatPrice(plan.price)}
        </span>
        <span className="text-sm text-subtle-foreground">{periodSuffix}</span>
      </p>

      <p className="mt-2 text-sm font-medium text-brand-cyan">{plan.highlight}</p>

      <ul className="mt-6 flex-1 space-y-2.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2.5 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={`/contact?plan=${plan.id}`}
        className={cn(
          "mt-7 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition-colors",
          plan.popular
            ? "text-primary-foreground"
            : "border border-border-strong text-foreground hover:bg-surface-2",
        )}
        style={plan.popular ? { background: "var(--gradient-brand)" } : undefined}
      >
        Choose {plan.name}
      </Link>
    </article>
  );
}
