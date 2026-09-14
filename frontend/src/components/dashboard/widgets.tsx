"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DASHBOARD_RANGES, type DashboardRange } from "@/lib/dashboard";
import { cn } from "@/lib/utils";

/** The time range, one row above the charts. */
export function RangeTabs({ value, onChange }: { value: DashboardRange; onChange: (range: DashboardRange) => void }) {
  return (
    <div className="inline-flex rounded-lg border bg-card p-1" role="group" aria-label="Time range">
      {DASHBOARD_RANGES.map((range) => (
        <Button
          key={range.value}
          type="button"
          size="sm"
          variant={value === range.value ? "default" : "ghost"}
          aria-pressed={value === range.value}
          onClick={() => onChange(range.value)}
        >
          {range.label}
        </Button>
      ))}
    </div>
  );
}

/** A headline figure that is already formatted, such as money. */
export function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | null;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <Card className="relative overflow-hidden pt-0">
      <div className="absolute inset-x-0 top-0 h-1 bg-[image:var(--gradient-stat-border)]" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-6">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full",
            tone === "danger"
              ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
              : tone === "warning"
                ? "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                : "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
          )}
        >
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        {value === null ? <Skeleton className="h-9 w-24" /> : <div className="text-3xl font-bold">{value}</div>}
        {value !== null && hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export interface BarListItem {
  label: string;
  value: number;
  /** Defaults to the first series color; status bars pass a status token. */
  color?: string;
  hint?: string;
}

/**
 * Labelled horizontal bars for part-to-whole and rankings. The label and value
 * are always written out, so a color never carries meaning on its own.
 */
export function BarList({
  items,
  format = (value) => String(value),
  emptyText = "Nothing to show yet.",
}: {
  items: BarListItem[];
  format?: (value: number) => string;
  emptyText?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (items.length === 0 || items.every((item) => item.value === 0)) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item.label} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {item.label}
              {item.hint && <span className="ml-2 text-xs text-muted-foreground">{item.hint}</span>}
            </span>
            <span className="font-medium tabular-nums">{format(item.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full"
              style={{ width: `${(item.value / max) * 100}%`, background: item.color ?? "var(--viz-1)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A simple titled card for lists and non-chart content. */
export function PanelCard({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader className="space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
