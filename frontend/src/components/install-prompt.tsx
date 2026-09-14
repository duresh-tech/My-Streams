"use client";

import * as React from "react";
import { Download, X } from "lucide-react";

import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/app-name";
import { readSession, writeSession } from "@/lib/storage";
import {
  clearInstallEvent,
  getInstallEvent,
  getServerInstallEvent,
  isInstalled,
  subscribeInstallEvent,
} from "@/lib/pwa-install";

/**
 * Set when the visitor says "not now", so they are asked again on their next
 * visit but not again in this tab. Session, not local, is what was asked for -
 * a permanent "no" would need a localStorage key instead.
 */
const DISMISSED_KEY = "pwa.installDismissed";

/**
 * Offers to install the site as an app, once per session.
 *
 * Rendered by each portal's shell rather than the root layout, so the offer
 * only ever reaches a signed-in user - asking a stranger on the login screen
 * to install an app they cannot use yet is the wrong moment. The event itself
 * is captured globally and much earlier (see lib/pwa-install), because the
 * browser fires it long before a shell has its session.
 *
 * It shows nothing at all unless the browser has offered an install, which
 * means:
 *
 * - iOS Safari never shows it. WebKit has no `beforeinstallprompt` and no
 *   programmatic install; there, "Add to Home Screen" is a manual Share-menu
 *   step that a web page cannot trigger or reliably detect.
 * - It does not appear once installed, once dismissed this session, or on a
 *   browser that has already been told no at its own level.
 */
export function InstallPrompt() {
  const event = React.useSyncExternalStore(
    subscribeInstallEvent,
    getInstallEvent,
    getServerInstallEvent,
  );

  const [installing, setInstalling] = React.useState(false);
  // Read once on mount: sessionStorage is not available during the server
  // render, and reading it in the render body would mismatch hydration.
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    setDismissed(!!readSession(DISMISSED_KEY) || isInstalled());
  }, []);

  function dismiss() {
    writeSession(DISMISSED_KEY, "1");
    setDismissed(true);
    clearInstallEvent();
  }

  async function install() {
    if (!event) return;
    setInstalling(true);
    try {
      const result = await event.prompt();
      const outcome =
        (result && "outcome" in result ? result.outcome : undefined) ??
        (await event.userChoice)?.outcome;
      // Saying no in the browser's own dialog is still a no: recording it
      // stops this card coming straight back.
      if (outcome !== "accepted") writeSession(DISMISSED_KEY, "1");
    } catch {
      // The browser refused to show its dialog (already handled, or the event
      // went stale). Nothing to recover - just stop offering.
    } finally {
      setInstalling(false);
      setDismissed(true);
      clearInstallEvent();
    }
  }

  if (!event || dismissed) return null;

  return (
    // Bottom sheet on a phone, a card in the corner on larger screens. Fixed
    // rather than a modal dialog: an install offer must not block the page.
    <div
      role="dialog"
      aria-labelledby="install-prompt-title"
      className="bg-card fixed inset-x-3 bottom-3 z-50 rounded-lg border p-4 shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
    >
      <div className="flex items-start gap-3">
        <AppLogo size={40} className="shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p id="install-prompt-title" className="font-medium">
            Install {APP_NAME}
          </p>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Add it to your device for a full-screen app with its own icon.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Not now"
          className="-mt-1 -mr-1 shrink-0"
          onClick={dismiss}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="mt-3 flex gap-2">
        <Button type="button" className="flex-1" onClick={install} disabled={installing}>
          <Download className="size-4" /> Install
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </div>
  );
}
