"use client";

import * as React from "react";
import { ArrowDownAZ, ArrowUpAZ, Eye, LoaderCircle, Pencil, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
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
import { useSession } from "@/hooks/use-session";
import { api, ApiError, type ListResponse } from "@/lib/api";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { formatDateTime } from "@/lib/datetime";

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
  tenantBusiness?: { id: string; systemCode: string; name: string };
}

interface TenantBusinessOption {
  id: string;
  name: string;
}

interface ServerFormValues {
  tenantBusinessId: string;
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
  status: "ACTIVE" | "INACTIVE" | "BLOCKED" | "TERMINATED";
}

const EMPTY_FORM: ServerFormValues = {
  tenantBusinessId: "",
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
  status: "ACTIVE",
};

export default function StreamingServersPage() {
  const { hasPermission } = useSession();
  const timezone = useAppTimezone();

  const canCreate = hasPermission("tenant-streaming-servers:create");
  const canUpdate = hasPermission("tenant-streaming-servers:update");
  const canDelete = hasPermission("tenant-streaming-servers:delete");
  const canSync = hasPermission("tenant-streaming-servers:sync");
  const canViewStats = hasPermission("tenant-streaming-servers:view");
  const canRestore = hasPermission("tenant-streaming-servers:restore");

  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState("createdAt");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  const list = useResourceList<StreamingServerRow>("/system/tenant-streaming-servers", {
    status: statusFilter || undefined,
    sortBy,
    sortOrder,
  });

  const [businessOptions, setBusinessOptions] = React.useState<TenantBusinessOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StreamingServerRow | null>(null);
  const [form, setForm] = React.useState<ServerFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<StreamingServerRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);
  const [statsTarget, setStatsTarget] = React.useState<StreamingServerRow | null>(null);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  function ensureBusinessOptions() {
    if (businessOptions) return;
    api<ListResponse<TenantBusinessOption>>("/system/tenant-business?limit=100&page=1")
      .then((data) => setBusinessOptions(data.items))
      .catch(() => toast.error("Failed to load business list"));
  }

  function openCreate() {
    ensureBusinessOptions();
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: StreamingServerRow) {
    ensureBusinessOptions();
    setEditing(row);
    setForm({
      tenantBusinessId: row.tenantBusinessId,
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
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        tenantBusinessId: form.tenantBusinessId,
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
        // Only send the password when the user typed one, so an untouched field
        // leaves the stored value alone. The access token is derived server-side.
        ...(form.apiPassword ? { apiPassword: form.apiPassword } : {}),
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await api(`/system/tenant-streaming-servers/${editing.id}`, { method: "PATCH", body });
        toast.success("Server updated");
      } else {
        await api("/system/tenant-streaming-servers", { method: "POST", body });
        toast.success("Server created");
      }
      setFormOpen(false);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/system/tenant-streaming-servers/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Server deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onRestore(row: StreamingServerRow) {
    setRestoringId(row.id);
    try {
      await api(`/system/tenant-streaming-servers/${row.id}/restore`, { method: "PATCH" });
      toast.success("Server restored");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  async function onCheckConnection(row: StreamingServerRow) {
    setSyncingId(row.id);
    try {
      const updated = await api<StreamingServerRow>(
        `/system/tenant-streaming-servers/${row.id}/check-connection`,
        { method: "POST" },
      );
      const { label } = CONNECTION_BADGE[updated.connectionStatus];
      if (updated.connectionStatus === "CONNECTED") toast.success(`${row.name}: ${label}`);
      else toast.error(`${row.name}: ${label}`);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Connection check failed");
    } finally {
      setSyncingId(null);
    }
  }

  const columns: Column<StreamingServerRow>[] = [
    { header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
    { header: "Business", cell: (row) => row.tenantBusiness?.name ?? "—" },
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
        description="Manage streaming servers for tenant businesses."
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
          <>
            <Select
              value={statusFilter || "ALL"}
              onValueChange={(v) => {
                setStatusFilter(v === "ALL" ? "" : v);
                list.setPage(1);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="BLOCKED">Blocked</SelectItem>
                <SelectItem value="TERMINATED">Terminated</SelectItem>
                <SelectItem value="DELETED">Deleted</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(v) => {
                setSortBy(v);
                list.setPage(1);
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Created</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="hostName">Host</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Toggle sort order"
              onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
            >
              {sortOrder === "asc" ? (
                <ArrowUpAZ className="size-4" />
              ) : (
                <ArrowDownAZ className="size-4" />
              )}
            </Button>
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Server
              </Button>
            )}
          </>
        }
        renderActions={
          canUpdate || canDelete || canRestore || canSync || canViewStats
            ? (row) => (
                <RowActionsMenu
                  actions={
                    row.status === "DELETED"
                      ? canRestore
                        ? [
                            {
                              label: "Restore",
                              icon: RotateCcw,
                              onClick: () => onRestore(row),
                              loading: restoringId === row.id,
                              disabled: restoringId === row.id,
                            },
                          ]
                        : []
                      : [
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
                        ]
                  }
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
              <DialogDescription>
                Streaming server used by a tenant business.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Business</Label>
                <Combobox
                  options={businessOptions?.map((biz) => ({ value: biz.id, label: biz.name })) ?? null}
                  value={form.tenantBusinessId}
                  onValueChange={(v) => setForm((f) => ({ ...f, tenantBusinessId: v }))}
                  onOpenChange={(open) => open && ensureBusinessOptions()}
                  placeholder="Select a business"
                  searchPlaceholder="Search businesses..."
                  emptyText="No businesses found."
                />
              </div>

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
              <Button type="submit" disabled={saving || !form.tenantBusinessId}>
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
          api<ServerStatsResponse>(`/system/tenant-streaming-servers/${statsTarget?.id}/stats`).then(
            (result) => {
              // The read also refreshes connection status and version on the
              // record, so the row behind the modal must not stay stale.
              list.refresh();
              return result;
            },
          )
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
