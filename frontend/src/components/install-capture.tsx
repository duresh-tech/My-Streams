"use client";

import * as React from "react";

import { startInstallCapture } from "@/lib/pwa-install";

/**
 * Renders nothing; starts listening for the browser's install offer.
 *
 * Mounted in the root layout so it runs on every page load - including the
 * sign-in screens, where the service worker it registers is what lets the
 * browser judge the site installable in the first place. The offer itself is
 * shown later, inside a signed-in portal, by <InstallPrompt />.
 */
export function InstallCapture() {
  React.useEffect(() => {
    startInstallCapture();
  }, []);

  return null;
}
