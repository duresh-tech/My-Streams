"use client";

import * as React from "react";
import { fetchAppSettings, type AppSettings } from "@/lib/app-settings";
import { APP_NAME } from "@/lib/app-name";

const DEFAULT_SETTINGS: AppSettings = { appName: APP_NAME, logoPath: null };

let state: AppSettings = DEFAULT_SETTINGS;
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** The app name always comes from NEXT_PUBLIC_APP_NAME - the DB-backed
 * app.name row (Customization page) is ignored here so env-level branding
 * always wins; only the logo stays DB-driven. */
function ensureLoaded() {
  if (loaded || inflight) return;
  inflight = fetchAppSettings()
    .then((data) => {
      state = { appName: APP_NAME, logoPath: data.logoPath };
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

/** Call after a successful save on the Customization page to reflect changes app-wide immediately. */
export function setAppSettings(next: AppSettings) {
  state = { appName: APP_NAME, logoPath: next.logoPath };
  loaded = true;
  notify();
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
