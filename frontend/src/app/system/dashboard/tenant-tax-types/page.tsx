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
import { useResourceList } from "@/hooks/use-resource-list";
import { useSession } from "@/hooks/use-session";
import { api, ApiError, type ListResponse } from "@/lib/api";

type TaxTypeStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";
type CalculationType = "PERCENTAGE" | "FIXED";

interface TenantTaxTypeRow {
  id: string;
  systemCode: string;
  tenantBusinessId: string;
  taxName: string;
  calculationType: CalculationType;
  value: number;
  description: string | null;
  status: TaxTypeStatus;
  tenantBusiness?: { id: string; systemCode: string; name: string };
}

interface TenantBusinessOption {
  id: string;
  name: string;
}

interface TaxTypeFormValues {
  tenantBusinessId: string;
  taxName: string;
  calculationType: CalculationType;
  value: string;
  description: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: TaxTypeFormValues = {
  tenantBusinessId: "",
  taxName: "",
  calculationType: "PERCENTAGE",
  value: "",
  description: "",
  status: "ACTIVE",
};

export default function TenantTaxTypesPage() {
  const { hasPermission } = useSession();

  const canCreate = hasPermission("tenant-tax-types:create");
  const canUpdate = hasPermission("tenant-tax-types:update");
  const canDelete = hasPermission("tenant-tax-types:delete");
  const canRestore = hasPermission("tenant-tax-types:restore");

  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [businessFilter, setBusinessFilter] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState("createdAt");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  const list = useResourceList<TenantTaxTypeRow>("/system/tenant-tax-types", {
    status: statusFilter || undefined,
    tenantBusinessId: businessFilter || undefined,
    sortBy,
    sortOrder,
  });

  const [businessOptions, setBusinessOptions] = React.useState<TenantBusinessOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantTaxTypeRow | null>(null);
  const [form, setForm] = React.useState<TaxTypeFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<TenantTaxTypeRow | null>(null);
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

  function openEdit(row: TenantTaxTypeRow) {
    ensureBusinessOptions();
    setEditing(row);
    setForm({
      tenantBusinessId: row.tenantBusinessId,
      taxName: row.taxName,
      calculationType: row.calculationType,
      value: String(row.value),
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
        taxName: form.taxName,
        calculationType: form.calculationType,
        value: Number(form.value),
        description: form.description || undefined,
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await api(`/system/tenant-tax-types/${editing.id}`, { method: "PATCH", body });
        toast.success("Tax type updated");
      } else {
        await api("/system/tenant-tax-types", { method: "POST", body });
        toast.success("Tax type created");
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
      await api(`/system/tenant-tax-types/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Tax type deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onRestore(row: TenantTaxTypeRow) {
    setRestoringId(row.id);
    try {
      await api(`/system/tenant-tax-types/${row.id}/restore`, { method: "PATCH" });
      toast.success("Tax type restored");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  const columns: Column<TenantTaxTypeRow>[] = [
    { header: "Tax Name", cell: (row) => <span className="font-medium">{row.taxName}</span> },
    { header: "Business", cell: (row) => row.tenantBusiness?.name ?? "—" },
    {
      header: "Type",
      cell: (row) =>
        row.calculationType === "PERCENTAGE" ? (
          <Badge variant="secondary">Percentage</Badge>
        ) : (
          <Badge variant="outline">Fixed</Badge>
        ),
    },
    {
      header: "Value",
      cell: (row) => (row.calculationType === "PERCENTAGE" ? `${row.value}%` : row.value.toFixed(2)),
    },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<TenantTaxTypeRow>
        title="Tax Types"
        description="Manage tax rates for tenant businesses."
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
                <SelectItem value="taxName">Tax Name</SelectItem>
                <SelectItem value="value">Value</SelectItem>
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
                <Plus className="size-4" /> Add Tax Type
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
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Tax Type" : "Add Tax Type"}</DialogTitle>
              <DialogDescription>Tax rate applied to a tenant business&apos;s invoices.</DialogDescription>
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
                <Label htmlFor="taxName">Name</Label>
                <Input
                  id="taxName"
                  required
                  value={form.taxName}
                  onChange={(e) => setForm((f) => ({ ...f, taxName: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Tax Type</Label>
                  <Select
                    value={form.calculationType}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, calculationType: v as CalculationType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                      <SelectItem value="FIXED">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="value">
                    {form.calculationType === "PERCENTAGE" ? "Percent" : "Amount"}
                  </Label>
                  <Input
                    id="value"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  />
                </div>
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
                      setForm((f) => ({ ...f, status: v as TaxTypeFormValues["status"] }))
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
        title="Delete tax type"
        description={`This will soft-delete "${deleteTarget?.taxName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
