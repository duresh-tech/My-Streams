/**
 * Public share endpoint client.
 *
 * Deliberately separate from lib/api.ts: that client attaches a JWT, sends
 * cookies and refreshes tokens on 401, none of which applies here. The share
 * page is unauthenticated by design, so sending credentials to it would only
 * widen what a shared link touches.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export interface ShareSource {
  protocol: string;
  label: string;
  url: string;
}

export interface SharedStream {
  title: string;
  shareCode: string;
  sources: ShareSource[];
}

/** The public share path for a code, as the portals link to it. */
export function sharePath(code: string): string {
  return `/share/${code}`;
}

/** Absolute share URL for copying, resolved against the current origin. */
export function shareUrl(code: string): string {
  if (typeof window === "undefined") return sharePath(code);
  return `${window.location.origin}${sharePath(code)}`;
}

/** Resolves a share code, or null when the link is not valid. */
export async function fetchSharedStream(code: string): Promise<SharedStream | null> {
  const response = await fetch(`${API_URL}/public/share/${encodeURIComponent(code)}`, {
    // No credentials: this endpoint takes the code as its only input.
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as SharedStream;
}
