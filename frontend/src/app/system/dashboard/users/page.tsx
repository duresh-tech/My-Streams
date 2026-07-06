"use client";

import * as React from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
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
import { useResourceList } from "@/hooks/use-resource-list";
import { useSession } from "@/hooks/use-session";
import { api, ApiError, type ListResponse } from "@/lib/api";

interface SystemUserRow {
  id: string;
  systemCode: string;
  fName: string;
  username: string;
  email: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  roleId: string;
  role?: { id: string; roleKey: string; displayName: string };
}

interface RoleOption {
  id: string;
  roleKey: string;
  displayName: string;
}

interface UserFormValues {
  fName: string;
  username: string;
  email: string;
  password: string;
  roleId: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: UserFormValues = {
  fName: "",
  username: "",
  email: "",
  password: "",
  roleId: "",
  status: "ACTIVE",
};

export default function UsersPage() {
  const { user: currentUser, hasPermission } = useSession();
  const list = useResourceList<SystemUserRow>("/system/users");

  const canCreate = hasPermission("system-users:create");
  const canUpdate = hasPermission("system-users:update");
  const canDelete = hasPermission("system-users:delete");

  const [roleOptions, setRoleOptions] = React.useState<RoleOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SystemUserRow | null>(null);
  const [form, setForm] = React.useState<UserFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<SystemUserRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function ensureRoleOptions() {
    if (roleOptions) return;
    api<ListResponse<RoleOption>>("/system/roles?limit=100&page=1")
      .then((data) => setRoleOptions(data.items))
      .catch(() => toast.error("Failed to load role list"));
  }

  function openCreate() {
    ensureRoleOptions();
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: SystemUserRow) {
    ensureRoleOptions();
    setEditing(row);
    setForm({
      fName: row.fName,
      username: row.username,
      email: row.email,
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
        await api(`/system/users/${editing.id}`, {
          method: "PATCH",
          body: {
            fName: form.fName,
            username: form.username,
            email: form.email,
            roleId: form.roleId,
            status: form.status,
            ...(form.password ? { password: form.password } : {}),
          },
        });
        toast.success("User updated");
      } else {
        await api("/system/users", {
          method: "POST",
          body: {
            fName: form.fName,
            username: form.username,
            email: form.email,
            password: form.password,
            roleId: form.roleId,
          },
        });
        toast.success("User created");
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
      await api(`/system/users/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("User deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<SystemUserRow>[] = [
    { header: "Name", cell: (row) => <span className="font-medium">{row.fName}</span> },
    { header: "Username", cell: (row) => row.username },
    { header: "Email", cell: (row) => row.email },
    { header: "Role", cell: (row) => row.role?.displayName ?? "—" },
    { header: "Code", cell: (row) => <code className="text-xs">{row.systemCode}</code> },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<SystemUserRow>
        title="System Users"
        description="Manage system console accounts."
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
          canUpdate || canDelete
            ? (row) => (
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
                      disabled={row.id === currentUser?.id}
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
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit System User" : "Add System User"}</DialogTitle>
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
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-2 gap-4">
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
                        setForm((f) => ({ ...f, status: v as UserFormValues["status"] }))
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
        title="Delete system user"
        description={`This will soft-delete "${deleteTarget?.fName}" and revoke all of their sessions.`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
