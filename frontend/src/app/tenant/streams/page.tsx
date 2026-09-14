"use client";

import * as React from "react";
import { Download, Eye, LoaderCircle, Pencil, Play, Plus, RefreshCw, RotateCw, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResourceTable, StatusBadgeText, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useResourceList } from "@/hooks/use-resource-list";
import { useTenantSession } from "@/hooks/use-tenant-session";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";
import { StreamFormDialog } from "@/components/stream-form-dialog";
import { SYNC_BADGE, type StreamOption, type StreamRow } from "@/lib/stream-types";

/**
 * Must match the backend's PLAY_PROTOCOLS. `whitelist` is deliberately absent:
 * it is a mode switch, not a protocol, and is rendered separately below.
 */
interface UnmanagedStream {
  serverId: string;
  serverName: string;
  name: string;
  namedBy: string | null;
  title: string | null;
  disabled: boolean;
  inputCount: number;
  adoptable: boolean;
  reason: string | null;
}

interface SyncSummary {
  serverId: string;
  serverName?: string;
  checked: number;
  inSync: number;
  pushed: number;
  conflicts: number;
  unmanaged: number;
  skipped: number;
  failed: number;
  error?: string;
}

/**
 * Why the server-reaching actions are unavailable, or null when they are fine.
 *
 * Edit, reload and enable/disable all push to the server, and the API refuses
 * them outright while the server is not ACTIVE. Checking here as well means the
 * reason is stated the moment the action is clicked rather than after a failed
 * round trip. Status missing (an older response) is treated as usable, so a
 * gap in the data never locks the page.
 */
function serverBlockReason(row: StreamRow): string | null {
  const status = row.server?.status;
  if (!status || status === "ACTIVE") return null;
  return `Server "${row.server?.name ?? "unknown"}" is ${status.toLowerCase()}, so this stream cannot be changed right now.`;
}

