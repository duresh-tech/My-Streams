"use client";

import * as React from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ResourceTable, StatusBadgeText, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useResourceList } from "@/hooks/use-resource-list";
import { useTenantSession } from "@/hooks/use-tenant-session";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";
import type { StreamOption } from "@/lib/stream-types";

type AssignmentStatus = "ACTIVE" | "INACTIVE" | "DELETED";

interface AssignmentRow {
  id: string;
  systemCode: string;
  tenantCustomerId: string;
  serverId: string;
  streamLimit: number | null;
  isDedicated: boolean;
  remark: string | null;
  status: AssignmentStatus;
  /** Counted live from the streams table by the API. */
  streamsUsed: number;
  /** Null when the limit is unlimited. */
  streamsRemaining: number | null;
  tenantCustomer?: { id: string; customerCode: string; fName: string; lName: string | null };
  server?: { id: string; name: string };
}

interface FormValues {
  tenantCustomerId: string;
  serverId: string;
  streamLimit: string;
  isDedicated: boolean;
  remark: string;
  status: "ACTIVE" | "INACTIVE";
}

const EMPTY_FORM: FormValues = {
  tenantCustomerId: "",
  serverId: "",
  streamLimit: "",
  isDedicated: false,
  remark: "",
  status: "ACTIVE",
};

