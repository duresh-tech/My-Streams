"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  Pencil,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StreamPlayer } from "@/components/stream-player";
import { StreamShareActions } from "@/components/stream-share-actions";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { formatDateObjectTime, formatDateTime, formatTimeOnly } from "@/lib/datetime";
import { BILLING_BLOCKED_MESSAGE } from "@/lib/billing";
import {
  customerApi,
  CustomerApiError,
  type CustomerProtocolUrl,
  type CustomerSession,
  type CustomerStreamView,
} from "@/lib/customer-api";
import { playableSources } from "@/lib/stream-types";

const SESSION_REFRESH_MS = 30000;

/** Protocols a browser tab can play (or download) straight from the URL. */
const OPENABLE_PROTOCOLS = new Set(["hls", "cmaf", "dash", "mp4"]);

/**
 * How long the session has been open: now minus its opened_at, measured
 * against the moment the list was fetched so every row agrees with the
 * "updated" time in the header.
 */
function sessionDuration(session: CustomerSession, at: Date | null): number | null {
  const opened = num(session.opened_at);
  if (opened === null) return null;
  return Math.max(0, Math.floor((at ?? new Date()).getTime() / 1000) - opened);
}

/**
 * A session that has transferred nothing is a connection that never became a
 * viewer. Sessions whose protocol reports no byte count at all (null, not 0)
 * still count as watching.
 */
