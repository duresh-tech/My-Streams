"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCompact } from "@/lib/dashboard";

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
}

interface TooltipItem {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  dataKey?: string | number | ((row: unknown) => unknown);
}

/** Card-styled tooltip; values in text ink, identity from the swatch beside them. */
function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string | number;
  format?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="grid min-w-36 gap-1 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{label}</div>
      {payload.map((item) => (
        <div key={String(item.name)} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
          <span>{item.name}</span>
          <span className="ml-auto pl-3 font-medium text-foreground tabular-nums">
            {format ? format(Number(item.value)) : String(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

const axisTick = { fill: "var(--viz-axis)", fontSize: 12 };

/**
 * Columns over time, one series or several stacked. Thin bars (<= 24px) with a
 * 4px rounded data end; stacked segments are split by a 2px surface gap.
 */
export function ColumnChart({
  data,
  series,
  stacked = false,
  format,
  integer = false,
  height = 240,
}: {
  data: Record<string, string | number>[];
  series: SeriesDef[];
  stacked?: boolean;
  format: (value: number) => string;
  integer?: boolean;
  height?: number;
}) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--viz-grid)" }} tick={axisTick} minTickGap={12} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            width={44}
            allowDecimals={!integer}
            tickFormatter={(value: number) => formatCompact(value)}
          />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip format={format} />} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              maxBarSize={24}
              stackId={stacked ? "stack" : undefined}
              radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
              stroke={stacked ? "var(--card)" : undefined}
              strokeWidth={stacked ? 2 : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Lines over time for two or three series of the same unit - one axis, 2px lines. */
export function TrendChart({
  data,
  series,
  format,
  integer = false,
  height = 240,
}: {
  data: Record<string, string | number>[];
  series: SeriesDef[];
  format: (value: number) => string;
  integer?: boolean;
  height?: number;
}) {
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--viz-grid)" }} tick={axisTick} minTickGap={12} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            width={44}
            allowDecimals={!integer}
            tickFormatter={(value: number) => formatCompact(value)}
          />
          <Tooltip cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }} content={<ChartTooltip format={format} />} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
