import type { MetadataRoute } from "next";

import { APP_NAME } from "@/lib/app-name";

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * This is what makes the site installable: without a manifest carrying a name,
 * a start_url, a standalone display mode and a 192px and 512px icon, Chromium
 * never fires `beforeinstallprompt` and the install prompt can never appear.
 *
 * The icons are PNG rather than the WebP brand file: WebP icons are accepted by
 * Chrome but ignored by other installers, and a launcher icon that silently
 * fails to render is worse than a slightly larger file.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    // Shown under the launcher icon, where there is room for ~12 characters.
    short_name: "My Streams",
    description: "Manage your streams, servers and account.",
    // Signed-out visitors land on a login screen from here, and a signed-in
    // one is redirected on to their own portal.
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // Matches the light theme's page background, so the splash screen does not
    // flash a colour the app never uses.
    background_color: "#F4F6FB",
    theme_color: "#4F46E5",
    icons: [
      { src: "/assets/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Cropped to whatever shape the launcher uses, so the mark is inset on a
      // solid background rather than having its edges shaved off.
      {
        src: "/assets/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
