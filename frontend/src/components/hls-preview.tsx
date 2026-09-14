"use client";

import * as React from "react";

interface ClapprPlayer {
  destroy?: () => void;
}

/**
 * Clappr-based HLS preview.
 *
 * Three packages are needed and each one is easy to miss:
 *
 * - `@clappr/core` is the player core *only*. It wires media-control events but
 *   ships no control bar, which is why the preview first appeared with no
 *   controls at all.
 * - `@clappr/plugins` provides the actual UI - control bar, poster, spinner,
 *   error screen.
 * - `@clappr/hlsjs-playback` (+ `hls.js`) provides HLS playback. Core delegates
 *   HLS to the browser, which only Safari does natively, so without this the
 *   player is blank in Chrome.
 *
 * All are imported dynamically because they touch `window` at module load and
 * would break the server render.
 */
export function HlsPreview({ url, poster }: { url: string; poster?: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    // Held locally rather than in a ref so this run's cleanup tears down the
    // instance this run created - React invokes effects twice in dev, and a
    // shared ref lets the second mount overwrite the first before it is freed.
    let player: ClapprPlayer | null = null;
    const container = containerRef.current;

    /**
     * Clappr throws from inside destroy() when torn down before it finished
     * attaching, which is what the dev double-invoke causes. A throw in a
     * cleanup function escapes as an unhandled error, so it is swallowed and
     * the container cleared either way.
     */
    function teardown(instance: ClapprPlayer | null) {
      try {
        if (typeof instance?.destroy === "function") instance.destroy();
      } catch {
        // Partially-initialised player; clearing the container is enough.
      }
      if (container) container.innerHTML = "";
    }

    async function mount() {
      if (!container) return;
      try {
        const [{ Player }, pluginsMod, hlsMod] = await Promise.all([
          import("@clappr/core"),
          import("@clappr/plugins"),
          import("@clappr/hlsjs-playback"),
        ]);
        if (cancelled) return;

        // Both plugin packages ship CJS and ESM; take whichever shape arrives.
        const unwrap = <T,>(mod: unknown): T => {
          const candidate = mod as { default?: T };
          return (candidate?.default ?? mod) as T;
        };
        const HlsjsPlayback = unwrap<unknown>(hlsMod);
        const {
          MediaControl,
          Poster,
          ClickToPause,
          SpinnerThreeBounce,
          ErrorScreen,
          SeekTime,
        } = unwrap<Record<string, unknown>>(pluginsMod);

        if (typeof Player !== "function") {
          setError("Player library failed to load");
          return;
        }

        // `@clappr/core` ships types that omit `plugins`, even though the
        // runtime reads options.plugins and the plugin docs prescribe it.
        // Widened here rather than dropped, so the rest stays type-checked.
        type PlayerOptions = ConstructorParameters<typeof Player>[0] & {
          plugins?: unknown[];
        };

        const instance: ClapprPlayer = new Player({
          source: url,
          // `parent` is the constructor option; `parentElement` is the internal
          // field attachTo() writes and is not part of the typed options.
          parent: container,
          // Playback first, then the UI plugins that draw over it.
          plugins: [
            HlsjsPlayback,
            MediaControl,
            Poster,
            ClickToPause,
            SpinnerThreeBounce,
            ErrorScreen,
            SeekTime,
          ].filter(Boolean),
          // Sound on. Browsers refuse to autoplay audible media, so the player
          // shows its play button instead of starting silently - which is
          // better than a muted stream that looks like it has no audio.
          mute: false,
          autoPlay: true,
          // Keep the control bar on screen rather than fading it out: on a
          // monitoring page the state should stay visible.
          hideMediaControl: false,
          hideVolumeBar: false,
          disableKeyboardShortcuts: false,
          mediacontrol: { seekbar: "#6366f1", buttons: "#e2e8f0" },
          ...(poster ? { poster } : {}),
        } as PlayerOptions);

        // The effect may have been cleaned up while the imports were in flight.
        if (cancelled) {
          teardown(instance);
          return;
        }
        player = instance;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the player");
        }
      }
    }

    void mount();

    return () => {
      cancelled = true;
      teardown(player);
      player = null;
    };
  }, [url, poster]);

  if (error) {
    return (
      <div className="text-muted-foreground flex aspect-video w-full items-center justify-center rounded-md border text-sm">
        {error}
      </div>
    );
  }

  return (
    // Clappr writes fixed pixel sizes onto the elements it creates, so the
    // generated player and video are stretched to the box with CSS rather than
    // with its width/height options (which only accept numbers).
    <div
      ref={containerRef}
      className="aspect-video w-full overflow-hidden rounded-md border bg-black **:data-player:h-full! **:data-player:w-full! [&_video]:h-full! [&_video]:w-full! [&_video]:object-contain"
    />
  );
}