export default function TenantCustomerServersPage() {
  const { hasPermission } = useTenantSession();

  const canCreate = hasPermission("tenant-customer-servers:create");
  const canUpdate = hasPermission("tenant-customer-servers:update");
  const canDelete = hasPermission("tenant-customer-servers:delete");

  const [statusFilter, setStatusFilter] = React.useState("");
  const [serverFilter, setServerFilter] = React.useState("");

  const list = useResourceList<AssignmentRow>(
    "/tenant/customer-servers",
    {
      status: statusFilter || undefined,
      serverId: serverFilter || undefined,
    },
    tenantApi,
  );

  const [servers, setServers] = React.useState<StreamOption[] | null>(null);
  const [customers, setCustomers] = React.useState<StreamOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AssignmentRow | null>(null);
  const [form, setForm] = React.useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<AssignmentRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function ensureServers() {
    if (servers) return;
    tenantApi<{ items: StreamOption[] }>("/tenant/streaming-servers?limit=100&page=1")
      .then((d) => setServers(d.items))
      .catch(() => toast.error("Failed to load servers"));
  }

  function ensureCustomers() {
    if (customers) return;
    tenantApi<{
      items: { id: string; customerCode: string; fName: string; lName: string | null }[];
    }>("/tenant/customers?limit=100&page=1")
      .then((d) =>
        setCustomers(
          d.items.map((c) => ({
            id: c.id,
            name: `${c.customerCode} — ${c.fName}${c.lName ? " " + c.lName : ""}`,
          })),
        ),
      )
      .catch(() => toast.error("Failed to load customers"));
  }

  function openCreate() {
    ensureServers();
    ensureCustomers();
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: AssignmentRow) {
    ensureServers();
    ensureCustomers();
    setEditing(row);
    setForm({
      tenantCustomerId: row.tenantCustomerId,
      serverId: row.serverId,
      streamLimit: row.streamLimit == null ? "" : String(row.streamLimit),
      isDedicated: row.isDedicated,
      remark: row.remark ?? "",
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // An empty limit means unlimited, so it is sent as null rather than 0.
      const limit = form.streamLimit.trim() === "" ? null : Number(form.streamLimit);

      if (editing) {
        // The customer and server identify the assignment and are fixed; only
        // the terms can change.
        await tenantApi(`/tenant/customer-servers/${editing.id}`, {
          method: "PATCH",
          body: {
            streamLimit: limit,
            isDedicated: form.isDedicated,
            remark: form.remark.trim() || null,
            status: form.status,
          },
        });
        toast.success("Assignment updated");
      } else {
        await tenantApi("/tenant/customer-servers", {
          method: "POST",
          body: {
            tenantCustomerId: form.tenantCustomerId,
            serverId: form.serverId,
            streamLimit: limit,
            isDedicated: form.isDedicated,
            remark: form.remark.trim() || null,
          },
        });
        toast.success("Server assigned");
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
      await tenantApi(`/tenant/customer-servers/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Assignment revoked");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      // The API refuses while streams still exist on that server, and that
      // message is the useful part.
      toast.error(error instanceof TenantApiError ? error.message : "Revoke failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<AssignmentRow>[] = [
    {
      header: "Customer",
      cell: (row) =>
        row.tenantCustomer ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">
              {row.tenantCustomer.fName}
              {row.tenantCustomer.lName ? ` ${row.tenantCustomer.lName}` : ""}
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              {row.tenantCustomer.customerCode}
            </span>
          </div>
        ) : (
          "—"
        ),
    },
    {
      header: "Server",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span>{row.server?.name ?? "—"}</span>
          {row.isDedicated && <Badge variant="info">Dedicated</Badge>}
        </div>
      ),
    },
    {
      header: "Streams",
      cell: (row) => (
        <div className="text-sm">
          {row.streamLimit === null ? (
            <span>
              {row.streamsUsed} <span className="text-muted-foreground">/ unlimited</span>
            </span>
          ) : (
            <span
              className={
                row.streamsRemaining === 0 ? "font-medium text-amber-600 dark:text-amber-400" : ""
              }
            >
              {row.streamsUsed} / {row.streamLimit}
            </span>
          )}
          {row.streamLimit !== null && row.streamsRemaining === 0 && (
            <div className="text-muted-foreground text-xs">limit reached</div>
          )}
        </div>
      ),
    },
    {
      header: "Remark",
      cell: (row) => (
        <span className="text-muted-foreground max-w-[16rem] truncate text-xs">
          {row.remark || "—"}
        </span>
      ),
    },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<AssignmentRow>
        title="Customer Servers"
        description="Which streaming servers each customer may use, and how many streams they get."
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
                <SelectItem value="DELETED">Revoked</SelectItem>
              </SelectContent>
            </Select>
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Assign Server
              </Button>
            )}
          </>
        }
        renderActions={
          canUpdate || canDelete
            ? (row) => (
                <RowActionsMenu
                  actions={[
                    ...(canUpdate
                      ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }]
                      : []),
                    ...(canDelete
                      ? [
                          {
                            label: "Revoke",
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit assignment" : "Assign a server"}</DialogTitle>
              <DialogDescription>
                Give a customer access to a streaming server, and cap how many streams they may
                run on it.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Customer *</Label>
                <Combobox
                  options={customers?.map((c) => ({ value: c.id, label: c.name })) ?? null}
                  value={form.tenantCustomerId}
                  onValueChange={(v) => setForm((f) => ({ ...f, tenantCustomerId: v }))}
                  onOpenChange={(open) => open && ensureCustomers()}
                  placeholder="Select a customer"
                  searchPlaceholder="Search customers..."
                  emptyText="No customers found."
                  disabled={!!editing}
                />
              </div>

              <div className="grid gap-2">
                <Label>Server *</Label>
                <Combobox
                  options={servers?.map((s) => ({ value: s.id, label: s.name })) ?? null}
                  value={form.serverId}
                  onValueChange={(v) => setForm((f) => ({ ...f, serverId: v }))}
                  onOpenChange={(open) => open && ensureServers()}
                  placeholder="Select a server"
                  searchPlaceholder="Search servers..."
                  emptyText="No servers found."
                  disabled={!!editing}
                />
                {editing && (
                  <p className="text-muted-foreground text-xs">
                    The customer and server identify this assignment and cannot be changed. Revoke
                    it and create a new one instead.
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="streamLimit">Stream limit</Label>
                <Input
                  id="streamLimit"
                  type="number"
                  min={0}
                  placeholder="Unlimited"
                  value={form.streamLimit}
                  onChange={(e) => setForm((f) => ({ ...f, streamLimit: e.target.value }))}
                />
                <p className="text-muted-foreground text-xs">
                  Leave empty for unlimited.
                  {editing
                    ? ` This customer currently uses ${editing.streamsUsed} stream(s) here, so the limit cannot be set below that.`
                    : ""}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="isDedicated"
                  checked={form.isDedicated}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, isDedicated: c === true }))}
                />
                <Label htmlFor="isDedicated" className="font-normal">
                  Dedicated server for this customer
                </Label>
              </div>
              <p className="text-muted-foreground -mt-2 text-xs">
                Refused if the server is already assigned to another customer.
              </p>

              <div className="grid gap-2">
                <Label htmlFor="remark">Remark</Label>
                <Input
                  id="remark"
                  maxLength={255}
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
                      setForm((f) => ({ ...f, status: v as "ACTIVE" | "INACTIVE" }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || (!editing && (!form.tenantCustomerId || !form.serverId))}
              >
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Revoke this assignment?"
        description={`${deleteTarget?.tenantCustomer?.fName ?? "This customer"} will lose access to ${deleteTarget?.server?.name ?? "this server"}. Revoking is refused while they still have streams on it.`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
