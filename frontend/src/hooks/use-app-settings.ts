"use client";

import * as React from "react";
import { fetchAppSettings, type AppSettings } from "@/lib/app-settings";

const DEFAULT_SETTINGS: AppSettings = { appName: "System Console", logoPath: null };

let state: AppSettings = DEFAULT_SETTINGS;
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function ensureLoaded() {
  if (loaded || inflight) return;
  inflight = fetchAppSettings()
    .then((data) => {
      state = data;
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
  state = next;
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
