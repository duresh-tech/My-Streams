"use client";

import * as React from "react";
import { LoaderCircle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResourceTable, StatusBadgeText, type Column } from "@/components/resource-table";
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
  tenantBusinessIds: string[];
  tenantBusinessId: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: MappingFormValues = {
  tenantUserId: "",
  tenantBusinessIds: [],
  tenantBusinessId: "",
  status: "ACTIVE",
};

export default function TenantMappedBusinessPage() {
  const { hasPermission } = useSession();

  const canCreate = hasPermission("tenant-mapped-business:create");
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
      tenantBusinessIds: [],
      tenantBusinessId: row.tenantBusiness.id,
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    setFormOpen(true);
  }

  function toggleBusiness(id: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      tenantBusinessIds: checked
        ? [...f.tenantBusinessIds, id]
        : f.tenantBusinessIds.filter((b) => b !== id),
    }));
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
        const result = await api<{ created: unknown[]; skipped: string[] }>(
          "/tenant/mapped-business",
          {
            method: "POST",
            body: {
              tenantUserId: form.tenantUserId,
              tenantBusinessIds: form.tenantBusinessIds,
            },
          },
        );
        toast.success(
          `${result.created.length} mapping(s) created${
            result.skipped.length ? `, ${result.skipped.length} already mapped` : ""
          }`,
        );
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
        <span className="font-medium">
          {row.tenantUser.fName} <span className="text-muted-foreground">({row.tenantUser.username})</span>
        </span>
      ),
    },
    { header: "Tenant Business", cell: (row) => row.tenantBusiness.name },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<MappingRow>
        title="Tenant Mapped Business"
        description="Assign tenant users to one or more businesses."
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
              value={tenantUserFilter || "ALL"}
              onValueChange={(v) => {
                ensureTenantUserOptions();
                setTenantUserFilter(v === "ALL" ? "" : v);
                list.setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Tenant user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All tenant users</SelectItem>
                {tenantUserOptions?.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.fName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={tenantBusinessFilter || "ALL"}
              onValueChange={(v) => {
                ensureTenantBusinessOptions();
                setTenantBusinessFilter(v === "ALL" ? "" : v);
                list.setPage(1);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Business" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All businesses</SelectItem>
                {tenantBusinessOptions?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
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
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Mapping
              </Button>
            )}
          </>
        }
        renderActions={
          canUpdate || canDelete || canRestore
            ? (row) =>
                row.status === "DELETED" ? (
                  canRestore && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={restoringId === row.id}
                      onClick={() => onRestore(row)}
                      aria-label="Restore"
                    >
                      {restoringId === row.id ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <RotateCcw className="size-4" />
                      )}
                    </Button>
                  )
                ) : (
                  <>
                    {canUpdate && (
                      <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Edit">
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(row)}
                        aria-label="Delete"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </>
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
                  : "Assign one tenant user to one or more businesses."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Tenant user</Label>
                <Select
                  value={form.tenantUserId}
                  onValueChange={(v) => setForm((f) => ({ ...f, tenantUserId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tenant user" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantUserOptions?.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fName} ({u.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editing ? (
                <div className="grid gap-2">
                  <Label>Tenant business</Label>
                  <Select
                    value={form.tenantBusinessId}
                    onValueChange={(v) => setForm((f) => ({ ...f, tenantBusinessId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a business" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenantBusinessOptions?.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label>Businesses</Label>
                  <div className="max-h-64 overflow-y-auto rounded-md border p-3">
                    {!tenantBusinessOptions ? (
                      <div className="flex justify-center py-6">
                        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {tenantBusinessOptions.map((biz) => (
                          <div key={biz.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`biz-${biz.id}`}
                              checked={form.tenantBusinessIds.includes(biz.id)}
                              onCheckedChange={(v) => toggleBusiness(biz.id, v === true)}
                            />
                            <Label htmlFor={`biz-${biz.id}`} className="font-normal">
                              <span className="text-xs">{biz.name}</span>
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                disabled={
                  saving ||
                  !form.tenantUserId ||
                  (editing ? !form.tenantBusinessId : form.tenantBusinessIds.length === 0)
                }
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
        title="Delete mapping"
        description={`This will soft-delete the mapping to "${deleteTarget?.tenantBusiness.name}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
