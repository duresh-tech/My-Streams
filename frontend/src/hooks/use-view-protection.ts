"use client";

import * as React from "react";

/**
 * Best-effort deterrents for the public share page: no context menu, no
 * devtools keyboard shortcuts, and the page is abandoned if devtools appears.
 *
 * Read this before relying on it:
 *
 * This is a speed bump, NOT access control. Everything here runs in the
 * viewer's own browser, under their control, and can be turned off by anyone
 * who wants to - disabling JavaScript alone defeats all of it. The playback URL
 * is in the page source and in every network request regardless, so a viewer
 * who wants the stream URL will have it.
 *
 * The only real protection for a stream is on the streaming server: signed or
 * token-authorised playback URLs, referrer restrictions, or expiring sessions.
 * If the stream genuinely must not be redistributed, that is where it has to be
 * done - and rotating the share code is how a leaked link gets revoked.
 *
 * The devtools check is a heuristic and it can be wrong in both directions: it
 * misses undocked devtools, and a docked panel or an unusual zoom level can
 * trip it for a legitimate viewer. Because being wrong means throwing a real
 * viewer off the page, the threshold is deliberately generous.
 */
export function useViewProtection(enabled = true) {
  const [devtoolsOpen, setDevtoolsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;

    const blockContextMenu = (event: MouseEvent) => event.preventDefault();

    const blockShortcuts = (event: KeyboardEvent) => {
      const key = event.key.toUpperCase();
      const devtoolsCombo =
        key === "F12" ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && ["I", "J", "C"].includes(key)) ||
        // View source.
        ((event.ctrlKey || event.metaKey) && key === "U");
      if (devtoolsCombo) event.preventDefault();
    };

    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("keydown", blockShortcuts);

    /**
     * Docked devtools shrink the viewport without shrinking the window. 200px
     * rather than the usual 160 because a narrow docked panel is rarer than a
     * browser whose chrome is simply tall, and a false positive here ejects
     * someone who was only watching.
     */
    const THRESHOLD = 200;
    const looksOpen = () =>
      window.outerWidth - window.innerWidth > THRESHOLD ||
      window.outerHeight - window.innerHeight > THRESHOLD;

    const check = () => {
      if (!looksOpen()) return;
      setDevtoolsOpen(true);
      // Safe despite being declared below: check only runs from the interval,
      // by which point the binding is initialised.
      window.clearInterval(timer);

      // close() only works on a window this script opened, which a shared link
      // never is - so the page blanks itself and leaves, and the caller renders
      // a notice for the common case where neither takes effect.
      try {
        window.close();
      } catch {
        // Ignore: not a script-opened window.
      }
      window.location.replace("about:blank");
    };

    const timer = window.setInterval(check, 1000);

    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", blockShortcuts);
      window.clearInterval(timer);
    };
  }, [enabled]);

  return { devtoolsOpen };
}
