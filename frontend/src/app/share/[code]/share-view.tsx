"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { StreamPlayer } from "@/components/stream-player";
import { fetchSharedStream, type SharedStream } from "@/lib/share-api";

type State =
  | { status: "loading" }
  | { status: "ready"; stream: SharedStream }
  | { status: "missing" };

/**
 * The public share page. Dark, chromeless and self-contained: no portal nav,
 * no sign-in prompt, nothing that hints at the business behind the stream.
 */
export function ShareView({ code }: { code: string }) {
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stream = await fetchSharedStream(code).catch(() => null);
      if (cancelled) return;
      setState(stream ? { status: "ready", stream } : { status: "missing" });
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Devtools handling now lives in the root layout's <ViewProtection />, which
  // covers every page rather than this one - so there is nothing to render for
  // it here.
  return (
    <main className="flex min-h-dvh flex-col bg-black select-none">
      {state.status === "loading" && (
        <div className="flex flex-1 items-center justify-center">
          <LoaderCircle className="size-6 animate-spin text-neutral-500" />
        </div>
      )}

      {state.status === "missing" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <h1 className="text-lg font-semibold text-neutral-200">This link is not available</h1>
          <p className="max-w-sm text-sm text-neutral-400">
            It may have expired, been switched off, or been replaced by a new link. Ask whoever
            shared it with you for the current one.
          </p>
        </div>
      )}

      {/* No title or protocol chrome: the page is nothing but the player. The
          title still travels to StreamPlayer for its aria-label, which screen
          readers announce but nobody sees. */}
      {state.status === "ready" && (
        <StreamPlayer
          sources={state.stream.sources}
          title={state.stream.title}
          className="flex-1"
        />
      )}
    </main>
  );
}
