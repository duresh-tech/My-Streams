"use client";

import * as React from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
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
import { useResourceList } from "@/hooks/use-resource-list";
import { useSession } from "@/hooks/use-session";
import { api, ApiError } from "@/lib/api";

interface PermissionRow {
  id: string;
  systemCode: string;
  displayName: string;
  moduleName: string;
  permissionKey: string;
  description: string | null;
  isSystem: boolean;
  status: "ACTIVE" | "INACTIVE";
}

interface PermissionFormValues {
  displayName: string;
  moduleName: string;
  permissionKey: string;
  description: string;
  status: "ACTIVE" | "INACTIVE";
}

const EMPTY_FORM: PermissionFormValues = {
  displayName: "",
  moduleName: "",
  permissionKey: "",
  description: "",
  status: "ACTIVE",
};

export default function PermissionsPage() {
  const { hasPermission } = useSession();
  const list = useResourceList<PermissionRow>("/system/permissions");

  const canCreate = hasPermission("permissions:create");
  const canUpdate = hasPermission("permissions:update");
  const canDelete = hasPermission("permissions:delete");

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PermissionRow | null>(null);
  const [form, setForm] = React.useState<PermissionFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<PermissionRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: PermissionRow) {
    setEditing(row);
    setForm({
      displayName: row.displayName,
      moduleName: row.moduleName,
      permissionKey: row.permissionKey,
      description: row.description ?? "",
      status: row.status,
    });
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api(`/system/permissions/${editing.id}`, {
          method: "PATCH",
          body: {
            displayName: form.displayName,
            description: form.description || undefined,
            status: form.status,
            ...(editing.isSystem
              ? {}
              : { moduleName: form.moduleName, permissionKey: form.permissionKey }),
          },
        });
        toast.success("Permission updated");
      } else {
        await api("/system/permissions", {
          method: "POST",
          body: {
            displayName: form.displayName,
            moduleName: form.moduleName,
            permissionKey: form.permissionKey,
            description: form.description || undefined,
          },
        });
        toast.success("Permission created");
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
      await api(`/system/permissions/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Permission deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<PermissionRow>[] = [
    { header: "Permission", cell: (row) => <span className="font-medium">{row.displayName}</span> },
    { header: "Key", cell: (row) => <code className="text-xs">{row.permissionKey}</code> },
    { header: "Module", cell: (row) => <Badge variant="outline">{row.moduleName}</Badge> },
    {
      header: "Type",
      cell: (row) =>
        row.isSystem ? <Badge variant="secondary">System</Badge> : <Badge variant="outline">Custom</Badge>,
    },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<PermissionRow>
        title="Permissions"
        description="API endpoint access control by feature."
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
              <Plus className="size-4" /> Add Permission
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
                      disabled={row.isSystem}
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
              <DialogTitle>{editing ? "Edit Permission" : "Add Permission"}</DialogTitle>
              <DialogDescription>
                {editing?.isSystem
                  ? "System permission — key and module are locked."
                  : "permissionKey format: module:action (ex. roles:delete)."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  required
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="Delete Roles"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="moduleName">Module</Label>
                  <Input
                    id="moduleName"
                    required
                    disabled={!!editing?.isSystem}
                    value={form.moduleName}
                    onChange={(e) => setForm((f) => ({ ...f, moduleName: e.target.value }))}
                    placeholder="roles"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="permissionKey">Key</Label>
                  <Input
                    id="permissionKey"
                    required
                    disabled={!!editing?.isSystem}
                    value={form.permissionKey}
                    onChange={(e) => setForm((f) => ({ ...f, permissionKey: e.target.value }))}
                    placeholder="roles:delete"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  maxLength={50}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              {editing && (
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v as "ACTIVE" | "INACTIVE" }))}
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete permission"
        description={`This will soft-delete "${deleteTarget?.displayName}". This action can be reversed only via direct database access.`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
