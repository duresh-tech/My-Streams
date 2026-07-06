"use client";

import * as React from "react";
import { LoaderCircle, LogIn, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { setTenantAccessToken, type TenantLoginResponse } from "@/lib/tenant-api";

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
  visibleToTenants: boolean;
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
  const { hasPermission } = useSession();
  const list = useResourceList<TenantUserRow>("/system/tenant-users");

  const canCreate = hasPermission("tenant-users:create");
  const canUpdate = hasPermission("tenant-users:update");
  const canDelete = hasPermission("tenant-users:delete");
  const canLoginAs = hasPermission("tenant-users:login-as");

  const [roleOptions, setRoleOptions] = React.useState<RoleOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantUserRow | null>(null);
  const [form, setForm] = React.useState<TenantUserFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<TenantUserRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [loggingInAsId, setLoggingInAsId] = React.useState<string | null>(null);

  function ensureRoleOptions() {
    if (roleOptions) return;
    api<ListResponse<RoleOption>>("/system/roles?limit=100&page=1")
      .then((data) => setRoleOptions(data.items.filter((r) => r.visibleToTenants)))
      .catch(() => toast.error("Failed to load role list"));
  }

  function openCreate() {
    ensureRoleOptions();
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: TenantUserRow) {
    ensureRoleOptions();
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
        await api(`/system/tenant-users/${editing.id}`, {
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
        toast.success("Tenant user updated");
      } else {
        await api("/system/tenant-users", {
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
        toast.success("Tenant user created");
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
      await api(`/system/tenant-users/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Tenant user deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onLoginAs(row: TenantUserRow) {
    setLoggingInAsId(row.id);
    try {
      const result = await api<TenantLoginResponse>(`/system/tenant-users/${row.id}/login-as`, {
        method: "POST",
      });
      setTenantAccessToken(result.accessToken);
      window.open("/tenant/dashboard", "_blank");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Login as failed");
    } finally {
      setLoggingInAsId(null);
    }
  }

  const columns: Column<TenantUserRow>[] = [
    { header: "Name", cell: (row) => <span className="font-medium">{row.fName}</span> },
    { header: "Username", cell: (row) => row.username },
    { header: "Email", cell: (row) => row.email },
    { header: "Phone", cell: (row) => row.phone ?? "—" },
    { header: "Role", cell: (row) => row.role?.displayName ?? "—" },
    { header: "Code", cell: (row) => <code className="text-xs">{row.systemCode}</code> },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<TenantUserRow>
        title="Tenant Users"
        description="Manage tenant-facing accounts."
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
              <Plus className="size-4" /> Add Tenant User
            </Button>
          ) : undefined
        }
        renderActions={
          canUpdate || canDelete || canLoginAs
            ? (row) => (
                <RowActionsMenu
                  actions={[
                    ...(canLoginAs && row.status === "ACTIVE"
                      ? [
                          {
                            label: "Login as",
                            icon: LogIn,
                            onClick: () => onLoginAs(row),
                            loading: loggingInAsId === row.id,
                            disabled: loggingInAsId === row.id,
                          },
                        ]
                      : []),
                    ...(canUpdate ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }] : []),
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
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Tenant User" : "Add Tenant User"}</DialogTitle>
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
                  <Select
                    value={form.roleId}
                    onValueChange={(v) => setForm((f) => ({ ...f, roleId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions?.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete tenant user"
        description={`This will soft-delete "${deleteTarget?.fName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
