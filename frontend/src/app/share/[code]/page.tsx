import type { Metadata } from "next";

import { ShareView } from "./share-view";

/**
 * A share link is meant for the people it was sent to, not for search engines.
 * noindex/nofollow keeps a leaked link from being crawled into a public index,
 * where rotating the code would no longer be enough to take it back.
 */
export const metadata: Metadata = {
  title: "Live stream",
  robots: { index: false, follow: false, nocache: true },
};

export default async function SharePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ShareView code={code} />;
}
