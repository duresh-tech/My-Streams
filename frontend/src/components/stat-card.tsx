"use client";

import * as React from "react";
import { animate } from "motion/react";
import { TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TINTS = {
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
} as const;

export type StatCardTint = keyof typeof TINTS;

interface StatCardProps {
  label: string;
  value: number | null;
  icon: React.ComponentType<{ className?: string }>;
  tint?: StatCardTint;
  trend?: string;
}

function useCountUp(target: number | null) {
  const [value, setValue] = React.useState(0);

  React.useEffect(() => {
    if (target == null) return;
    const controls = animate(0, target, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [target]);

  return value;
}

export function StatCard({ label, value, icon: Icon, tint = "indigo", trend }: StatCardProps) {
  const displayValue = useCountUp(value);

  return (
    <Card className="relative overflow-hidden pt-0">
      <div className="absolute inset-x-0 top-0 h-1 bg-[image:var(--gradient-stat-border)]" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-6">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className={cn("flex size-9 items-center justify-center rounded-full", TINTS[tint])}>
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        {value === null ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <div className="text-3xl font-bold tabular-nums">{displayValue}</div>
        )}
        {value !== null && trend && (
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-success">
            <TrendingUp className="size-3.5" />
            {trend}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
