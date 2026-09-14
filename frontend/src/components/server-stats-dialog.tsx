"use client";

import * as React from "react";
import { AlertTriangle, LoaderCircle, RefreshCw, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { formatDateTime } from "@/lib/datetime";

export interface ServerPartition {
  path: string | null;
  size: number | null;
  used: number | null;
  available: number | null;
  usedPercent: number | null;
}

export interface ServerStats {
  serverVersion: string | null;
  build: number | null;
  hostname: string | null;
  runtimeId: string | null;
  startedAt: number | null;
  serverTime: number | null;
  uptime: number | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  schedulerLoad: number | null;
  bandwidthUsage: number | null;
  totalBandwidth: number | null;
  totalClients: number | null;
  totalStreams: number | null;
  onlineStreams: number | null;
  openedFiles: number | null;
  inputKbit: number | null;
  outputKbit: number | null;
  streamerStatus: string | null;
  licenseType: string | null;
  configVersion: string | null;
  nextVersion: string | null;
  configError: unknown;
  textAlerts: Record<string, unknown> | null;
  transcoderCapable: boolean | null;
  partitions: ServerPartition[];
  cpuUnits: number | null;
  ramBytes: number | null;
  inputsBandwidth: number | null;
  outputBandwidth: number | null;
  transcodedStreams: number | null;
  openedSessions: number | null;
  totalSessions: number | null;
  dvrStorageBytes: number | null;
}

export interface ServerStatsResponse {
  server: {
    id: string;
    name: string;
    hostName: string;
    hostPort: number;
    domain: string | null;
    useSSL: boolean;
    apiBasePath: string;
    serverVersion: string | null;
    status: string;
    connectionStatus: string;
    connectionCheckedAt: number | null;
  };
  live: boolean;
  liveError: string | null;
  stats: ServerStats | null;
}

const CONNECTION_VARIANT: Record<string, "success" | "destructive" | "warning" | "outline"> = {
  CONNECTED: "success",
  UNAUTHORIZED: "destructive",
  UNREACHABLE: "warning",
  UNKNOWN: "outline",
};

function formatNumber(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

/** Kilobits per second, as the server reports throughput. */
function formatKbit(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} Gbps`;
  if (value >= 1000) return `${(value / 1000).toFixed(2)} Mbps`;
  return `${Math.round(value)} kbps`;
}

/** Bits per second, which the capacity and cloud figures use. */
function formatBits(value: number | null): string {
  return value === null ? "—" : formatKbit(value / 1000);
}

function formatBytes(value: number | null): string {
  if (value === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function Metric({
  label,
  value,
  sub,
  wide,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Card className={wide ? "sm:col-span-2" : undefined}>
      <CardContent className="p-4">
        <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </div>
        <div className="mt-1 text-xl font-semibold break-words">{value}</div>
        {sub && <div className="text-muted-foreground mt-1 text-xs break-words">{sub}</div>}
      </CardContent>
    </Card>
  );
}

/** A labelled bar for the figures the server reports as a percentage. */
function UsageBar({ label, percent, sub }: { label: string; percent: number | null; sub?: string }) {
  const clamped = percent === null ? null : Math.max(0, Math.min(100, percent));
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {label}
          </span>
          <span className="text-lg font-semibold">{formatPercent(percent)}</span>
        </div>
        <div className="bg-muted mt-2 h-2 w-full overflow-hidden rounded-full">
          <div
            className={
              clamped === null
                ? "hidden"
                : clamped >= 90
                  ? "h-full rounded-full bg-red-500"
                  : clamped >= 70
                    ? "h-full rounded-full bg-amber-500"
                    : "h-full rounded-full bg-emerald-500"
            }
            style={clamped === null ? undefined : { width: `${clamped}%` }}
          />
        </div>
        {sub && <div className="text-muted-foreground mt-1 text-xs">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="min-w-0 text-right text-sm break-words">{value}</span>
    </div>
  );
}

/**
 * Full-screen live status for one streaming server.
 *
 * Shared by the tenant portal and the system console: both show the same
 * figures, and a single copy keeps them from drifting. The caller owns the
 * fetch, because the two consoles authenticate differently - it passes the
 * loader in and this component decides when to call it.
 */
export function ServerStatsDialog({
  open,
  onOpenChange,
  serverId,
  serverName,
  load,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Identifies which server is shown; a change re-reads. */
  serverId: string | null;
  serverName: string;
  load: () => Promise<ServerStatsResponse>;
}) {
  const timezone = useAppTimezone();
  const [data, setData] = React.useState<ServerStatsResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Kept in a ref so callers can pass an inline closure: depending on `load`
  // itself would re-read on every render of the parent.
  const loadRef = React.useRef(load);
  loadRef.current = load;

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the server status");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open || !serverId) {
      // Dropped on close so reopening never flashes another server's figures.
      setData(null);
      setError(null);
      return;
    }
    void refresh();
  }, [open, serverId, refresh]);

  const stats = data?.stats ?? null;
  const alerts = Object.entries(stats?.textAlerts ?? {}).filter(([, value]) => !!value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Overrides the default dialog width: these are dense metrics that are
          unreadable in a 2xl box, so the modal takes the screen. */}
      <DialogContent
        showCloseButton
        // Read-only, so Escape and a click outside may close it - unlike the
        // forms elsewhere, there is no half-finished input to protect.
        dismissible
        className="h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] overflow-y-auto rounded-none p-4 sm:max-w-[100vw] sm:p-6"
      >
        <DialogHeader className="text-left">
          {/* pr-10 keeps the Refresh button clear of the dialog's close icon. */}
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-10">
            <Server className="size-5" />
            {serverName}
            {data && (
              <Badge variant={CONNECTION_VARIANT[data.server.connectionStatus] ?? "outline"}>
                {data.live ? "Connected" : data.server.connectionStatus}
              </Badge>
            )}
            {stats?.streamerStatus && <Badge variant="outline">{stats.streamerStatus}</Badge>}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={refresh}
              disabled={loading}
            >
              {loading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
          </DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {!data && !error && (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <LoaderCircle className="size-4 animate-spin" /> Reading server status...
          </div>
        )}

        {data && !data.live && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-medium">Live status unavailable</div>
              <div className="text-xs">
                {data.liveError ?? "The server did not answer."} The details below are from the
                saved record.
              </div>
            </div>
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-4">
            {alerts.length > 0 && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-red-700 dark:text-red-400">
                  <AlertTriangle className="size-4" /> Server alerts
                </div>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {alerts.map(([key, value]) => (
                    <li key={key}>{typeof value === "string" ? value : key}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <UsageBar
                label="CPU usage"
                percent={stats?.cpuUsage ?? null}
                sub={stats?.cpuUnits ? `${formatNumber(stats.cpuUnits)} CPU units` : undefined}
              />
              <UsageBar
                label="Memory usage"
                percent={stats?.memoryUsage ?? null}
                sub={stats?.ramBytes ? `${formatBytes(stats.ramBytes)} RAM` : undefined}
              />
              <UsageBar
                label="Bandwidth usage"
                percent={
                  stats?.bandwidthUsage != null && stats.totalBandwidth
                    ? (stats.bandwidthUsage / stats.totalBandwidth) * 100
                    : null
                }
                sub={
                  stats?.totalBandwidth
                    ? `${formatKbit(stats.bandwidthUsage)} of ${formatKbit(stats.totalBandwidth)}`
                    : stats?.bandwidthUsage != null
                      ? formatKbit(stats.bandwidthUsage)
                      : undefined
                }
              />
              <Metric
                label="Uptime"
                value={formatUptime(stats?.uptime ?? null)}
                sub={
                  stats?.startedAt
                    ? `Started ${formatDateTime(stats.startedAt, timezone)}`
                    : undefined
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Clients"
                value={formatNumber(stats?.totalClients ?? null)}
                sub={
                  stats?.openedSessions != null
                    ? `${formatNumber(stats.openedSessions)} open sessions`
                    : "currently receiving"
                }
              />
              <Metric
                label="Streams"
                value={
                  <>
                    {formatNumber(stats?.onlineStreams ?? null)}
                    <span className="text-muted-foreground text-base font-normal">
                      {" / "}
                      {formatNumber(stats?.totalStreams ?? null)}
                    </span>
                  </>
                }
                sub="online / total"
              />
              <Metric
                label="Input"
                value={formatKbit(stats?.inputKbit ?? null)}
                sub={
                  stats?.inputsBandwidth != null
                    ? `${formatBits(stats.inputsBandwidth)} downstream`
                    : undefined
                }
              />
              <Metric
                label="Output"
                value={formatKbit(stats?.outputKbit ?? null)}
                sub={
                  stats?.outputBandwidth != null
                    ? `${formatBits(stats.outputBandwidth)} upstream`
                    : undefined
                }
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="p-4">
                  <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Server
                  </div>
                  <Separator className="my-2" />
                  <Row
                    label="Version"
                    value={
                      stats?.serverVersion || data.server.serverVersion ? (
                        <>
                          {stats?.serverVersion ?? data.server.serverVersion}
                          {stats?.build ? ` (build ${stats.build})` : ""}
                        </>
                      ) : (
                        "—"
                      )
                    }
                  />
                  {stats?.nextVersion && (
                    <Row
                      label="Update available"
                      value={<Badge variant="info">{stats.nextVersion}</Badge>}
                    />
                  )}
                  <Row label="Hostname" value={stats?.hostname ?? data.server.hostName} />
                  <Row
                    label="Address"
                    value={
                      <code className="text-xs">
                        {data.server.useSSL ? "https" : "http"}://
                        {data.server.domain || data.server.hostName}:{data.server.hostPort}
                      </code>
                    }
                  />
                  <Row label="Licence" value={stats?.licenseType ?? "—"} />
                  <Row label="Config version" value={stats?.configVersion ?? "—"} />
                  <Row label="Runtime id" value={<code className="text-xs">{stats?.runtimeId ?? "—"}</code>} />
                  <Row
                    label="Transcoding"
                    value={
                      stats?.transcoderCapable === null || stats?.transcoderCapable === undefined ? (
                        "—"
                      ) : stats.transcoderCapable ? (
                        <Badge variant="success">Capable</Badge>
                      ) : (
                        <Badge variant="outline">Not capable</Badge>
                      )
                    }
                  />
                  {stats?.transcodedStreams != null && (
                    <Row label="Transcoded streams" value={formatNumber(stats.transcodedStreams)} />
                  )}
                  <Row
                    label="Server clock"
                    value={
                      stats?.serverTime ? formatDateTime(stats.serverTime, timezone) : "—"
                    }
                  />
                  <Row
                    label="Checked"
                    value={
                      data.server.connectionCheckedAt
                        ? formatDateTime(data.server.connectionCheckedAt, timezone)
                        : "—"
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Load and storage
                  </div>
                  <Separator className="my-2" />
                  <Row label="Scheduler load" value={formatPercent(stats?.schedulerLoad ?? null)} />
                  <Row label="Open files" value={formatNumber(stats?.openedFiles ?? null)} />
                  <Row
                    label="Sessions since boot"
                    value={formatNumber(stats?.totalSessions ?? null)}
                  />
                  <Row label="Recording storage" value={formatBytes(stats?.dvrStorageBytes ?? null)} />
                  {stats && stats.partitions.length > 0 ? (
                    <div className="mt-3 grid gap-2">
                      {stats.partitions.map((partition, index) => (
                        <div key={partition.path ?? index}>
                          <div className="flex items-baseline justify-between gap-2 text-sm">
                            <code className="min-w-0 truncate text-xs">
                              {partition.path ?? `disk ${index + 1}`}
                            </code>
                            {/* Some servers report only a percentage and no
                                sizes, so the sizes are shown only when known
                                rather than as a row of dashes. */}
                            <span className="text-muted-foreground text-xs">
                              {partition.size !== null
                                ? `${formatBytes(partition.used)} / ${formatBytes(partition.size)} · `
                                : ""}
                              {formatPercent(partition.usedPercent)}
                            </span>
                          </div>
                          <div className="bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full">
                            <div
                              className={
                                (partition.usedPercent ?? 0) >= 90
                                  ? "h-full rounded-full bg-red-500"
                                  : (partition.usedPercent ?? 0) >= 70
                                    ? "h-full rounded-full bg-amber-500"
                                    : "h-full rounded-full bg-emerald-500"
                              }
                              style={{
                                width: `${Math.max(0, Math.min(100, partition.usedPercent ?? 0))}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground mt-3 text-xs">
                      No disk partitions reported.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {stats?.configError ? (
              <Card>
                <CardContent className="p-4">
                  <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    Config error
                  </div>
                  <pre className="mt-2 overflow-x-auto rounded-md border p-3 text-xs">
                    {typeof stats.configError === "string"
                      ? stats.configError
                      : JSON.stringify(stats.configError, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
