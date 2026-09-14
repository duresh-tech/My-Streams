"use client";

import * as React from "react";
import { ChartColumn, Table as TableIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface LegendItem {
  label: string;
  color: string;
}

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * A titled chart with its legend and a table view of the same figures - the
 * table is how every value stays reachable without hovering or telling colors apart.
 */
export function ChartCard({
  title,
  description,
  legend,
  table,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  legend?: LegendItem[];
  table?: ChartTable;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = React.useState(false);

  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {table && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={showTable}
              onClick={() => setShowTable((value) => !value)}
            >
              {showTable ? <ChartColumn className="size-4" /> : <TableIcon className="size-4" />}
              {showTable ? "Chart" : "Table"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {/* A single series is named by the title, so it needs no legend box. */}
        {legend && legend.length > 1 && !showTable && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {legend.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        )}
        {showTable && table ? (
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {table.columns.map((column, i) => (
                    <th key={column} className={cn("py-2 pr-4 font-medium", i > 0 && "text-right")}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-b last:border-0">
                    {row.map((cell, c) => (
                      <td key={c} className={cn("py-1.5 pr-4", c > 0 && "text-right tabular-nums")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
