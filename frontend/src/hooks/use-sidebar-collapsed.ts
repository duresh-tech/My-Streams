"use client";

import * as React from "react";
import { readStored, writeStored } from "@/lib/storage";

const COLLAPSED_KEY = "sidebar.collapsed";

/**
 * Desktop sidebar collapse state, remembered per browser.
 *
 * Always starts expanded on the server and on first paint, then adopts the
 * stored value in an effect - reading storage during render would make the
 * markup disagree with the server's and break hydration.
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(readStored(COLLAPSED_KEY) === "true");
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      writeStored(COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
