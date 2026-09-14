"use client";

import * as React from "react";
import { fetchAppSettings, type AppSettings } from "@/lib/app-settings";
import { APP_NAME } from "@/lib/app-name";
import { FALLBACK_TIMEZONE } from "@/lib/datetime";

const DEFAULT_SETTINGS: AppSettings = {
  appName: APP_NAME,
  logoPath: null,
  timezone: null,
};

let state: AppSettings = DEFAULT_SETTINGS;
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** The app name always comes from NEXT_PUBLIC_APP_NAME - the DB-backed
 * app.name row is ignored here so env-level branding
 * always wins; only the logo stays DB-driven. */
function ensureLoaded() {
  if (loaded || inflight) return;
  inflight = fetchAppSettings()
    .then((data) => {
      state = { appName: APP_NAME, logoPath: data.logoPath, timezone: data.timezone };
    })
    .catch(() => {
      // keep the default on failure
    })
    .finally(() => {
      loaded = true;
      inflight = null;
      notify();
    });
}

export function useAppSettings(): AppSettings {
  React.useEffect(() => {
    ensureLoaded();
  }, []);

  return React.useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => state,
    () => DEFAULT_SETTINGS,
  );
}

/**
 * The timezone every timestamp should be rendered in, as reported by the
 * backend. Falls back to UTC until the settings request lands, and permanently
 * if it fails - a defined zone beats silently using each viewer's own.
 */
export function useAppTimezone(): string {
  return useAppSettings().timezone ?? FALLBACK_TIMEZONE;
}
