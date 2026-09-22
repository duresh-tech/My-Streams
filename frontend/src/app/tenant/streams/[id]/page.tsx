"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Copy, ExternalLink, LoaderCircle, Pencil, RefreshCw, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { HlsPreview } from "@/components/hls-preview";
import { useTenantSession } from "@/hooks/use-tenant-session";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";
import { StreamFormDialog } from "@/components/stream-form-dialog";
import type { StreamRow } from "@/lib/stream-types";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { formatDateObjectTime, formatTimeOnly } from "@/lib/datetime";

interface ProtocolUrl {
  protocol: string;
  label: string;
  url: string;
}

interface StreamView {
  stream: StreamRow;
  live: boolean;
  liveError: string | null;
  stats: Record<string, unknown> | null;
  mediaInfo: { tracks?: Array<Record<string, unknown>> } | null;
  urls: {
    inputs: ProtocolUrl[];
    outputs: ProtocolUrl[];
    host: string;
    scheme: string;
    webPort: number;
  };
}

interface Session {
  id: string;
  type?: string;
  proto?: string;
  ip?: string;
  country?: string;
  user_agent?: string;
  user_id?: string;
  bytes?: number;
  opened_at?: number;
}

const SESSION_REFRESH_MS = 30000;

/**
 * How long the session has been open: now minus its opened_at. Measured
 * against the moment the list was fetched, so every row agrees with the
 * "updated" time in the header and nothing drifts between renders.
 */
function sessionDuration(session: Session, at: Date | null): number | null {
  const opened = num(session.opened_at);
  if (opened === null) return null;
  return Math.max(0, Math.floor((at ?? new Date()).getTime() / 1000) - opened);
}

/**
 * A session that has transferred nothing is a connection that never became a
 * viewer, so it is left out of the table. Sessions whose protocol reports no
 * byte count at all (null, not 0) still count as watching.
 */
function hasTransferred(session: Session): boolean {
  return num(session.bytes) !== 0;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Bits per second as the panel shows it. */
function formatBitrate(kbps: number | null): string {
  if (kbps === null) return "—";
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(2)} Mbps` : `${Math.round(kbps)} kbps`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Seconds to the panel's compact form: 1d 6h, 4h 12m, 3m. */
function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${Math.floor(seconds)}s`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Copy URL"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy");
        }
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-emerald-500/40" : undefined}>
      <CardContent className="p-4">
        <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </div>
        <div
          className={`mt-1 text-2xl font-semibold ${accent ? "text-emerald-600 dark:text-emerald-400" : ""}`}
        >
          {value}
        </div>
        {sub && <div className="text-muted-foreground mt-1 text-xs">{sub}</div>}
      </CardContent>
    </Card>
  );
}

/** Protocols a browser tab can play (or download) straight from the URL. */
const OPENABLE_PROTOCOLS = new Set(["hls", "cmaf", "dash", "mp4"]);

