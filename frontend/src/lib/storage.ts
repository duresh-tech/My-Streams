/**
 * Single namespace for everything this app writes to browser storage, so no
 * key can collide with another app served from the same origin.
 *
 * Storage access itself throws in some contexts (private windows, browsers set
 * to block site data), so every read and write is guarded and degrades to
 * "nothing stored" rather than taking the page down.
 */

export const STORAGE_PREFIX = "mystreams_";

/**
 * Fully-qualified key for `name`, e.g. "system.accessToken" ->
 * "mystreams_system.accessToken".
 */
export function storageKey(name: string): string {
  return `${STORAGE_PREFIX}${name}`;
}

export function readStored(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey(name));
  } catch {
    return null;
  }
}

export function writeStored(name: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(name), value);
  } catch {
    // storage unavailable - the value just doesn't persist
  }
}

export function removeStored(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(name));
  } catch {
    // storage unavailable - nothing to clear
  }
}

/**
 * The same namespace in sessionStorage, for state that should last only as long
 * as the tab is open - a dismissed prompt that should ask again next visit.
 */
export function readSession(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(storageKey(name));
  } catch {
    return null;
  }
}

export function writeSession(name: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(name), value);
  } catch {
    // storage unavailable - the value just doesn't persist
  }
}

export function removeSession(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(name));
  } catch {
    // storage unavailable - nothing to clear
  }
}