function hasTransferred(session: CustomerSession): boolean {
  return num(session.bytes) !== 0;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

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

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {sub && <div className="text-muted-foreground mt-1 text-xs">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function UrlRow({ entry }: { entry: CustomerProtocolUrl }) {
  const openable = OPENABLE_PROTOCOLS.has(entry.protocol) && /^https?:\/\//i.test(entry.url);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border py-2 pr-1 pl-3">
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
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${entry.label} in a new tab`}
            >
              <ExternalLink className="size-4" />
            </a>
          </Button>
        )}
        <CopyButton value={entry.url} />
      </div>
    </div>
  );
}

export default function CustomerStreamViewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const timezone = useAppTimezone();

  const [view, setView] = React.useState<CustomerStreamView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [reloading, setReloading] = React.useState(false);
  const [sessions, setSessions] = React.useState<CustomerSession[] | null>(null);
  const [sessionsAt, setSessionsAt] = React.useState<Date | null>(null);
  const [sessionsLoading, setSessionsLoading] = React.useState(false);

  const watchers = React.useMemo(() => (sessions ?? []).filter(hasTransferred), [sessions]);
  const idleCount = (sessions?.length ?? 0) - watchers.length;

  const loadView = React.useCallback(async () => {
    if (!id) return;
    try {
      setView(await customerApi<CustomerStreamView>(`/customer/streams/${id}/view`));
      setError(null);
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : "Could not load this stream");
    }
  }, [id]);

  const loadSessions = React.useCallback(async () => {
    if (!id) return;
    setSessionsLoading(true);
    try {
      setSessions(await customerApi<CustomerSession[]>(`/customer/streams/${id}/sessions`));
    } catch {
      // A session read failing should not blank the page.
      setSessions([]);
    } finally {
      setSessionsAt(new Date());
      setSessionsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void loadView();
  }, [loadView]);

  React.useEffect(() => {
    void loadSessions();
    const timer = setInterval(() => void loadSessions(), SESSION_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadSessions]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([loadView(), loadSessions()]);
    } finally {
      setRefreshing(false);
    }
  }

  async function onReload() {
    if (!id) return;
    if (blockedReason) {
      toast.error(blockedReason);
      return;
    }
    setReloading(true);
    try {
      await customerApi(`/customer/streams/${id}/reload`, { method: "POST" });
      toast.success("Stream reloaded");
      await loadView();
    } catch (err) {
      toast.error(err instanceof CustomerApiError ? err.message : "Reload failed");
    } finally {
      setReloading(false);
    }
  }

  /**
   * Not gated on blockedReason: rotating is how a leaked link is revoked, so
   * an unpaid invoice must not stand in the way of shutting one off.
   */
  async function onRotateShareCode() {
    await customerApi(`/customer/streams/${id}/share-code/rotate`, { method: "POST" });
    await loadView();
  }

  if (error) {
    return (
      <div>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/customer/streams">
            <ArrowLeft className="size-4" /> Back to my streams
          </Link>
        </Button>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle className="size-4 animate-spin" /> Loading stream...
      </div>
    );
  }

  const { stream, stats, mediaInfo, urls } = view;
  const serverStatus = stream.server?.status;
  // Reload and Edit push to the server, which the API refuses unless it is
  // ACTIVE; stated on click rather than after a failed round trip.
  const serverReason =
    serverStatus && serverStatus !== "ACTIVE"
      ? `Server "${stream.server?.name ?? "unknown"}" is ${serverStatus.toLowerCase()}, so this stream cannot be changed right now. Contact your provider.`
      : null;
  // Billing blocks the same actions when the stream has no active bill.
  const blockedReason = serverReason ?? (stream.access?.state === "BLOCKED" ? BILLING_BLOCKED_MESSAGE : null);
  const status = (stats?.status as string) ?? null;
  const tracks = mediaInfo?.tracks ?? [];
  // Every browser-playable protocol, best first - the same selection the
  // public share page makes, so the preview and the shared link behave alike.
  const playSources = playableSources(urls.outputs);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/customer/streams"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            <ArrowLeft className="size-3" /> My Streams
          </Link>
          <h1 className="truncate text-xl font-semibold sm:text-2xl">{stream.title}</h1>
          <code className="text-muted-foreground font-mono text-xs break-all">{stream.name}</code>
        </div>
        {/* Badges and actions wrap together on a phone rather than forcing a
            horizontal scroll. */}
        <div className="flex flex-wrap items-center gap-2">
          {stream.disabled && <Badge variant="outline">Disabled</Badge>}
          {stream.access?.state === "BLOCKED" && <Badge variant="destructive">Blocked · no active bill</Badge>}
          {stream.access?.state === "GRACE" && (
            <Badge variant="warning">Grace until {formatDateTime(stream.access.graceEndsAt, timezone)}</Badge>
          )}
          {serverStatus && serverStatus !== "ACTIVE" && (
            <Badge variant="warning">Server {serverStatus.toLowerCase()}</Badge>
          )}
          {!view.live && <Badge variant="destructive">Server unreachable</Badge>}
          <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
          <Button type="button" variant="outline" onClick={onReload} disabled={reloading}>
            {reloading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RotateCw className="size-4" />
            )}
            Reload
          </Button>
          {/* The edit form lives on the list page; linking to it with ?edit
              keeps one form rather than two that can drift apart. While the
              server is down the link is replaced by the explanation, so the
              customer is not sent to a form that would refuse to save. */}
          {blockedReason ? (
            <Button type="button" variant="outline" onClick={() => toast.error(blockedReason)}>
              <Pencil className="size-4" /> Edit
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={`/customer/streams?edit=${stream.id}`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
          )}
        </div>
      </div>

      {blockedReason && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {serverReason
            ? `${serverReason} Editing, reloading and enabling or disabling it will stay unavailable until the server is active again.`
            : blockedReason}
        </p>
      )}

      {!view.live && view.liveError && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Live statistics unavailable: {view.liveError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Status"
          value={status ? status.toUpperCase() : stream.disabled ? "OFF" : "—"}
          sub={stats?.alive === true ? "receiving" : status ? "not receiving" : undefined}
        />
        <StatCard
          label="Viewers"
          value={num(stats?.client_count) ?? num(stats?.online_clients) ?? "—"}
          sub="currently watching"
        />
        <StatCard
          label="Bitrate in / out"
          value={`${formatBitrate(num(stats?.input_bitrate) ?? num(stats?.bitrate))} / ${formatBitrate(num(stats?.output_bitrate))}`}
          sub={`${formatBytes(num(stats?.bytes_in))} in · ${formatBytes(num(stats?.bytes_out))} out`}
        />
        <StatCard label="Uptime" value={formatDuration(num(stats?.lifetime))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Publish to
            </div>
            <div className="mt-3 grid gap-2">
              {urls.inputs.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  This stream pulls from its configured source, so there is nothing to publish to.
                </p>
              ) : (
                urls.inputs.map((entry) => <UrlRow key={entry.label + entry.url} entry={entry} />)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Play from
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
              {playSources[0] && <Badge variant="secondary">{playSources[0].label}</Badge>}
            </div>
            <div className="mt-3">
              {playSources.length > 0 ? (
                <StreamPlayer
                  sources={playSources}
                  title={stream.title}
                  className="aspect-video w-full overflow-hidden rounded-md border"
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  No browser-playable protocol is enabled on this stream, so there is nothing
                  to preview.
                </p>
              )}
            </div>

            <div className="mt-4 border-t pt-4">
              <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                Public share link
              </div>
              <StreamShareActions
                shareCode={stream.shareCode}
                protocols={stream.protocols}
                onRotate={onRotateShareCode}
              />
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
                      <th className="pb-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracks.map((track, index) => {
                      const width = num(track.width);
                      const height = num(track.height);
                      const channels = num(track.channels);
                      const fps = num(track.fps);
                      return (
                        <tr key={index} className="border-t">
                          <td className="py-2 pr-3">
                            <Badge variant="outline">
                              {String(track.content ?? track.type ?? "—").toUpperCase()}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {String(track.codec ?? "—")}
                          </td>
                          <td className="py-2 pr-3">{formatBitrate(num(track.bitrate))}</td>
                          <td className="py-2">
                            {width && height
                              ? `${width}x${height}${fps ? ` · ${fps} fps` : ""}`
                              : channels
                                ? `${channels} ch`
                                : "—"}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Who is watching
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
                onClick={() => void loadSessions()}
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
                : "No one is watching right now."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-xs uppercase">
                  <tr className="text-left">
                    <th className="pb-2 pr-3 font-medium">Client IP</th>
                    <th className="pb-2 pr-3 font-medium">User agent</th>
                    <th className="pb-2 pr-3 font-medium">Protocol</th>
                    <th className="pb-2 pr-3 font-medium">Country</th>
                    <th className="pb-2 pr-3 font-medium">Data</th>
                    <th className="pb-2 pr-3 font-medium">Duration</th>
                    <th className="pb-2 font-medium">Since</th>
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
                            // third-party site and should not be told which page
                            // the address came from.
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
                        {formatTimeOnly(session.opened_at ?? null, timezone)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
