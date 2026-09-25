"use client";

import { useViewProtection } from "@/hooks/use-view-protection";

/**
 * Mounts the view protections (no context menu, no devtools shortcuts, leave
 * the page if devtools appears) across the whole app from the root layout.
 *
 * Disabled outside production on purpose. The check ejects whoever trips it,
 * and in development that is you: opening devtools to work on this app would
 * blank the tab every time. Read the hook before relying on any of this - it
 * is a deterrent, not access control, and the notes there explain why.
 */
export function ViewProtection() {
  useViewProtection(process.env.NODE_ENV === "production");
  return null;
}