function UrlRow({ entry }: { entry: ProtocolUrl }) {
  const openable = OPENABLE_PROTOCOLS.has(entry.protocol) && /^https?:\/\//i.test(entry.url);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
      <Badge variant="secondary" className="shrink-0">
        {entry.label}
      </Badge>
      {/* Never truncated: a URL is only useful whole, so it wraps and the row grows. */}
      <code className="text-muted-foreground order-last w-full font-mono text-xs break-all sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">
        {entry.url}
      </code>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
        {openable && (
          <Button asChild type="button" variant="ghost" size="icon" title="Open in a new tab">
            <a href={entry.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${entry.label} in a new tab`}>
              <ExternalLink className="size-4" />
            </a>
          </Button>
        )}
        <CopyButton value={entry.url} />
      </div>
    </div>
  );
}

export default function StreamViewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { hasPermission } = useTenantSession();
  const timezone = useAppTimezone();

  const canViewSessions = hasPermission("tenant-streams:view_sessions");
  const canReload = hasPermission("tenant-streams:reload");
  const canUpdate = hasPermission("tenant-streams:update");
  const canRename = hasPermission("tenant-streams:rename");

  const [view, setView] = React.useState<StreamView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  // Bumped on Refresh so the preview player is rebuilt and reconnects.
  const [previewKey, setPreviewKey] = React.useState(0);
  const [reloading, setReloading] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);

  const [sessions, setSessions] = React.useState<Session[] | null>(null);
  const [sessionsAt, setSessionsAt] = React.useState<Date | null>(null);
  const [sessionsLoading, setSessionsLoading] = React.useState(false);

  const watchers = React.useMemo(() => (sessions ?? []).filter(hasTransferred), [sessions]);
  const idleCount = (sessions?.length ?? 0) - watchers.length;

  const loadView = React.useCallback(async () => {
    if (!id) return;
    try {
      setView(await tenantApi<StreamView>(`/tenant/streams/${id}/view`));
      setError(null);
    } catch (err) {
      setError(err instanceof TenantApiError ? err.message : "Could not load this stream");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadSessions = React.useCallback(async () => {
    if (!id || !canViewSessions) return;
    setSessionsLoading(true);
    try {
      setSessions(await tenantApi<Session[]>(`/tenant/streams/${id}/sessions`));
      setSessionsAt(new Date());
    } catch {
      // A session read failing should not blank the whole page.
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [id, canViewSessions]);

  React.useEffect(() => {
    loadView();
  }, [loadView]);

  React.useEffect(() => {
    loadSessions();
    if (!canViewSessions) return;
    const timer = setInterval(loadSessions, SESSION_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadSessions, canViewSessions]);

  /** Re-reads the live statistics and sessions and reloads the preview; changes nothing on the server. */
  async function onRefreshData() {
    setRefreshing(true);
    setPreviewKey((key) => key + 1);
    try {
      await Promise.all([loadView(), loadSessions()]);
    } finally {
      setRefreshing(false);
    }
  }

  /** Disable then re-enable on the server, to kick a stuck source. */
  async function onReload() {
    if (!id) return;
    // The API refuses this while the server is not ACTIVE; saying so here means
    // the reason is shown without a failed round trip.
    if (blockedReason) {
      toast.error(blockedReason);
      return;
    }
    setReloading(true);
    try {
      await tenantApi(`/tenant/streams/${id}/reload`, { method: "POST" });
      toast.success("Stream reloaded");
      await loadView();
    } catch (err) {
      toast.error(err instanceof TenantApiError ? err.message : "Reload failed");
    } finally {
      setReloading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
        <LoaderCircle className="size-4 animate-spin" /> Loading stream...
      </div>
    );
  }

  if (error || !view) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600 dark:text-red-400">{error ?? "Stream not found"}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/tenant/streams">
            <ArrowLeft className="size-4" /> Back to streams
          </Link>
        </Button>
      </div>
    );
  }

  const { stream, stats, mediaInfo, urls } = view;
  const serverStatus = stream.server?.status;
  const blockedReason =
    serverStatus && serverStatus !== "ACTIVE"
      ? `Server "${stream.server?.name ?? "unknown"}" is ${serverStatus.toLowerCase()}, so this stream cannot be changed right now.`
      : null;
  const status = (stats?.status as string) ?? null;
  const alive = stats?.alive === true;
  const clients = num(stats?.client_count) ?? num(stats?.online_clients);
  const inBitrate = num(stats?.input_bitrate) ?? num(stats?.bitrate);
  const outBitrate = num(stats?.output_bitrate);
  const uptime = num(stats?.lifetime);
  const retries = num(stats?.retry_count);
  const tracks = mediaInfo?.tracks ?? [];
  const hlsUrl = urls.outputs.find((o) => o.protocol === "hls")?.url;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Link href="/tenant/streams" className="hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="size-3" /> Streams
            </Link>
            {stream.server?.name && <span>· {stream.server.name}</span>}
          </div>
          <h1 className="truncate text-2xl font-semibold">{stream.title}</h1>
          <code className="text-muted-foreground font-mono text-xs">{stream.name}</code>
        </div>
        <div className="flex items-center gap-2">
          {stream.disabled && <Badge variant="outline">Disabled</Badge>}
          {serverStatus && serverStatus !== "ACTIVE" && (
            <Badge variant="warning">Server {serverStatus.toLowerCase()}</Badge>
          )}
          {!view.live && <Badge variant="destructive">Server unreachable</Badge>}
          <Button type="button" variant="outline" onClick={onRefreshData} disabled={refreshing}>
            {refreshing ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
          {canReload && (
            <Button type="button" variant="outline" onClick={onReload} disabled={reloading}>
              {reloading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <RotateCw className="size-4" />
              )}
              Reload stream
            </Button>
          )}
          {canUpdate && (
            <Button
              type="button"
              onClick={() => {
                if (blockedReason) {
                  toast.error(blockedReason);
                  return;
                }
                setEditOpen(true);
              }}
            >
              <Pencil className="size-4" /> Edit
            </Button>
          )}
        </div>
      </div>

      {blockedReason && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {blockedReason} Editing, reloading and enabling or disabling it will stay unavailable
          until the server is active again.
        </p>
      )}

      {!view.live && view.liveError && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Live statistics unavailable: {view.liveError}. The configuration and URLs below are the
          stored ones.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Status"
          value={status ? status.toUpperCase() : stream.disabled ? "OFF" : "—"}
          sub={alive ? "alive" : status ? "not receiving" : undefined}
          accent={alive}
        />
        <StatCard label="Clients" value={clients ?? "—"} sub="currently connected" />
        <StatCard
          label="Bitrate in / out"
          value={`${formatBitrate(inBitrate)} / ${formatBitrate(outBitrate)}`}
          sub={`${formatBytes(num(stats?.bytes_in))} in · ${formatBytes(num(stats?.bytes_out))} out`}
        />
        <StatCard
          label="Uptime"
          value={formatDuration(uptime)}
          sub={retries ? `${retries} retries` : "no retries"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Input protocol — publish here
            </div>
            <div className="mt-3 grid gap-2">
              {urls.inputs.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No input protocols (RTMP/SRT/RTSP) enabled.
                </p>
              ) : (
                urls.inputs.map((entry) => <UrlRow key={entry.label} entry={entry} />)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Output protocol — play from here
            </div>
            <div className="mt-3 grid gap-2">
              {urls.outputs.length === 0 ? (
                <p className="text-muted-foreground text-sm">No playback protocols enabled.</p>
              ) : (
                urls.outputs.map((entry) => <UrlRow key={entry.label} entry={entry} />)
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Preview
              </div>
              {hlsUrl && <Badge variant="secondary">HLS</Badge>}
            </div>
            <div className="mt-3">
              {hlsUrl ? (
                <HlsPreview key={previewKey} url={hlsUrl} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Enable the HLS protocol to preview this stream here.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Media tracks
              </div>
              <span className="text-muted-foreground text-xs">{tracks.length} tracks</span>
            </div>
            {tracks.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">No track information reported.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-xs uppercase">
                    <tr className="text-left">
                      <th className="pb-2 pr-3 font-medium">Type</th>
                      <th className="pb-2 pr-3 font-medium">Codec</th>
                      <th className="pb-2 pr-3 font-medium">Bitrate</th>
                      <th className="pb-2 pr-3 font-medium">Res / ch</th>
                      <th className="pb-2 font-medium">Fps / rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((track, index) => {
                      const content = String(track.content ?? track.type ?? "—");
                      const width = num(track.width);
                      const height = num(track.height);
                      const channels = num(track.channels);
                      const fps = num(track.fps);
                      const rate = num(track.sample_rate);
                      return (
                        <tr key={index} className="border-t">
                          <td className="py-2 pr-3">
                            <Badge variant="outline">{content.toUpperCase()}</Badge>
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {String(track.codec ?? "—")}
                          </td>
                          <td className="py-2 pr-3">{formatBitrate(num(track.bitrate))}</td>
                          <td className="py-2 pr-3">
                            {width && height ? `${width}x${height}` : channels ? `${channels} ch` : "—"}
                          </td>
                          <td className="py-2">
                            {fps ? `${fps} fps` : rate ? `${(rate / 1000).toFixed(1)} kHz` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Configured inputs
          </div>
          {stream.inputs.length === 0 ? (
            <p className="text-muted-foreground mt-3 text-sm">No inputs configured.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-xs uppercase">
                  <tr className="text-left">
                    <th className="pb-2 pr-3 font-medium">Priority</th>
                    <th className="pb-2 pr-3 font-medium">URL</th>
                    <th className="pb-2 font-medium">Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {stream.inputs.map((input) => (
                    <tr key={input.priority} className="border-t">
                      <td className="py-2 pr-3">{input.priority}</td>
                      <td className="py-2 pr-3 font-mono text-xs break-all">{input.url}</td>
                      <td className="text-muted-foreground py-2">{input.comment || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <StreamFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={stream}
        onSaved={() => {
          void loadView();
        }}
        canRename={canRename}
      />

      {canViewSessions && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Play sessions
                </div>
                <Badge variant="secondary">{watchers.length} watching</Badge>
                {idleCount > 0 && (
                  <span className="text-muted-foreground text-xs">
                    {idleCount} with no data hidden
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  auto 30s
                  {sessionsAt ? ` · updated ${formatDateObjectTime(sessionsAt, timezone)}` : ""}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={loadSessions}
                  disabled={sessionsLoading}
                >
                  {sessionsLoading ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Refresh
                </Button>
              </div>
            </div>
            <Separator className="my-3" />
            {watchers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {idleCount > 0
                  ? "No one is watching yet - every open session has transferred no data."
                  : "No active sessions."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-xs uppercase">
                    <tr className="text-left">
                      <th className="pb-2 pr-3 font-medium">Client IP</th>
                      <th className="pb-2 pr-3 font-medium">User ID</th>
                      <th className="pb-2 pr-3 font-medium">User agent</th>
                      <th className="pb-2 pr-3 font-medium">Protocol</th>
                      <th className="pb-2 pr-3 font-medium">Country</th>
                      <th className="pb-2 pr-3 font-medium">Data</th>
                      <th className="pb-2 pr-3 font-medium">Duration</th>
                      <th className="pb-2 font-medium">Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchers.map((session) => (
                      <tr key={session.id} className="border-t">
                        <td className="py-2 pr-3 font-mono text-xs">
                          {session.ip ? (
                            <a
                              href={`https://ip.me/ip/${encodeURIComponent(session.ip)}`}
                              target="_blank"
                              // noreferrer as well as noopener: the lookup is a
                              // third-party site and should not be told which
                              // page the address came from.
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 hover:underline"
                              title={`Look up ${session.ip}`}
                            >
                              {session.ip}
                              <ExternalLink className="size-3 shrink-0" />
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-3">{session.user_id ?? "—"}</td>
                        <td className="text-muted-foreground max-w-[16rem] truncate py-2 pr-3 text-xs">
                          {session.user_agent ?? "—"}
                        </td>
                        <td className="py-2 pr-3">
                          {session.proto ? <Badge variant="outline">{session.proto}</Badge> : "—"}
                        </td>
                        <td className="py-2 pr-3">{session.country ?? "—"}</td>
                        <td className="py-2 pr-3">{formatBytes(num(session.bytes))}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {formatDuration(sessionDuration(session, sessionsAt))}
                        </td>
                        <td className="text-muted-foreground py-2 text-xs">
                          {session.opened_at
                            ? formatTimeOnly(session.opened_at, timezone)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
