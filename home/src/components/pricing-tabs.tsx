"use client";

import { useState } from "react";

import { PlanCard } from "@/components/plan-card";
import { cn } from "@/lib/utils";
import type { Pricing } from "@/lib/types";

export function PricingTabs({
  pricing,
  currencySymbol,
}: {
  pricing: Pricing;
  currencySymbol: string;
}) {
  const [activeId, setActiveId] = useState(pricing.groups[0]?.id ?? "");
  const active = pricing.groups.find((group) => group.id === activeId) ?? pricing.groups[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Billing options"
        className="mx-auto flex w-fit gap-1 rounded-xl border border-border bg-surface p-1"
      >
        {pricing.groups.map((group) => (
          <button
            key={group.id}
            type="button"
            role="tab"
            id={`tab-${group.id}`}
            aria-selected={group.id === active.id}
            aria-controls={`panel-${group.id}`}
            onClick={() => setActiveId(group.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              group.id === active.id
                ? "bg-surface-3 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {group.label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-sm text-muted-foreground">{active.blurb}</p>

      <div
        role="tabpanel"
        id={`panel-${active.id}`}
        aria-labelledby={`tab-${active.id}`}
        className={cn(
          "mt-10 grid gap-5",
          active.plans.length > 3
            ? "sm:grid-cols-2 lg:grid-cols-4"
            : "sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {active.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            periodSuffix={active.periodSuffix}
            currencySymbol={currencySymbol}
          />
        ))}
      </div>

      <ul className="mt-8 space-y-1 text-center text-xs text-subtle-foreground">
        {pricing.footnotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
