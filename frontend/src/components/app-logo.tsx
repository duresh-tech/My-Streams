import Image from "next/image";

import { APP_NAME } from "@/lib/app-name";
import { cn } from "@/lib/utils";

/** Served from public/, so it is one path shared by every brand mark. */
export const APP_LOGO_SRC = "/assets/logo.webp";

/** Intrinsic size of the file; square, with transparency. */
const INTRINSIC = 1080;

/**
 * The app's brand mark.
 *
 * One component for the sign-in cards, the sidebars and the customer portal's
 * top bar, so replacing the logo is a single file change rather than six.
 *
 * It replaces the coloured tile those places used to draw behind a lucide
 * icon: the logo carries its own colours and transparency, and painting it on
 * a primary-coloured square fought with them.
 */
export function AppLogo({
  className,
  /** Rendered pixel size; the file is square. */
  size = 32,
  priority = false,
}: {
  className?: string;
  size?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src={APP_LOGO_SRC}
      alt={APP_NAME}
      width={INTRINSIC}
      height={INTRINSIC}
      sizes={`${size}px`}
      // The logo on a sign-in screen is above the fold and is the only image
      // there, so it is worth fetching eagerly; in the shells it is not.
      priority={priority}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
