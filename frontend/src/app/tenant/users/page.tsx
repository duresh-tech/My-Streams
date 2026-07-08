"use client";

import * as React from "react";
import { Eye, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
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

interface TenantUserRow {
  id: string;
  systemCode: string;
  fName: string;
  username: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  roleId: string;
  role?: { id: string; roleKey: string; displayName: string };
}

interface RoleOption {
  id: string;
  roleKey: string;
  displayName: string;
}

interface TenantUserFormValues {
  fName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  roleId: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: TenantUserFormValues = {
  fName: "",
  username: "",
  email: "",
  phone: "",
  password: "",
  roleId: "",
  status: "ACTIVE",
};

export default function TenantUsersPage() {
  const { user: currentUser, hasPermission } = useTenantSession();

  const canCreate = hasPermission("tenant-users:create");
  const canView = hasPermission("tenant-users:view");
  const canUpdate = hasPermission("tenant-users:update");
  const canDelete = hasPermission("tenant-users:delete");

  const list = useResourceList<TenantUserRow>("/tenant/users", {}, tenantApi);

  const [roleOptions, setRoleOptions] = React.useState<RoleOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantUserRow | null>(null);
  const [form, setForm] = React.useState<TenantUserFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [viewTarget, setViewTarget] = React.useState<TenantUserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TenantUserRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function loadRoleOptions() {
    if (roleOptions) return;
    tenantApi<RoleOption[]>("/tenant/users/roles")
      .then((data) => setRoleOptions(data))
      .catch(() => toast.error("Failed to load role list"));
  }

  function openCreate() {
    loadRoleOptions();
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: TenantUserRow) {
    loadRoleOptions();
    setEditing(row);
    setForm({
      fName: row.fName,
      username: row.username,
      email: row.email,
      phone: row.phone ?? "",
      password: "",
      roleId: row.roleId,
      status: row.status,
    });
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await tenantApi(`/tenant/users/${editing.id}`, {
          method: "PATCH",
          body: {
            fName: form.fName,
            username: form.username,
            email: form.email,
            phone: form.phone || undefined,
            roleId: form.roleId,
            status: form.status,
            ...(form.password ? { password: form.password } : {}),
          },
        });
        toast.success("Team member updated");
      } else {
        await tenantApi("/tenant/users", {
          method: "POST",
          body: {
            fName: form.fName,
            username: form.username,
            email: form.email,
            phone: form.phone || undefined,
            password: form.password,
            roleId: form.roleId,
          },
        });
        toast.success("Team member created");
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
      await tenantApi(`/tenant/users/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Team member deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<TenantUserRow>[] = [
    { header: "Name", cell: (row) => <span className="font-medium">{row.fName}</span> },
    { header: "Username", cell: (row) => row.username },
    { header: "Email", cell: (row) => row.email },
    { header: "Phone", cell: (row) => row.phone ?? "—" },
    { header: "Role", cell: (row) => row.role?.displayName ?? "—" },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<TenantUserRow>
        title="Users"
        description="Manage the team members who can sign in to your business."
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
              <Plus className="size-4" /> Add User
            </Button>
          ) : undefined
        }
        renderActions={
          canView || canUpdate || canDelete
            ? (row) => (
                <RowActionsMenu
                  actions={[
                    ...(canView ? [{ label: "View", icon: Eye, onClick: () => setViewTarget(row) }] : []),
                    ...(canUpdate ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }] : []),
                    ...(canDelete && row.id !== currentUser?.id
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
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit User" : "Add User"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Leave password blank to keep the current one."
                  : "Password must be 8+ chars with uppercase, lowercase and a digit."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="fName">Full name</Label>
                <Input
                  id="fName"
                  required
                  value={form.fName}
                  onChange={(e) => setForm((f) => ({ ...f, fName: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    required
                    minLength={3}
                    pattern="[a-zA-Z0-9._-]+"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password {editing && "(optional)"}</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
                  required={!editing}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={editing ? "••••••••" : undefined}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Role</Label>
                  <Combobox
                    options={roleOptions?.map((role) => ({ value: role.id, label: role.displayName })) ?? null}
                    value={form.roleId}
                    onValueChange={(v) => setForm((f) => ({ ...f, roleId: v }))}
                    onOpenChange={(open) => open && loadRoleOptions()}
                    placeholder="Select a role"
                    searchPlaceholder="Search roles..."
                    emptyText="No roles found."
                  />
                </div>
                {editing && (
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, status: v as TenantUserFormValues["status"] }))
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
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !form.roleId}>
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
            <DialogTitle>Team member details</DialogTitle>
            <DialogDescription>{viewTarget?.systemCode}</DialogDescription>
          </DialogHeader>

          {viewTarget && (
            <div className="grid gap-4 py-2">
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold">{viewTarget.fName}</p>
                <StatusBadgeText status={viewTarget.status} />
              </div>

              <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md border p-4 sm:grid-cols-2">
                <DetailField label="Username" value={viewTarget.username} />
                <DetailField label="Email" value={viewTarget.email} />
                <DetailField label="Phone" value={viewTarget.phone} />
                <DetailField label="Role" value={viewTarget.role?.displayName} />
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
        title="Delete team member"
        description={`This will soft-delete "${deleteTarget?.fName}".`}
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
