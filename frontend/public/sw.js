/*
 * Minimal service worker.
 *
 * Its only job is to exist with a fetch handler: Chromium requires one before
 * it will offer to install a site, and without it `beforeinstallprompt` never
 * fires. It deliberately does NOT cache anything.
 *
 * Caching here would be actively harmful for this app: every screen reads live
 * data from the API, and a stale shell served from a cache is the classic way
 * a PWA ends up showing an old build against a new backend. Offline support,
 * if it is ever wanted, should be a deliberate feature with a versioned cache
 * and a skipWaiting/update flow - not a side effect of installability.
 */

self.addEventListener("install", () => {
  // Take over straight away rather than waiting for every tab to close; there
  // is no cached state that an older worker could be mid-way through using.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Straight passthrough. Returning the network response untouched keeps the
  // worker out of the way of API calls, streaming media and Next's own asset
  // requests alike.
  event.respondWith(fetch(event.request));
});
