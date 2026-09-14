"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

import { storageKey } from "@/lib/storage";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  // next-themes writes its own key, so it is given the app's namespace too -
  // otherwise it is the one entry in storage without the prefix.
  return (
    <NextThemesProvider storageKey={storageKey("theme")} {...props}>
      {children}
    </NextThemesProvider>
  );
}
