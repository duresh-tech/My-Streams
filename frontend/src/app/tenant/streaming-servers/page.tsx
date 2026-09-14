"use client";

import * as React from "react";
import { Eye, LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ResourceTable, StatusBadgeText, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { ServerStatsDialog, type ServerStatsResponse } from "@/components/server-stats-dialog";
import { useResourceList } from "@/hooks/use-resource-list";
import { useTenantSession } from "@/hooks/use-tenant-session";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { formatDateTime } from "@/lib/datetime";
import { DEFAULT_EVENT_TYPES, STREAM_EVENT_GROUPS } from "@/lib/stream-events";

type ServerStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "TERMINATED" | "DELETED";

type ConnectionStatus = "UNKNOWN" | "CONNECTED" | "UNAUTHORIZED" | "UNREACHABLE";

const CONNECTION_BADGE: Record<
  ConnectionStatus,
  { label: string; variant: "success" | "destructive" | "warning" | "outline" }
> = {
  CONNECTED: { label: "Connected", variant: "success" },
  UNAUTHORIZED: { label: "Unauthorized", variant: "destructive" },
  UNREACHABLE: { label: "Unreachable", variant: "warning" },
  UNKNOWN: { label: "Not checked", variant: "outline" },
};

interface StreamingServerRow {
  id: string;
  systemCode: string;
  tenantBusinessId: string;
  name: string;
  hostName: string;
  hostPort: number;
  domain: string | null;
  useSSL: boolean;
  apiUsername: string | null;
  apiBasePath: string;
  apiVersionTag: string | null;
  httpPort: number;
  httpsPort: number;
  rtmpPort: number;
  rtmpsPort: number;
  rtspPort: number;
  rtspsPort: number;
  srtPort: number;
  serverVersion: string | null;
  remark: string | null;
  status: ServerStatus;
  connectionStatus: ConnectionStatus;
  connectionCheckedAt: number | null;
  hasApiPassword: boolean;
  hasApiAccessToken: boolean;
  eventsEnabled: boolean;
  eventTypes: string[];
  eventSinkSyncedAt: number | null;
  eventSinkError: string | null;
  tenantBusiness?: { id: string; systemCode: string; name: string };
}

interface ServerFormValues {
  name: string;
  hostName: string;
  hostPort: string;
  domain: string;
  useSSL: boolean;
  apiUsername: string;
  apiPassword: string;
  apiBasePath: string;
  apiVersionTag: string;
  serverVersion: string;
  httpPort: string;
  httpsPort: string;
  rtmpPort: string;
  rtmpsPort: string;
  rtspPort: string;
  rtspsPort: string;
  srtPort: string;
  remark: string;
  eventsEnabled: boolean;
  eventTypes: string[];
  status: "ACTIVE" | "INACTIVE" | "BLOCKED" | "TERMINATED";
}

const EMPTY_FORM: ServerFormValues = {
  name: "",
  hostName: "",
  hostPort: "80",
  domain: "",
  useSSL: true,
  apiUsername: "",
  apiPassword: "",
  apiBasePath: "/streamer/api/v3",
  apiVersionTag: "",
  serverVersion: "",
  httpPort: "80",
  httpsPort: "443",
  rtmpPort: "1935",
  rtmpsPort: "443",
  rtspPort: "554",
  rtspsPort: "322",
  srtPort: "9710",
  remark: "",
  eventsEnabled: false,
  eventTypes: [...DEFAULT_EVENT_TYPES],
  status: "ACTIVE",
};

export default function TenantStreamingServersPage() {
  const { hasPermission } = useTenantSession();
  const timezone = useAppTimezone();

  const canCreate = hasPermission("tenant-streaming-servers:create");
  const canUpdate = hasPermission("tenant-streaming-servers:update");
  const canDelete = hasPermission("tenant-streaming-servers:delete");
  const canViewStats = hasPermission("tenant-streaming-servers:view");
  const canSync = hasPermission("tenant-streaming-servers:sync");

  const list = useResourceList<StreamingServerRow>("/tenant/streaming-servers", {}, tenantApi);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StreamingServerRow | null>(null);
  const [form, setForm] = React.useState<ServerFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<StreamingServerRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);
  const [statsTarget, setStatsTarget] = React.useState<StreamingServerRow | null>(null);
  const [eventsAvailable, setEventsAvailable] = React.useState<boolean | null>(null);
  const [syncingSink, setSyncingSink] = React.useState(false);

  React.useEffect(() => {
    tenantApi<{ available: boolean }>("/tenant/streaming-servers/event-options")
      .then((data) => setEventsAvailable(data.available))
      .catch(() => setEventsAvailable(null));
  }, []);

  async function onRetryEventSink() {
    if (!editing) return;
    setSyncingSink(true);
    try {
      const saved = await tenantApi<StreamingServerRow>(`/tenant/streaming-servers/${editing.id}/event-sink/sync`, {
        method: "POST",
      });
      setEditing(saved);
      if (saved.eventSinkError) toast.error(saved.eventSinkError);
      else toast.success(saved.eventsEnabled ? "Events set up on the server" : "Events removed from the server");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Could not sync events");
    } finally {
      setSyncingSink(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: StreamingServerRow) {
    setEditing(row);
    setForm({
      name: row.name,
      hostName: row.hostName,
      hostPort: String(row.hostPort),
      domain: row.domain ?? "",
      useSSL: row.useSSL,
      apiUsername: row.apiUsername ?? "",
      // Stored secrets are never returned; blank means "keep what is saved".
      apiPassword: "",
      apiBasePath: row.apiBasePath,
      apiVersionTag: row.apiVersionTag ?? "",
      serverVersion: row.serverVersion ?? "",
      httpPort: String(row.httpPort),
      httpsPort: String(row.httpsPort),
      rtmpPort: String(row.rtmpPort),
      rtmpsPort: String(row.rtmpsPort),
      rtspPort: String(row.rtspPort),
      rtspsPort: String(row.rtspsPort),
      srtPort: String(row.srtPort),
      remark: row.remark ?? "",
      eventsEnabled: row.eventsEnabled,
      eventTypes: row.eventsEnabled || row.eventTypes.length > 0 ? row.eventTypes : [...DEFAULT_EVENT_TYPES],
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name,
        hostName: form.hostName,
        hostPort: Number(form.hostPort),
        domain: form.domain || undefined,
        useSSL: form.useSSL,
        apiUsername: form.apiUsername || undefined,
        apiBasePath: form.apiBasePath,
        apiVersionTag: form.apiVersionTag || undefined,
        serverVersion: form.serverVersion || undefined,
        httpPort: Number(form.httpPort),
        httpsPort: Number(form.httpsPort),
        rtmpPort: Number(form.rtmpPort),
        rtmpsPort: Number(form.rtmpsPort),
        rtspPort: Number(form.rtspPort),
        rtspsPort: Number(form.rtspsPort),
        srtPort: Number(form.srtPort),
        remark: form.remark || undefined,
        eventsEnabled: form.eventsEnabled,
        eventTypes: form.eventTypes,
        // Only send the password when the user typed one, so an untouched field
        // leaves the stored value alone. The access token is derived server-side.
        ...(form.apiPassword ? { apiPassword: form.apiPassword } : {}),
        ...(editing ? { status: form.status } : {}),
      };
      const saved = editing
        ? await tenantApi<StreamingServerRow>(`/tenant/streaming-servers/${editing.id}`, { method: "PATCH", body })
        : await tenantApi<StreamingServerRow>("/tenant/streaming-servers", { method: "POST", body });
      toast.success(editing ? "Server updated" : "Server created");
      // The save stands even when the server refused the event settings.
      if (saved.eventsEnabled && saved.eventSinkError) {
        toast.warning(`Events are not set up on the server: ${saved.eventSinkError}`);
      }
      setFormOpen(false);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await tenantApi(`/tenant/streaming-servers/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Server deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onCheckConnection(row: StreamingServerRow) {
    setSyncingId(row.id);
    try {
      const updated = await tenantApi<StreamingServerRow>(
        `/tenant/streaming-servers/${row.id}/check-connection`,
        { method: "POST" },
      );
      const { label } = CONNECTION_BADGE[updated.connectionStatus];
      if (updated.connectionStatus === "CONNECTED") toast.success(`${row.name}: ${label}`);
      else toast.error(`${row.name}: ${label}`);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Connection check failed");
    } finally {
      setSyncingId(null);
    }
  }

  const columns: Column<StreamingServerRow>[] = [
    { header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
    {
      header: "Address",
      cell: (row) => (
        <span className="font-mono text-xs">
          {row.useSSL ? "https" : "http"}://{row.domain || row.hostName}:{row.hostPort}
        </span>
      ),
    },
    {
      header: "Credentials",
      cell: (row) =>
        row.hasApiPassword || row.hasApiAccessToken ? (
          <Badge variant="secondary">Set</Badge>
        ) : (
          <Badge variant="outline">None</Badge>
        ),
    },
    {
      header: "Connection",
      cell: (row) => {
        const { label, variant } = CONNECTION_BADGE[row.connectionStatus];
        return (
          <div className="flex flex-col gap-0.5">
            <Badge variant={variant}>{label}</Badge>
            {row.connectionCheckedAt && (
              <span className="text-muted-foreground text-xs">
                {formatDateTime(row.connectionCheckedAt, timezone)}
              </span>
            )}
          </div>
        );
      },
    },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<StreamingServerRow>
        title="Streaming Servers"
        description="Streaming servers used by your business."
        columns={columns}
        rows={list.rows}
        error={list.error}
        page={list.page}
        totalPages={list.totalPages}
        onPageChange={list.setPage}
        search={list.search}
        onSearchChange={list.setSearch}
        onSearchSubmit={list.applySearch}
        toolbarAction={
          canCreate && (
            <Button onClick={openCreate}>
              <Plus className="size-4" /> Add Server
            </Button>
          )
        }
        renderActions={
          canUpdate || canDelete || canSync || canViewStats
            ? (row) => (
                <RowActionsMenu
                  actions={[
                    ...(canViewStats
                      ? [{ label: "View", icon: Eye, onClick: () => setStatsTarget(row) }]
                      : []),
                    ...(canSync
                      ? [
                          {
                            label: "Check Connection",
                            icon: RefreshCw,
                            onClick: () => onCheckConnection(row),
                            loading: syncingId === row.id,
                            disabled: syncingId === row.id,
                          },
                        ]
                      : []),
                    ...(canUpdate
                      ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }]
                      : []),
                    ...(canDelete
                      ? [
                          {
                            label: "Delete",
                            icon: Trash2,
                            onClick: () => setDeleteTarget(row),
                            destructive: true,
                          },
                        ]
                      : []),
                  ]}
                />
              )
            : undefined
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Server" : "Add Server"}</DialogTitle>
              <DialogDescription>Streaming server used by your business.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="hostName">Host Name / IP</Label>
                  <Input
                    id="hostName"
                    required
                    value={form.hostName}
                    onChange={(e) => setForm((f) => ({ ...f, hostName: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="hostPort">Port</Label>
                  <Input
                    id="hostPort"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={form.hostPort}
                    onChange={(e) => setForm((f) => ({ ...f, hostPort: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  placeholder="edge01.example.com"
                  value={form.domain}
                  onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="useSSL"
                  checked={form.useSSL}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, useSSL: checked === true }))}
                />
                <Label htmlFor="useSSL" className="font-normal">
                  Use SSL (https)
                </Label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="apiUsername">API Username</Label>
                  <Input
                    id="apiUsername"
                    autoComplete="off"
                    value={form.apiUsername}
                    onChange={(e) => setForm((f) => ({ ...f, apiUsername: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="apiPassword">API Password</Label>
                  <Input
                    id="apiPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder={editing && editing.hasApiPassword ? "Leave blank to keep" : ""}
                    value={form.apiPassword}
                    onChange={(e) => setForm((f) => ({ ...f, apiPassword: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="apiBasePath">API Base Path</Label>
                  <Input
                    id="apiBasePath"
                    required
                    value={form.apiBasePath}
                    onChange={(e) => setForm((f) => ({ ...f, apiBasePath: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="apiAccessToken">API Access Token</Label>
                  <Input
                    id="apiAccessToken"
                    readOnly
                    disabled
                    value={editing?.hasApiAccessToken ? "••••••••" : ""}
                    placeholder="Generated from the API username and password"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="apiVersionTag">API Version Tag</Label>
                  <Input
                    id="apiVersionTag"
                    placeholder="v3"
                    value={form.apiVersionTag}
                    onChange={(e) => setForm((f) => ({ ...f, apiVersionTag: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="serverVersion">Server Version</Label>
                  <Input
                    id="serverVersion"
                    placeholder="24.11"
                    value={form.serverVersion}
                    onChange={(e) => setForm((f) => ({ ...f, serverVersion: e.target.value }))}
                  />
                </div>
              </div>


              <div className="grid gap-2">
                <Label>Protocol listener ports</Label>
                <p className="text-muted-foreground text-xs">
                  The ports this server listens on. They are used to build the publish and
                  playback URLs shown for each stream.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="httpPort">HTTP port</Label>
                  <Input
                    id="httpPort"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={form.httpPort}
                    onChange={(e) => setForm((f) => ({ ...f, httpPort: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="httpsPort">HTTPS port</Label>
                  <Input
                    id="httpsPort"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={form.httpsPort}
                    onChange={(e) => setForm((f) => ({ ...f, httpsPort: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rtmpPort">RTMP port</Label>
                  <Input
                    id="rtmpPort"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={form.rtmpPort}
                    onChange={(e) => setForm((f) => ({ ...f, rtmpPort: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rtmpsPort">RTMPS port</Label>
                  <Input
                    id="rtmpsPort"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={form.rtmpsPort}
                    onChange={(e) => setForm((f) => ({ ...f, rtmpsPort: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rtspPort">RTSP port</Label>
                  <Input
                    id="rtspPort"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={form.rtspPort}
                    onChange={(e) => setForm((f) => ({ ...f, rtspPort: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rtspsPort">RTSPS port</Label>
                  <Input
                    id="rtspsPort"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={form.rtspsPort}
                    onChange={(e) => setForm((f) => ({ ...f, rtspsPort: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="srtPort">SRT port</Label>
                  <Input
                    id="srtPort"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={form.srtPort}
                    onChange={(e) => setForm((f) => ({ ...f, srtPort: e.target.value }))}
                  />
                </div>
                </div>
              </div>
              <div className="grid gap-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={form.eventsEnabled}
                      disabled={eventsAvailable === false && !form.eventsEnabled}
                      onCheckedChange={(value) =>
                        setForm((f) => ({
                          ...f,
                          eventsEnabled: value === true,
                          eventTypes: value === true && f.eventTypes.length === 0 ? [...DEFAULT_EVENT_TYPES] : f.eventTypes,
                        }))
                      }
                    />
                    Receive stream events
                  </label>
                  {editing?.eventsEnabled &&
                    (editing.eventSinkError ? (
                      <Badge variant="destructive">Not set up on the server</Badge>
                    ) : editing.eventSinkSyncedAt ? (
                      <Badge variant="success">Set up {formatDateTime(editing.eventSinkSyncedAt, timezone)}</Badge>
                    ) : null)}
                </div>
                {eventsAvailable === false ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Stream events are unavailable: the backend has no PUBLIC_API_URL, so the server would have nowhere to
                    send them.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    The server sends the ticked events to this app. Choose which ones email you in Settings → Event
                    Alerts.
                  </p>
                )}
                {form.eventsEnabled && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {STREAM_EVENT_GROUPS.map((group) => (
                      <div key={group.group} className="grid content-start gap-1.5">
                        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</div>
                        {group.events.map((event) => (
                          <label key={event} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={form.eventTypes.includes(event)}
                              onCheckedChange={(value) =>
                                setForm((f) => ({
                                  ...f,
                                  eventTypes:
                                    value === true
                                      ? [...f.eventTypes.filter((e) => e !== event), event]
                                      : f.eventTypes.filter((e) => e !== event),
                                }))
                              }
                            />
                            <code className="text-xs">{event}</code>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {form.eventsEnabled && form.eventTypes.length === 0 && (
                  <p className="text-xs text-destructive">Tick at least one event.</p>
                )}
                {form.eventsEnabled && form.eventTypes.some((event) => event.startsWith("play_")) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Viewer events fire for every viewer - play_updated every few seconds - and can mean heavy traffic.
                  </p>
                )}
                {editing?.eventsEnabled && editing.eventSinkError && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                    <span className="min-w-0 flex-1">{editing.eventSinkError}</span>
                    <Button type="button" size="sm" variant="outline" onClick={onRetryEventSink} disabled={syncingSink}>
                      {syncingSink && <LoaderCircle className="size-4 animate-spin" />}
                      Retry with saved settings
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="remark">Remark</Label>
                <Textarea
                  id="remark"
                  value={form.remark}
                  onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                />
              </div>

              {editing && (
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, status: v as ServerFormValues["status"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="BLOCKED">Blocked</SelectItem>
                      <SelectItem value="TERMINATED">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      <ServerStatsDialog
        open={!!statsTarget}
        onOpenChange={(next) => {
          if (!next) setStatsTarget(null);
        }}
        serverId={statsTarget?.id ?? null}
        serverName={statsTarget?.name ?? ""}
        load={() =>
          tenantApi<ServerStatsResponse>(`/tenant/streaming-servers/${statsTarget?.id}/stats`).then((result) => {
            // The read also refreshes connection status and version on the
            // record, so the row behind the modal must not stay stale.
            list.refresh();
            return result;
          })
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete server"
        description={`This will soft-delete "${deleteTarget?.name}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
