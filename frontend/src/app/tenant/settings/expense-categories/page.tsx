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
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useResourceList } from "@/hooks/use-resource-list";
import { useTenantSession } from "@/hooks/use-tenant-session";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";

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

interface BusinessOption {
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
  const { hasPermission } = useTenantSession();

  const canCreate = hasPermission("tenant-expense-categories:create");
  const canUpdate = hasPermission("tenant-expense-categories:update");
  const canDelete = hasPermission("tenant-expense-categories:delete");

  const list = useResourceList<TenantExpenseCategoryRow>("/tenant/expense-categories", {}, tenantApi);

  const [businessOptions, setBusinessOptions] = React.useState<BusinessOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantExpenseCategoryRow | null>(null);
  const [form, setForm] = React.useState<ExpenseCategoryFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<TenantExpenseCategoryRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function loadBusinessOptions(): Promise<BusinessOption[]> {
    if (businessOptions) return Promise.resolve(businessOptions);
    return tenantApi<BusinessOption[]>("/tenant/expense-categories/businesses")
      .then((data) => {
        setBusinessOptions(data);
        return data;
      })
      .catch(() => {
        toast.error("Failed to load your businesses");
        return [];
      });
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    loadBusinessOptions().then((options) => {
      if (options.length === 1) {
        setForm((f) => ({ ...f, tenantBusinessId: options[0].id }));
      }
    });
  }

  function openEdit(row: TenantExpenseCategoryRow) {
    loadBusinessOptions();
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
        await tenantApi(`/tenant/expense-categories/${editing.id}`, { method: "PATCH", body });
        toast.success("Expense category updated");
      } else {
        await tenantApi("/tenant/expense-categories", { method: "POST", body });
        toast.success("Expense category created");
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
      await tenantApi(`/tenant/expense-categories/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Expense category deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<TenantExpenseCategoryRow>[] = [
    {
      header: "Category Name",
      cell: (row) => <span className="font-medium">{row.expenseCategorieName}</span>,
    },
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
        description="Expense categories used by your business."
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
              <Plus className="size-4" /> Add Expense Category
            </Button>
          ) : undefined
        }
        renderActions={
          canUpdate || canDelete
            ? (row) => (
                <RowActionsMenu
                  actions={[
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
              <DialogTitle>{editing ? "Edit Expense Category" : "Add Expense Category"}</DialogTitle>
              <DialogDescription>Expense category used by your business.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {(businessOptions?.length ?? 0) > 1 && (
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
              )}

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
        description={`This will delete "${deleteTarget?.expenseCategorieName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