export default function TenantStreamsPage() {
  const router = useRouter();
  const { hasPermission } = useTenantSession();

  const canCreate = hasPermission("tenant-streams:create");
  const canUpdate = hasPermission("tenant-streams:update");
  const canDelete = hasPermission("tenant-streams:delete");
  const canEnable = hasPermission("tenant-streams:enable");
  const canDisable = hasPermission("tenant-streams:disable");
  const canSync = hasPermission("tenant-streams:sync");
  const canRename = hasPermission("tenant-streams:rename");
  const canView = hasPermission("tenant-streams:view");
  const canReload = hasPermission("tenant-streams:reload");

  const [statusFilter, setStatusFilter] = React.useState("");
  const [syncFilter, setSyncFilter] = React.useState("");
  const [serverFilter, setServerFilter] = React.useState("");

  const list = useResourceList<StreamRow>(
    "/tenant/streams",
    {
      status: statusFilter || undefined,
      syncStatus: syncFilter || undefined,
      serverId: serverFilter || undefined,
    },
    tenantApi,
  );

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StreamRow | null>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<StreamRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [reloadingId, setReloadingId] = React.useState<string | null>(null);

  const [syncing, setSyncing] = React.useState(false);
  const [unmanagedOpen, setUnmanagedOpen] = React.useState(false);
  const [unmanaged, setUnmanaged] = React.useState<UnmanagedStream[] | null>(null);
  const [adoptingName, setAdoptingName] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);

  const [servers, setServers] = React.useState<StreamOption[] | null>(null);

  function ensureServers() {
    if (servers) return;
    // Only live, reachable servers: this control is both the browse filter and
    // the target for Sync and Import, and neither can do anything useful on a
    // server that is down. Streams on one stay visible under "All servers".
    tenantApi<{ items: StreamOption[] }>(
      "/tenant/streaming-servers?status=ACTIVE&connectionStatus=CONNECTED&limit=100&page=1",
    )
      .then((d) => setServers(d.items))
      .catch(() => toast.error("Failed to load servers"));
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: StreamRow) {
    const blocked = serverBlockReason(row);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setEditing(row);
    setFormOpen(true);
  }

  async function onToggle(row: StreamRow) {
    const blocked = serverBlockReason(row);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setTogglingId(row.id);
    const action = row.disabled ? "enable" : "disable";
    try {
      await tenantApi(`/tenant/streams/${row.id}/${action}`, { method: "POST" });
      toast.success(row.disabled ? "Stream enabled" : "Stream disabled");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Action failed");
    } finally {
      setTogglingId(null);
    }
  }

  function summarise(s: SyncSummary) {
    const parts = [
      `${s.inSync} in sync`,
      s.pushed ? `${s.pushed} pushed` : null,
      s.conflicts ? `${s.conflicts} conflict(s)` : null,
      s.unmanaged ? `${s.unmanaged} unmanaged` : null,
      s.failed ? `${s.failed} failed` : null,
    ].filter(Boolean);
    return `${s.serverName ? s.serverName + ": " : ""}checked ${s.checked} — ${parts.join(", ")}`;
  }

  /** Syncs the selected server, or every server when the filter is "All". */
  async function onSync() {
    setSyncing(true);
    try {
      const summaries = serverFilter
        ? [
            await tenantApi<SyncSummary>(`/tenant/streams/servers/${serverFilter}/sync`, {
              method: "POST",
            }),
          ]
        : await tenantApi<SyncSummary[]>("/tenant/streams/sync", { method: "POST" });

      if (summaries.length === 0) {
        toast.info("No active servers to sync");
      }
      for (const summary of summaries) {
        if (summary.error) toast.error(`${summary.serverName ?? "Server"}: ${summary.error}`);
        else if (summary.conflicts || summary.failed) toast.warning(summarise(summary));
        else toast.success(summarise(summary));
      }
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  /** Unmanaged for the selected server, or across all of them. */
  async function openUnmanaged() {
    setUnmanaged(null);
    setUnmanagedOpen(true);
    try {
      const rows = serverFilter
        ? (
            await tenantApi<Omit<UnmanagedStream, "serverId" | "serverName">[]>(
              `/tenant/streams/servers/${serverFilter}/unmanaged`,
            )
          ).map((r) => ({
            ...r,
            serverId: serverFilter,
            serverName: servers?.find((s) => s.id === serverFilter)?.name ?? "",
          }))
        : await tenantApi<UnmanagedStream[]>("/tenant/streams/unmanaged");
      setUnmanaged(rows);
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Failed to load");
      setUnmanagedOpen(false);
    }
  }

  async function onAdopt(row: UnmanagedStream) {
    setAdoptingName(row.name);
    try {
      await tenantApi(`/tenant/streams/servers/${row.serverId}/adopt`, {
        method: "POST",
        body: { name: row.name },
      });
      toast.success(`Imported ${row.name}`);
      setUnmanaged((u) => (u ? u.filter((x) => x.name !== row.name) : u));
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Import failed");
    } finally {
      setAdoptingName(null);
    }
  }

  /** Bulk import: every adoptable stream on each server represented in the list. */
  async function onImportAll() {
    if (!unmanaged || unmanaged.length === 0) return;
    setImporting(true);
    try {
      const serverIds = [...new Set(unmanaged.filter((u) => u.adoptable).map((u) => u.serverId))];
      let adopted = 0;
      let skipped = 0;
      let failed = 0;
      for (const serverId of serverIds) {
        const result = await tenantApi<{
          adopted: number;
          skipped: number;
          failed: number;
          errors: Array<{ name: string; error: string }>;
        }>(`/tenant/streams/servers/${serverId}/adopt-all`, { method: "POST" });
        adopted += result.adopted;
        skipped += result.skipped;
        failed += result.failed;
        // Show the first few reasons rather than a bare count.
        result.errors.slice(0, 3).forEach((e) => toast.warning(`${e.name}: ${e.error}`));
      }
      const parts = [
        `${adopted} imported`,
        skipped ? `${skipped} skipped` : null,
        failed ? `${failed} failed` : null,
      ].filter(Boolean);
      if (failed) toast.warning(parts.join(", "));
      else toast.success(parts.join(", "));
      setUnmanagedOpen(false);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  /** Disable then re-enable on the server, to kick a stuck source. */
  async function onReloadStream(row: StreamRow) {
    const blocked = serverBlockReason(row);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setReloadingId(row.id);
    try {
      await tenantApi(`/tenant/streams/${row.id}/reload`, { method: "POST" });
      toast.success(`${row.title} reloaded`);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Reload failed");
    } finally {
      setReloadingId(null);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await tenantApi(`/tenant/streams/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Stream deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<StreamRow>[] = [
    {
      header: "Stream",
      cell: (row) =>
        canView ? (
          <Link href={`/tenant/streams/${row.id}`} className="flex flex-col gap-0.5 hover:underline">
            <span className="font-medium">{row.title}</span>
            <span className="text-muted-foreground font-mono text-xs">{row.name}</span>
          </Link>
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{row.title}</span>
            <span className="text-muted-foreground font-mono text-xs">{row.name}</span>
          </div>
        ),
    },
    {
      header: "Server",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <span>{row.server?.name ?? "—"}</span>
          {row.server?.status && row.server.status !== "ACTIVE" && (
            <Badge variant="warning">{row.server.status}</Badge>
          )}
          {row.server?.status === "ACTIVE" && row.server.connectionStatus !== "CONNECTED" && (
            <Badge variant="outline">
              {row.server.connectionStatus === "UNAUTHORIZED"
                ? "Unauthorized"
                : row.server.connectionStatus === "UNREACHABLE"
                  ? "Unreachable"
                  : "Not checked"}
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: "Customer",
      cell: (row) =>
        row.tenantCustomer
          ? `${row.tenantCustomer.customerCode} — ${row.tenantCustomer.fName}`
          : "—",
    },
    {
      header: "Enabled",
      cell: (row) =>
        row.disabled ? (
          <Badge variant="outline">Disabled</Badge>
        ) : (
          <Badge variant="success">Enabled</Badge>
        ),
    },
    {
      header: "Sync",
      cell: (row) => {
        const { label, variant } = SYNC_BADGE[row.syncStatus];
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<StreamRow>
        title="Streams"
        description="Streams configured on your servers."
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
              value={serverFilter || "ALL"}
              onValueChange={(v) => {
                setServerFilter(v === "ALL" ? "" : v);
                list.setPage(1);
              }}
              onOpenChange={(open) => open && ensureServers()}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Server" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All servers</SelectItem>
                {(servers ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={syncFilter || "ALL"}
              onValueChange={(v) => {
                setSyncFilter(v === "ALL" ? "" : v);
                list.setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sync" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All sync states</SelectItem>
                {Object.entries(SYNC_BADGE).map(([value, { label }]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                <SelectItem value="DELETED">Deleted</SelectItem>
              </SelectContent>
            </Select>
            {canSync && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onSync}
                  disabled={syncing}
                  title={
                    serverFilter ? "Reconcile this server" : "Reconcile every server"
                  }
                >
                  {syncing ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Sync
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={openUnmanaged}
                  title="Streams on your servers with no record here"
                >
                  <Download className="size-4" /> Import
                </Button>
              </>
            )}
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Stream
              </Button>
            )}
          </>
        }
        renderActions={
          canView || canUpdate || canDelete || canEnable || canDisable || canReload
            ? (row) => (
                <RowActionsMenu
                  actions={[
                    ...(canView
                      ? [
                          {
                            label: "View",
                            icon: Eye,
                            onClick: () => router.push(`/tenant/streams/${row.id}`),
                          },
                        ]
                      : []),
                    ...(canUpdate
                      ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }]
                      : []),
                    ...(canReload
                      ? [
                          {
                            label: "Reload",
                            icon: RotateCw,
                            onClick: () => onReloadStream(row),
                            loading: reloadingId === row.id,
                            disabled: reloadingId === row.id,
                          },
                        ]
                      : []),
                    ...((row.disabled ? canEnable : canDisable)
                      ? [
                          {
                            label: row.disabled ? "Enable" : "Disable",
                            icon: row.disabled ? Play : Square,
                            onClick: () => onToggle(row),
                            loading: togglingId === row.id,
                            disabled: togglingId === row.id,
                          },
                        ]
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

      <StreamFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={() => list.refresh()}
        canRename={canRename}
      />

      <Dialog open={unmanagedOpen} onOpenChange={setUnmanagedOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import existing streams</DialogTitle>
            <DialogDescription>
              Streams already configured on your servers with no record here. Importing takes one
              over exactly as it is on the server — nothing is changed or deleted there.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {unmanaged === null ? (
              <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                <LoaderCircle className="size-4 animate-spin" /> Loading...
              </div>
            ) : unmanaged.length === 0 ? (
              <p className="text-muted-foreground py-6 text-sm">
                Nothing unmanaged — every config stream on this server is already tracked here.
              </p>
            ) : (
              <div className="grid gap-2">
                {unmanaged.map((u) => (
                  <div
                    key={u.name}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{u.title || u.name}</div>
                      <div className="text-muted-foreground truncate font-mono text-xs">
                        {u.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {u.serverName && <Badge variant="secondary">{u.serverName}</Badge>}
                        <Badge variant="outline">{u.inputCount} input(s)</Badge>
                        {u.disabled && <Badge variant="outline">Disabled</Badge>}
                        {u.namedBy && <Badge variant="info">{u.namedBy}</Badge>}
                      </div>
                      {!u.adoptable && u.reason && (
                        <p className="text-muted-foreground mt-1 text-xs">{u.reason}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!u.adoptable || adoptingName === u.name || importing}
                      onClick={() => onAdopt(u)}
                    >
                      {adoptingName === u.name && (
                        <LoaderCircle className="size-4 animate-spin" />
                      )}
                      Import
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUnmanagedOpen(false)}>
              Close
            </Button>
            {!!unmanaged?.some((u) => u.adoptable) && (
              <Button type="button" onClick={onImportAll} disabled={importing}>
                {importing && <LoaderCircle className="size-4 animate-spin" />}
                Import all {unmanaged.filter((u) => u.adoptable).length}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete stream"
        description={`This will soft-delete "${deleteTarget?.title}" (${deleteTarget?.name}).`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
