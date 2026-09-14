"use client";

import * as React from "react";
import { api, type ListResponse } from "@/lib/api";

type Fetcher = <T>(
  path: string,
  options?: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown },
) => Promise<T>;

/** Paginated + searchable resource list with a manual refresh trigger. */
export function useResourceList<T>(
  endpoint: string,
  filters: Record<string, string | undefined> = {},
  fetcher: Fetcher = api,
) {
  const [rows, setRows] = React.useState<T[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [reloadIndex, setReloadIndex] = React.useState(0);
  const filtersKey = JSON.stringify(filters);
  // Set by refreshSilently: the next load keeps the current rows on screen.
  const silentRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!silentRef.current) {
      setRows(null);
      setError(null);
    }
    silentRef.current = false;
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (query) params.set("search", query);
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    fetcher<ListResponse<T>>(`${endpoint}?${params.toString()}`)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, page, query, reloadIndex, filtersKey]);

  const applySearch = React.useCallback((term: string) => {
    setPage(1);
    setQuery(term);
  }, []);

  const refresh = React.useCallback(() => setReloadIndex((i) => i + 1), []);

  /** Reloads without clearing the table first - for background polling. */
  const refreshSilently = React.useCallback(() => {
    silentRef.current = true;
    setReloadIndex((i) => i + 1);
  }, []);

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
    refreshSilently,
  };
}
