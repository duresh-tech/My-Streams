"use client";

import * as React from "react";
import { Eye, LoaderCircle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { useSession } from "@/hooks/use-session";
import { api, ApiError, type ListResponse } from "@/lib/api";

type MappingStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";

interface MappingRow {
  id: string;
  systemCode: string;
  status: MappingStatus;
  tenantUser: { id: string; fName: string; username: string; email: string };
  tenantBusiness: { id: string; name: string; email: string };
}

interface TenantUserOption {
  id: string;
  fName: string;
  username: string;
}

interface TenantBusinessOption {
  id: string;
  name: string;
}

interface MappingFormValues {
  tenantUserId: string;
  tenantBusinessId: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: MappingFormValues = {
  tenantUserId: "",
  tenantBusinessId: "",
  status: "ACTIVE",
};

export default function TenantMappedBusinessPage() {
  const { hasPermission } = useSession();

  const canCreate = hasPermission("tenant-mapped-business:create");
  const canView = hasPermission("tenant-mapped-business:view");
  const canUpdate = hasPermission("tenant-mapped-business:update");
  const canDelete = hasPermission("tenant-mapped-business:delete");
  const canRestore = hasPermission("tenant-mapped-business:restore");

  const [tenantUserFilter, setTenantUserFilter] = React.useState("");
  const [tenantBusinessFilter, setTenantBusinessFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");

  const list = useResourceList<MappingRow>("/tenant/mapped-business", {
    tenantUserId: tenantUserFilter || undefined,
    tenantBusinessId: tenantBusinessFilter || undefined,
    status: statusFilter || undefined,
  });

  const [tenantUserOptions, setTenantUserOptions] = React.useState<TenantUserOption[] | null>(null);
  const [tenantBusinessOptions, setTenantBusinessOptions] = React.useState<
    TenantBusinessOption[] | null
  >(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MappingRow | null>(null);
  const [form, setForm] = React.useState<MappingFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<MappingRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  const [viewTarget, setViewTarget] = React.useState<MappingRow | null>(null);

  function ensureTenantUserOptions() {
    if (tenantUserOptions) return;
    api<ListResponse<TenantUserOption>>("/system/tenant-users?limit=100&page=1")
      .then((data) => setTenantUserOptions(data.items))
      .catch(() => toast.error("Failed to load tenant user list"));
  }

  function ensureTenantBusinessOptions() {
    if (tenantBusinessOptions) return;
    api<ListResponse<TenantBusinessOption>>("/system/tenant-business?limit=100&page=1")
      .then((data) => setTenantBusinessOptions(data.items))
      .catch(() => toast.error("Failed to load tenant business list"));
  }

  function openCreate() {
    ensureTenantUserOptions();
    ensureTenantBusinessOptions();
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: MappingRow) {
    ensureTenantUserOptions();
    ensureTenantBusinessOptions();
    setEditing(row);
    setForm({
      tenantUserId: row.tenantUser.id,
      tenantBusinessId: row.tenantBusiness.id,
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api(`/tenant/mapped-business/${editing.id}`, {
          method: "PUT",
          body: {
            tenantUserId: form.tenantUserId,
            tenantBusinessId: form.tenantBusinessId,
            status: form.status,
          },
        });
        toast.success("Mapping updated");
      } else {
        await api("/tenant/mapped-business", {
          method: "POST",
          body: {
            tenantUserId: form.tenantUserId,
            tenantBusinessId: form.tenantBusinessId,
          },
        });
        toast.success("Mapping created");
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
      await api(`/tenant/mapped-business/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Mapping deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onRestore(row: MappingRow) {
    setRestoringId(row.id);
    try {
      await api(`/tenant/mapped-business/${row.id}/restore`, { method: "PATCH" });
      toast.success("Mapping restored");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  const columns: Column<MappingRow>[] = [
    {
      header: "Tenant User",
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium">{row.tenantUser.fName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.tenantUser.username} · {row.tenantUser.email}
          </p>
        </div>
      ),
    },
    { header: "Business", cell: (row) => row.tenantBusiness.name },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<MappingRow>
        title="Tenant Mapped Business"
        description="Assign each tenant user to a single business."
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
            <Combobox
              className="w-40"
              options={
                tenantUserOptions
                  ? [
                      { value: "ALL", label: "All tenant users" },
                      ...tenantUserOptions.map((u) => ({ value: u.id, label: u.fName })),
                    ]
                  : null
              }
              value={tenantUserFilter || "ALL"}
              onValueChange={(v) => {
                setTenantUserFilter(v === "ALL" ? "" : v);
                list.setPage(1);
              }}
              onOpenChange={(open) => open && ensureTenantUserOptions()}
              placeholder="Tenant user"
              searchPlaceholder="Search tenant users..."
              emptyText="No tenant users found."
            />
            <Combobox
              className="w-40"
              options={
                tenantBusinessOptions
                  ? [
                      { value: "ALL", label: "All businesses" },
                      ...tenantBusinessOptions.map((b) => ({ value: b.id, label: b.name })),
                    ]
                  : null
              }
              value={tenantBusinessFilter || "ALL"}
              onValueChange={(v) => {
                setTenantBusinessFilter(v === "ALL" ? "" : v);
                list.setPage(1);
              }}
              onOpenChange={(open) => open && ensureTenantBusinessOptions()}
              placeholder="Business"
              searchPlaceholder="Search businesses..."
              emptyText="No businesses found."
            />
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
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Mapping
              </Button>
            )}
          </>
        }
        renderActions={
          canView || canUpdate || canDelete || canRestore
            ? (row) => (
                <RowActionsMenu
                  actions={[
                    ...(canView ? [{ label: "View", icon: Eye, onClick: () => setViewTarget(row) }] : []),
                    ...(row.status === "DELETED"
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
                        ]),
                  ]}
                />
              )
            : undefined
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Mapping" : "Add Mapping"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Change which tenant user/business this mapping points to, or its status."
                  : "Assign one tenant user to one business. A tenant user can only be mapped to a single business."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Tenant user</Label>
                <Combobox
                  options={
                    tenantUserOptions?.map((u) => ({
                      value: u.id,
                      label: `${u.fName} (${u.username})`,
                    })) ?? null
                  }
                  value={form.tenantUserId}
                  onValueChange={(v) => setForm((f) => ({ ...f, tenantUserId: v }))}
                  onOpenChange={(open) => open && ensureTenantUserOptions()}
                  placeholder="Select a tenant user"
                  searchPlaceholder="Search tenant users..."
                  emptyText="No tenant users found."
                />
              </div>

              <div className="grid gap-2">
                <Label>Tenant business</Label>
                <Combobox
                  options={tenantBusinessOptions?.map((b) => ({ value: b.id, label: b.name })) ?? null}
                  value={form.tenantBusinessId}
                  onValueChange={(v) => setForm((f) => ({ ...f, tenantBusinessId: v }))}
                  onOpenChange={(open) => open && ensureTenantBusinessOptions()}
                  placeholder="Select a business"
                  searchPlaceholder="Search businesses..."
                  emptyText="No businesses found."
                />
              </div>

              {editing && (
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, status: v as MappingFormValues["status"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="BLOCKED">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || !form.tenantUserId || !form.tenantBusinessId}
              >
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mapping details</DialogTitle>
            <DialogDescription>{viewTarget?.systemCode}</DialogDescription>
          </DialogHeader>

          {viewTarget && (
            <div className="grid gap-4 py-2">
              <div className="flex items-center gap-1.5">
                <StatusBadgeText status={viewTarget.status} />
              </div>

              <div className="grid gap-3 rounded-md border p-4">
                <p className="text-xs font-medium text-muted-foreground">Tenant User</p>
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  <DetailField label="Name" value={viewTarget.tenantUser.fName} />
                  <DetailField label="Username" value={viewTarget.tenantUser.username} />
                  <DetailField label="Email" value={viewTarget.tenantUser.email} />
                </div>
              </div>

              <div className="grid gap-3 rounded-md border p-4">
                <p className="text-xs font-medium text-muted-foreground">Tenant Business</p>
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  <DetailField label="Name" value={viewTarget.tenantBusiness.name} />
                  <DetailField label="Email" value={viewTarget.tenantBusiness.email} />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewTarget(null)}>
              Close
            </Button>
            {canUpdate && viewTarget && (
              <Button
                type="button"
                onClick={() => {
                  const row = viewTarget;
                  setViewTarget(null);
                  openEdit(row);
                }}
              >
                <Pencil className="size-4" /> Edit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete mapping"
        description={`This will soft-delete the mapping to "${deleteTarget?.tenantBusiness.name}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value || "—"}</p>
    </div>
  );
}
