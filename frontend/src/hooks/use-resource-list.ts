"use client";

import * as React from "react";
import { api, type ListResponse } from "@/lib/api";

/** Paginated + searchable resource list with a manual refresh trigger. */
export function useResourceList<T>(endpoint: string) {
  const [rows, setRows] = React.useState<T[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [reloadIndex, setReloadIndex] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (query) params.set("search", query);
    api<ListResponse<T>>(`${endpoint}?${params.toString()}`)
      .then((data) => {
        if (cancelled) return;
        setRows(data.items);
        setTotalPages(data.meta.totalPages);
        setTotal(data.meta.total);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, page, query, reloadIndex]);

  const applySearch = React.useCallback((term: string) => {
    setPage(1);
    setQuery(term);
  }, []);

  const refresh = React.useCallback(() => setReloadIndex((i) => i + 1), []);

  return {
    rows,
    error,
    page,
    setPage,
    totalPages,
    total,
    search,
    setSearch,
    applySearch,
    refresh,
  };
}
