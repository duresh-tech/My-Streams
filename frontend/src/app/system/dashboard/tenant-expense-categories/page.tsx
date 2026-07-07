"use client";

import * as React from "react";
import { ArrowDownAZ, ArrowUpAZ, LoaderCircle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useResourceList } from "@/hooks/use-resource-list";
import { useSession } from "@/hooks/use-session";
import { api, ApiError, type ListResponse } from "@/lib/api";

type ExpenseCategoryStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";

interface TenantExpenseCategoryRow {
  id: string;
  systemCode: string;
  tenantBusinessId: string;
  expenseCategorieName: string;
  description: string | null;
  isSystem: boolean;
  status: ExpenseCategoryStatus;
  tenantBusiness?: { id: string; systemCode: string; name: string };
}

interface TenantBusinessOption {
  id: string;
  name: string;
}

interface ExpenseCategoryFormValues {
  tenantBusinessId: string;
  expenseCategorieName: string;
  description: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: ExpenseCategoryFormValues = {
  tenantBusinessId: "",
  expenseCategorieName: "",
  description: "",
  status: "ACTIVE",
};

export default function TenantExpenseCategoriesPage() {
  const { hasPermission } = useSession();

  const canCreate = hasPermission("tenant-expense-categories:create");
  const canUpdate = hasPermission("tenant-expense-categories:update");
  const canDelete = hasPermission("tenant-expense-categories:delete");
  const canRestore = hasPermission("tenant-expense-categories:restore");

  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [businessFilter, setBusinessFilter] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState("createdAt");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  const list = useResourceList<TenantExpenseCategoryRow>("/system/tenant-expense-categories", {
    status: statusFilter || undefined,
    tenantBusinessId: businessFilter || undefined,
    sortBy,
    sortOrder,
  });

  const [businessOptions, setBusinessOptions] = React.useState<TenantBusinessOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantExpenseCategoryRow | null>(null);
  const [form, setForm] = React.useState<ExpenseCategoryFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<TenantExpenseCategoryRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
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

  function openEdit(row: TenantExpenseCategoryRow) {
    ensureBusinessOptions();
    setEditing(row);
    setForm({
      tenantBusinessId: row.tenantBusinessId,
      expenseCategorieName: row.expenseCategorieName,
      description: row.description ?? "",
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
        expenseCategorieName: form.expenseCategorieName,
        description: form.description || undefined,
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await api(`/system/tenant-expense-categories/${editing.id}`, { method: "PATCH", body });
        toast.success("Expense category updated");
      } else {
        await api("/system/tenant-expense-categories", { method: "POST", body });
        toast.success("Expense category created");
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
      await api(`/system/tenant-expense-categories/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Expense category deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onRestore(row: TenantExpenseCategoryRow) {
    setRestoringId(row.id);
    try {
      await api(`/system/tenant-expense-categories/${row.id}/restore`, { method: "PATCH" });
      toast.success("Expense category restored");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  const columns: Column<TenantExpenseCategoryRow>[] = [
    {
      header: "Category Name",
      cell: (row) => <span className="font-medium">{row.expenseCategorieName}</span>,
    },
    { header: "Business", cell: (row) => row.tenantBusiness?.name ?? "—" },
    {
      header: "Type",
      cell: (row) =>
        row.isSystem ? (
          <Badge variant="secondary">System</Badge>
        ) : (
          <Badge variant="outline">Custom</Badge>
        ),
    },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<TenantExpenseCategoryRow>
        title="Expense Categories"
        description="Manage expense categories for tenant businesses."
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
                <SelectItem value="expenseCategorieName">Category Name</SelectItem>
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
                <Plus className="size-4" /> Add Expense Category
              </Button>
            )}
          </>
        }
        renderActions={
          canUpdate || canDelete || canRestore
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
                          ...(canUpdate && !row.isSystem
                            ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }]
                            : []),
                          ...(canDelete && !row.isSystem
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
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Expense Category" : "Add Expense Category"}</DialogTitle>
              <DialogDescription>Expense category for a tenant business.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Business</Label>
                <Select
                  value={form.tenantBusinessId}
                  onValueChange={(v) => setForm((f) => ({ ...f, tenantBusinessId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a business" />
                  </SelectTrigger>
                  <SelectContent>
                    {businessOptions?.map((biz) => (
                      <SelectItem key={biz.id} value={biz.id}>
                        {biz.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="expenseCategorieName">Name</Label>
                <Input
                  id="expenseCategorieName"
                  required
                  value={form.expenseCategorieName}
                  onChange={(e) => setForm((f) => ({ ...f, expenseCategorieName: e.target.value }))}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {editing && (
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, status: v as ExpenseCategoryFormValues["status"] }))
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
              <Button type="submit" disabled={saving || !form.tenantBusinessId}>
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
        title="Delete expense category"
        description={`This will soft-delete "${deleteTarget?.expenseCategorieName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
