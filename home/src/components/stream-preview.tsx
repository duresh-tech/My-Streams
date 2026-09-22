import { Activity, Gauge, Signal, Users } from "lucide-react";

// Fixed heights keep the decorative meter identical between server and client
// render - a random pattern would hydrate-mismatch.
const BARS = [30, 62, 45, 78, 52, 88, 40, 70, 58, 92, 48, 66, 36, 80, 55];

const READOUTS = [
  { icon: Users, value: "1,284", label: "Viewers" },
  { icon: Gauge, value: "4.2 Mbps", label: "Bitrate" },
  { icon: Activity, value: "60 fps", label: "Frames" },
  { icon: Signal, value: "4h 23m", label: "Uptime" },
];

/** Decorative mock of the stream dashboard shown beside the hero copy. */
export function StreamPreview() {
  return (
    <div className="surface-card overflow-hidden" aria-hidden>
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        </span>
        <span className="font-mono text-xs text-subtle-foreground">
          mystreams.in/live/channel-01.m3u8
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span className="text-[10px] font-bold text-success">LIVE</span>
        </span>
      </div>

      <div className="relative bg-black/40 px-5 py-10">
        <span className="absolute left-4 top-4 rounded bg-destructive px-2 py-0.5 text-[10px] font-bold text-white">
          ON AIR
        </span>
        <div className="flex h-24 items-end justify-center gap-[3px]">
          {BARS.map((height, index) => (
            <span
              key={index}
              className="w-1.5 rounded-full opacity-70"
              style={{
                height: `${height}%`,
                background: "var(--gradient-brand)",
                animation: `bar-pulse ${1 + (index % 5) * 0.2}s ease-in-out ${index * 0.05}s infinite alternate`,
                transformOrigin: "bottom",
              }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-border border-t border-border">
        {READOUTS.map(({ icon: ReadoutIcon, value, label }) => (
          <div key={label} className="px-3 py-4 text-center">
            <ReadoutIcon className="mx-auto mb-1.5 h-4 w-4 text-brand-cyan opacity-70" />
            <p className="text-sm font-bold tabular-nums">{value}</p>
            <p className="mt-0.5 text-[9px] uppercase tracking-wide text-subtle-foreground">
              {label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
