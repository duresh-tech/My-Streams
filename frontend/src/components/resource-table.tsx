"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppSettings } from "@/hooks/use-app-settings";

const MotionTableRow = motion.create(TableRow);
const SKELETON_ROWS = 5;

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

/**
 * Optional grouping. Rows carrying the same `key` are drawn together under one
 * banner, and `header` renders that banner from the first row of the group.
 *
 * Grouping happens over the rows currently on screen, not the whole result
 * set: the table is paginated server-side, so a group that spans a page
 * boundary appears on both pages. Filtering to one group is what a caller
 * should offer when a complete view of it matters.
 */
export interface GroupBy<T> {
  key: (row: T) => string;
  header: (row: T, count: number) => React.ReactNode;
}

/** Buckets rows by key, preserving first-seen order so unsorted input still
 * produces contiguous groups rather than interleaved ones. */
function groupRows<T>(rows: T[], groupBy: GroupBy<T>): Array<{ key: string; rows: T[] }> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupBy.key(row);
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }
  return [...groups].map(([key, groupedRows]) => ({ key, rows: groupedRows }));
}

interface ResourceTableProps<T> {
  title: string;
  description: string;
  columns: Column<T>[];
  rows: T[] | null;
  error: string | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  toolbarAction?: React.ReactNode;
  actionsHeader?: string;
  renderActions?: (row: T) => React.ReactNode;
  /** Draws rows under per-group banners. Omit for a flat table. */
  groupBy?: GroupBy<T>;
  /** Current page size. Pass with onLimitChange to show the picker. */
  limit?: number;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
}

const DEFAULT_LIMIT_OPTIONS = [10, 20, 50, 100];

export function ResourceTable<T extends { id: string }>({
  title,
  description,
  columns,
  rows,
  error,
  page,
  totalPages,
  onPageChange,
  search,
  onSearchChange,
  onSearchSubmit,
  toolbarAction,
  actionsHeader = "Actions",
  renderActions,
  groupBy,
  limit,
  onLimitChange,
  limitOptions = DEFAULT_LIMIT_OPTIONS,
}: ResourceTableProps<T>) {
  const { appName } = useAppSettings();
  // Null when ungrouped, so both renderers can branch on it directly.
  const groups = React.useMemo(
    () => (groupBy && rows ? groupRows(rows, groupBy) : null),
    [rows, groupBy],
  );
  // Group banner spans the whole width, actions column included.
  const spanAll = columns.length + (renderActions ? 1 : 0);

  /** One stacked card, used on phones. */
  const renderCard = (row: T) => {
    const [primary, ...rest] = columns;
    return (
      <motion.div
        key={row.id}
        layout
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-medium">{primary.cell(row)}</div>
          {renderActions && <div className="flex shrink-0 gap-1">{renderActions(row)}</div>}
        </div>
        <dl className="mt-2 grid gap-1.5">
          {rest.map((col) => (
            <div key={col.header} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{col.header}</dt>
              <dd className="text-right">{col.cell(row)}</dd>
            </div>
          ))}
        </dl>
      </motion.div>
    );
  };

  /** One table row, used from tablet up. */
  const renderRow = (row: T) => (
    <MotionTableRow
      key={row.id}
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {columns.map((col) => (
        <TableCell key={col.header} className={col.className}>
          {col.cell(row)}
        </TableCell>
      ))}
      {renderActions && (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">{renderActions(row)}</div>
        </TableCell>
      )}
    </MotionTableRow>
  );
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {appName}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-[var(--shadow-card)]">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit(search);
            }}
          >
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search…"
              className="w-full border-none shadow-none pl-9 sm:w-64"
            />
          </form>
          {toolbarAction}
        </div>
      </div>

      <Card className="py-0 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
        <CardContent className="px-0">
          <AnimatePresence mode="wait">
            {error ? (
              <motion.p
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-6 text-sm text-destructive"
              >
                {error}
              </motion.p>
            ) : rows === null ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* Mobile: stacked card skeletons */}
                <div className="divide-y sm:hidden">
                  {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                    <div key={i} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <Skeleton className="h-4 w-32" />
                        {renderActions && (
                          <div className="flex shrink-0 gap-1">
                            <Skeleton className="size-9 rounded-md" />
                            <Skeleton className="size-9 rounded-md" />
                          </div>
                        )}
                      </div>
                      <div className="mt-3 grid gap-2">
                        {columns.slice(1).map((col) => (
                          <div key={col.header} className="flex items-center justify-between gap-4">
                            <Skeleton className="h-3.5 w-16" />
                            <Skeleton className="h-3.5 w-20" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tablet/desktop: table skeleton */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                      <TableRow>
                        {columns.map((col) => (
                          <TableHead key={col.header} className={col.className}>
                            {col.header}
                          </TableHead>
                        ))}
                        {renderActions && (
                          <TableHead className="text-right">{actionsHeader}</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                        <TableRow key={i}>
                          {columns.map((col) => (
                            <TableCell key={col.header} className={col.className}>
                              <Skeleton className="h-4 w-20" />
                            </TableCell>
                          ))}
                          {renderActions && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Skeleton className="size-9 rounded-md" />
                                <Skeleton className="size-9 rounded-md" />
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </motion.div>
            ) : rows.length === 0 ? (
              <motion.p
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="p-6 text-sm text-muted-foreground"
              >
                No records found.
              </motion.p>
            ) : (
              <motion.div
                key="table"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* Mobile: stacked cards */}
                <div className="divide-y sm:hidden">
                  <AnimatePresence initial={false}>
                    {groups
                      ? groups.flatMap((group) => [
                          <div
                            key={`group-${group.key}`}
                            className="bg-muted/60 text-muted-foreground px-4 py-2 text-xs font-semibold"
                          >
                            {groupBy?.header(group.rows[0], group.rows.length)}
                          </div>,
                          ...group.rows.map(renderCard),
                        ])
                      : rows.map(renderCard)}
                  </AnimatePresence>
                </div>

                {/* Tablet/desktop: table */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card shadow-sm">
                      <TableRow>
                        {columns.map((col) => (
                          <TableHead key={col.header} className={col.className}>
                            {col.header}
                          </TableHead>
                        ))}
                        {renderActions && (
                          <TableHead className="text-right">{actionsHeader}</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatePresence initial={false}>
                        {groups
                          ? groups.flatMap((group) => [
                              <TableRow
                                key={`group-${group.key}`}
                                className="bg-muted/60 hover:bg-muted/60"
                              >
                                <TableCell
                                  colSpan={spanAll}
                                  className="text-muted-foreground py-2 text-xs font-semibold"
                                >
                                  {groupBy?.header(group.rows[0], group.rows.length)}
                                </TableCell>
                              </TableRow>,
                              ...group.rows.map(renderRow),
                            ])
                          : rows.map(renderRow)}
                      </AnimatePresence>
                    </TableBody>
                  </Table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {limit !== undefined && onLimitChange && (
          <div className="mr-auto flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Rows per page</span>
            <Select
              value={String(limit)}
              onValueChange={(value) => onLimitChange(Number(value))}
            >
              <SelectTrigger className="w-20" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {limitOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function StatusBadgeText({ status }: { status: string }) {
  const tint =
    status === "ACTIVE"
      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
      : status === "BLOCKED"
        ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
        : "bg-secondary text-secondary-foreground";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${tint}`}>
      {status}
    </span>
  );
}
