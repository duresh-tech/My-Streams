/**
 * Capture side of the install prompt.
 *
 * `beforeinstallprompt` fires once per page load, within a few hundred
 * milliseconds of it - well before a portal has finished fetching its session
 * and rendered its shell. If the listener were attached by the card that shows
 * the offer, the event would already have come and gone and no prompt would
 * ever appear on a fresh load.
 *
 * So capture is global and silent (started from the root layout) while the
 * offer itself is shown only inside a signed-in portal. This module holds the
 * captured event in between.
 */

/**
 * The event Chromium fires when a site meets its install criteria. Not in the
 * DOM lib types, because it is not standard across browsers.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" } | void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let captured: BeforeInstallPromptEvent | null = null;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** True when the page is already running as an installed app. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches;
  // iOS Safari reports it on navigator instead of through a media query.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return !!standalone || !!iosStandalone;
}

/**
 * Starts listening, and registers the service worker.
 *
 * The worker has to be registered on every page load, sign-in screens
 * included: Chromium will not consider the site installable without one, so
 * registering it only after login would mean the event never fires on the load
 * where we want to use it. It caches nothing (see public/sw.js).
 *
 * Safe to call more than once; only the first call does anything.
 */
export function startInstallCapture(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A failed registration only costs the install prompt, so it stays
      // silent rather than surfacing to the user.
    });
  }

  window.addEventListener("beforeinstallprompt", (raw: Event) => {
    // Without this the browser shows its own mini-infobar and the event is
    // spent; holding it lets the app ask in its own words, later.
    raw.preventDefault();
    captured = raw as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    captured = null;
    emit();
  });
}

/** The pending event, or null when the browser has not offered one. */
export function getInstallEvent(): BeforeInstallPromptEvent | null {
  return captured;
}

/**
 * Drops the pending event. Called once it has been used or declined - it
 * cannot be prompted with twice.
 */
export function clearInstallEvent(): void {
  captured = null;
  emit();
}

/** Subscribe for useSyncExternalStore. */
export function subscribeInstallEvent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Server snapshot: nothing is capturable during a render on the server. */
export function getServerInstallEvent(): null {
  return null;
}
