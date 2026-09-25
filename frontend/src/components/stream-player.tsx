"use client";

import * as React from "react";
import { VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";

interface ClapprPlayer {
  destroy?: () => void;
  setVolume?: (volume: number) => void;
  play?: () => void;
  /**
   * Clappr passes the new volume (0-100) to `volumeupdate` handlers. The
   * third `context` parameter is declared because Clappr's own signature
   * takes one, and a narrower type here is not assignable from it.
   */
  on?: (event: string, handler: (volume?: number) => void, context?: unknown) => unknown;
}

export interface PlayerSource {
  protocol: string;
  label: string;
  url: string;
}

interface StreamPlayerProps {
  /** Best-first; the first entry is what plays. */
  sources: PlayerSource[];
  /** Announced to screen readers; never drawn. */
  title: string;
  /** Wrapper box. Must establish a size - the video is absolute within it. */
  className?: string;
  /** Forces a remount, e.g. a portal "refresh" button. */
  reloadKey?: number;
}

/**
 * Clappr player used by both the public share page and the portal previews.
 *
 * Playback support comes from three separate plugins and none of them is
 * optional for the protocol it covers:
 *
 * - `@clappr/hlsjs-playback` (+ `hls.js`) plays HLS and CMAF. Clappr core hands
 *   HLS to the browser, which only Safari does natively, so without this the
 *   player is blank in Chrome.
 * - `dash-shaka-playback` plays DASH. Core has no DASH support at all.
 * - MP4 needs nothing: core plays it through the <video> element.
 *
 * All are imported dynamically because they touch `window` at module load and
 * would break the server render.
 */
export function StreamPlayer({
  sources,
  title,
  className,
  reloadKey = 0,
}: StreamPlayerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const playerRef = React.useRef<ClapprPlayer | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Starts true because the player is created muted; the volume listener
  // corrects it if the viewer turns sound on through the control bar instead.
  const [muted, setMuted] = React.useState(true);

  // Sources are ordered best-first by the caller; the first is what we play.
  const source = sources[0];

  React.useEffect(() => {
    if (!source) return;
    let cancelled = false;
    // Held locally rather than in a ref so this run's cleanup tears down the
    // instance this run created - React invokes effects twice in dev, and a
    // shared ref lets the second mount overwrite the first before it is freed.
    let player: ClapprPlayer | null = null;
    const container = containerRef.current;

    function teardown(instance: ClapprPlayer | null) {
      try {
        if (typeof instance?.destroy === "function") instance.destroy();
      } catch {
        // Partially-initialised player; clearing the container is enough.
      }
      // Only drop the shared ref if it still points at the instance being torn
      // down: the dev double-invoke means a newer mount may already own it.
      if (playerRef.current === instance) playerRef.current = null;
      if (container) container.innerHTML = "";
    }

    async function mount() {
      if (!container) return;
      setError(null);
      setMuted(true);
      try {
        const needsDash = source.protocol === "dash";
        const [{ Player }, pluginsMod, hlsMod, dashMod] = await Promise.all([
          import("@clappr/core"),
          import("@clappr/plugins"),
          import("@clappr/hlsjs-playback"),
          // Shaka is heavy, so it is only fetched when the stream actually
          // needs it rather than on every page with a player.
          needsDash ? import("dash-shaka-playback") : Promise.resolve(null),
        ]);
        if (cancelled) return;

        // Both plugin packages ship CJS and ESM; take whichever shape arrives.
        const unwrap = <T,>(mod: unknown): T => {
          const candidate = mod as { default?: T };
          return (candidate?.default ?? mod) as T;
        };
        const HlsjsPlayback = unwrap<unknown>(hlsMod);
        const DashPlayback = dashMod ? unwrap<unknown>(dashMod) : null;
        const { MediaControl, Poster, ClickToPause, SpinnerThreeBounce, ErrorScreen, SeekTime } =
          unwrap<Record<string, unknown>>(pluginsMod);

        if (typeof Player !== "function") {
          setError("Player library failed to load");
          return;
        }

        // `@clappr/core` ships types that omit `plugins`, even though the
        // runtime reads options.plugins and the plugin docs prescribe it.
        type PlayerOptions = ConstructorParameters<typeof Player>[0] & {
          plugins?: unknown[];
        };

        const instance: ClapprPlayer = new Player({
          source: source.url,
          // Only set for MP4, and only by spreading: passing `mimeType:
          // undefined` still puts the key on the options object, and Clappr
          // takes its presence as a declared type - which sends an HLS source
          // down the wrong playback path and leaves the player blank.
          ...(source.protocol === "mp4" ? { mimeType: "video/mp4" } : {}),
          parent: container,
          // Playback plugins first, then the UI plugins that draw over them.
          plugins: [
            HlsjsPlayback,
            DashPlayback,
            MediaControl,
            Poster,
            ClickToPause,
            SpinnerThreeBounce,
            ErrorScreen,
            SeekTime,
          ].filter(Boolean),
          // Muted so autoplay is actually permitted: browsers block audible
          // autoplay outright, which left the player sitting on its play
          // button. The picture now starts immediately and the unmute overlay
          // gives the viewer one tap to bring the sound in - the tap is what
          // supplies the user gesture the browser wants before playing audio.
          mute: true,
          autoPlay: true,
          hideMediaControl: false,
          hideVolumeBar: false,
          disableKeyboardShortcuts: false,
          mediacontrol: { seekbar: "#6366f1", buttons: "#e2e8f0" },
        } as PlayerOptions);

        // The effect may have been cleaned up while the imports were in flight.
        if (cancelled) {
          teardown(instance);
          return;
        }
        player = instance;
        playerRef.current = instance;

        // Keeps the overlay honest when sound is changed from the control bar
        // rather than the overlay button.
        //
        // The volume is read from the event argument, not from the player:
        // Clappr's Player exposes setVolume but has no getVolume at all, so
        // polling it would read undefined and report "muted" forever - the
        // button would flash back the instant it was clicked. `volumeupdate`
        // carries the new volume (0-100) as its first argument.
        instance.on?.("volumeupdate", (volume) => setMuted((volume ?? 0) <= 0));
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
  }, [source, reloadKey]);

  /**
   * Brings the sound in. The click is itself the user gesture browsers require
   * before audible playback, so raising the volume here is allowed where doing
   * it automatically on mount would have been refused.
   */
  function unmute() {
    const instance = playerRef.current;
    instance?.setVolume?.(100);
    // Autoplay may have been blocked entirely rather than merely muted, so
    // nudge playback too - harmless if it is already running.
    instance?.play?.();
    setMuted(false);
  }

  if (!source) {
    return (
      <div
        className={cn(
          "text-muted-foreground flex items-center justify-center p-6 text-center text-sm",
          className,
        )}
      >
        This stream has no playable source.
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "text-muted-foreground flex items-center justify-center p-6 text-center text-sm",
          className,
        )}
      >
        {error}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Clappr writes fixed pixel sizes onto the elements it creates, so the
          generated player and video are stretched to the box with CSS rather
          than with its width/height options (which only accept numbers).
          Absolute rather than h-full: a percentage height resolves against the
          parent, and inside a flex column that collapses to zero - which mounts
          the player into a zero-height box and looks exactly like a stream that
          will not play. */}
      <div
        ref={containerRef}
        aria-label={title}
        className="absolute inset-0 bg-black **:data-player:h-full! **:data-player:w-full! [&_video]:h-full! [&_video]:w-full! [&_video]:object-contain"
      />

      {muted && (
        // Top-right so it never sits over Clappr's control bar or fights the
        // click-to-pause layer. The z-index clears Clappr's own chrome, which
        // sits in the thousands.
        <button
          type="button"
          onClick={unmute}
          className="absolute top-3 right-3 z-10000 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/85"
        >
          <VolumeX className="size-3.5" aria-hidden />
          Tap for sound
        </button>
      )}
    </div>
  );
}
