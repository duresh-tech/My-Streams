"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
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
}

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
}: ResourceTableProps<T>) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              className="w-full pl-9 sm:w-64"
            />
          </form>
          {toolbarAction}
        </div>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {error ? (
            <p className="p-6 text-sm text-destructive">{error}</p>
          ) : rows === null ? (
            <div className="flex justify-center p-10">
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No records found.</p>
          ) : (
            <Table>
              <TableHeader>
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
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    {columns.map((col) => (
                      <TableCell key={col.header} className={col.className}>
                        {col.cell(row)}
                      </TableCell>
                    ))}
                    {renderActions && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {renderActions(row)}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
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
  const color =
    status === "ACTIVE"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "BLOCKED"
        ? "text-destructive"
        : "text-muted-foreground";
  return <span className={`text-xs font-semibold ${color}`}>{status}</span>;
}
