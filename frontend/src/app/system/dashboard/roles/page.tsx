"use client";

import * as React from "react";
import { LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
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
import { ResourceTable, StatusBadgeText, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useResourceList } from "@/hooks/use-resource-list";
import { useSession } from "@/hooks/use-session";
import { api, ApiError, type ListResponse } from "@/lib/api";

interface RoleRow {
  id: string;
  systemCode: string;
  roleKey: string;
  displayName: string;
  isSystem: boolean;
  visibleToTenants: boolean;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  _count?: { systemUsers: number; rolePermissions: number };
}

interface RoleDetail extends RoleRow {
  permissions: { id: string }[];
}

interface PermissionOption {
  id: string;
  displayName: string;
  moduleName: string;
  permissionKey: string;
}

interface RoleFormValues {
  roleKey: string;
  displayName: string;
  visibleToTenants: boolean;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  permissionIds: string[];
}

const EMPTY_FORM: RoleFormValues = {
  roleKey: "",
  displayName: "",
  visibleToTenants: false,
  status: "ACTIVE",
  permissionIds: [],
};

function titleCase(input: string) {
  return input
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface PermissionModuleGroup {
  moduleName: string;
  label: string;
  permissions: PermissionOption[];
}

export default function RolesPage() {
  const { hasPermission } = useSession();
  const list = useResourceList<RoleRow>("/system/roles");

  const canCreate = hasPermission("roles:create");
  const canUpdate = hasPermission("roles:update");
  const canDelete = hasPermission("roles:delete");
  const canDeleteSystem = hasPermission("roles:delete_system");

  const [permissionOptions, setPermissionOptions] = React.useState<PermissionOption[] | null>(null);
  const [permissionFilter, setPermissionFilter] = React.useState("");

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RoleRow | null>(null);
  const [form, setForm] = React.useState<RoleFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<RoleRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function ensurePermissionOptions() {
    if (permissionOptions) return;
    api<ListResponse<PermissionOption>>("/system/permissions?limit=100&page=1")
      .then((data) => setPermissionOptions(data.items))
      .catch(() => toast.error("Failed to load permission list"));
  }

  function openCreate() {
    ensurePermissionOptions();
    setEditing(null);
    setForm(EMPTY_FORM);
    setPermissionFilter("");
    setFormOpen(true);
  }

  async function openEdit(row: RoleRow) {
    ensurePermissionOptions();
    setEditing(row);
    setPermissionFilter("");
    setFormOpen(true);
    setLoadingDetail(true);
    try {
      const detail = await api<RoleDetail>(`/system/roles/${row.id}`);
      setForm({
        roleKey: detail.roleKey,
        displayName: detail.displayName,
        visibleToTenants: detail.visibleToTenants,
        status: detail.status,
        permissionIds: detail.permissions.map((p) => p.id),
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to load role");
      setFormOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  }

  function togglePermission(id: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      permissionIds: checked
        ? [...f.permissionIds, id]
        : f.permissionIds.filter((p) => p !== id),
    }));
  }

  function toggleGroupPermissions(ids: string[], checked: boolean) {
    setForm((f) => ({
      ...f,
      permissionIds: checked
        ? Array.from(new Set([...f.permissionIds, ...ids]))
        : f.permissionIds.filter((id) => !ids.includes(id)),
    }));
  }

  const permissionGroups = React.useMemo<PermissionModuleGroup[]>(() => {
    if (!permissionOptions) return [];

    const byModule = new Map<string, PermissionOption[]>();
    for (const perm of permissionOptions) {
      if (!byModule.has(perm.moduleName)) byModule.set(perm.moduleName, []);
      byModule.get(perm.moduleName)!.push(perm);
    }

    const groups = Array.from(byModule.entries())
      .map(([moduleName, permissions]) => ({
        moduleName,
        label: titleCase(moduleName),
        permissions: permissions
          .slice()
          .sort((a, b) => a.permissionKey.localeCompare(b.permissionKey)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const filterText = permissionFilter.trim().toLowerCase();
    if (!filterText) return groups;

    return groups
      .map((group) => ({
        ...group,
        permissions: group.label.toLowerCase().includes(filterText)
          ? group.permissions
          : group.permissions.filter((p) => p.permissionKey.toLowerCase().includes(filterText)),
      }))
      .filter((group) => group.permissions.length > 0);
  }, [permissionOptions, permissionFilter]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api(`/system/roles/${editing.id}`, {
          method: "PATCH",
          body: {
            displayName: form.displayName,
            visibleToTenants: form.visibleToTenants,
            status: form.status,
            permissionIds: form.permissionIds,
            ...(editing.isSystem ? {} : { roleKey: form.roleKey }),
          },
        });
        toast.success("Role updated");
      } else {
        await api("/system/roles", {
          method: "POST",
          body: {
            roleKey: form.roleKey,
            displayName: form.displayName,
            visibleToTenants: form.visibleToTenants,
            permissionIds: form.permissionIds,
          },
        });
        toast.success("Role created");
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
      await api(`/system/roles/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Role deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<RoleRow>[] = [
    { header: "Role", cell: (row) => <span className="font-medium">{row.displayName}</span> },
    { header: "Key", cell: (row) => <code className="text-xs">{row.roleKey}</code> },
    {
      header: "Type",
      cell: (row) =>
        row.isSystem ? <Badge variant="secondary">System</Badge> : <Badge variant="outline">Custom</Badge>,
    },
    { header: "Users", cell: (row) => row._count?.systemUsers ?? 0 },
    { header: "Permissions", cell: (row) => row._count?.rolePermissions ?? 0 },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<RoleRow>
        title="Roles"
        description="Role-based access control groups."
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
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" /> Add Role
            </Button>
          ) : undefined
        }
        renderActions={
          canUpdate || canDelete
            ? (row) => (
                <RowActionsMenu
                  actions={[
                    ...(canUpdate ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }] : []),
                    ...(canDelete
                      ? [
                          {
                            label: "Delete",
                            icon: Trash2,
                            onClick: () => setDeleteTarget(row),
                            disabled:
                              (row.isSystem && !canDeleteSystem) ||
                              (row._count?.systemUsers ?? 0) > 0,
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
        <DialogContent className="sm:max-w-3xl">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Role" : "Add Role"}</DialogTitle>
              <DialogDescription>
                {editing?.isSystem
                  ? "System role — role key is locked."
                  : "roleKey must be UPPER_SNAKE_CASE (ex. TENANT_SUPER_ADMIN)."}
              </DialogDescription>
            </DialogHeader>

            {loadingDetail ? (
              <div className="flex justify-center py-10">
                <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="roleKey">Role key</Label>
                    <Input
                      id="roleKey"
                      required
                      disabled={!!editing?.isSystem}
                      value={form.roleKey}
                      onChange={(e) => setForm((f) => ({ ...f, roleKey: e.target.value.toUpperCase() }))}
                      placeholder="TENANT_SUPER_ADMIN"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="displayName">Display name</Label>
                    <Input
                      id="displayName"
                      required
                      value={form.displayName}
                      onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="visibleToTenants"
                    checked={form.visibleToTenants}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, visibleToTenants: v === true }))}
                  />
                  <Label htmlFor="visibleToTenants" className="font-normal">
                    Visible to tenants
                  </Label>
                </div>

                {editing && (
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, status: v as RoleFormValues["status"] }))
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

                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Permissions</Label>
                    <span className="text-xs text-muted-foreground">
                      {form.permissionIds.length} selected
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={permissionFilter}
                      onChange={(e) => setPermissionFilter(e.target.value)}
                      placeholder="Filter by module or action..."
                      className="h-8 pl-8 text-sm"
                    />
                    {permissionFilter && (
                      <button
                        type="button"
                        onClick={() => setPermissionFilter("")}
                        aria-label="Clear filter"
                        className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto rounded-md border">
                    {!permissionOptions ? (
                      <div className="flex justify-center py-6">
                        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : permissionGroups.length === 0 ? (
                      <p className="p-4 text-center text-sm text-muted-foreground">
                        No permissions match &ldquo;{permissionFilter}&rdquo;.
                      </p>
                    ) : (
                      <div className="divide-y">
                        {permissionGroups.map((group) => {
                          const groupIds = group.permissions.map((p) => p.id);
                          const selectedCount = groupIds.filter((id) =>
                            form.permissionIds.includes(id),
                          ).length;
                          const groupChecked: boolean | "indeterminate" =
                            selectedCount === 0
                              ? false
                              : selectedCount === groupIds.length
                                ? true
                                : "indeterminate";

                          return (
                            <div key={group.moduleName} className="p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id={`group-${group.moduleName}`}
                                    checked={groupChecked}
                                    onCheckedChange={(v) =>
                                      toggleGroupPermissions(groupIds, v === true)
                                    }
                                  />
                                  <Label
                                    htmlFor={`group-${group.moduleName}`}
                                    className="text-sm font-medium"
                                  >
                                    {group.label}
                                  </Label>
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {selectedCount}/{groupIds.length}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-6 sm:grid-cols-3">
                                {group.permissions.map((perm) => {
                                  const action = perm.permissionKey.split(":")[1] ?? perm.permissionKey;
                                  return (
                                    <div key={perm.id} className="flex items-center gap-2">
                                      <Checkbox
                                        id={`perm-${perm.id}`}
                                        checked={form.permissionIds.includes(perm.id)}
                                        onCheckedChange={(v) => togglePermission(perm.id, v === true)}
                                      />
                                      <Label
                                        htmlFor={`perm-${perm.id}`}
                                        className="font-normal text-sm cursor-pointer"
                                        title={perm.permissionKey}
                                      >
                                        {titleCase(action)}
                                      </Label>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || loadingDetail}>
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
        title="Delete role"
        description={`This will soft-delete "${deleteTarget?.displayName}". Roles assigned to users cannot be deleted.`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
