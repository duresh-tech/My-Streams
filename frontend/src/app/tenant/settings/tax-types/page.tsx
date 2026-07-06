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
import { useTenantSession } from "@/hooks/use-tenant-session";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";

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

interface BusinessOption {
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
  const { hasPermission } = useTenantSession();

  const canCreate = hasPermission("tenant-tax-types:create");
  const canUpdate = hasPermission("tenant-tax-types:update");
  const canDelete = hasPermission("tenant-tax-types:delete");

  const list = useResourceList<TenantTaxTypeRow>("/tenant/tax-types", {}, tenantApi);

  const [businessOptions, setBusinessOptions] = React.useState<BusinessOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantTaxTypeRow | null>(null);
  const [form, setForm] = React.useState<TaxTypeFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<TenantTaxTypeRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function loadBusinessOptions(): Promise<BusinessOption[]> {
    if (businessOptions) return Promise.resolve(businessOptions);
    return tenantApi<BusinessOption[]>("/tenant/tax-types/businesses")
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

  function openEdit(row: TenantTaxTypeRow) {
    loadBusinessOptions();
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
        await tenantApi(`/tenant/tax-types/${editing.id}`, { method: "PATCH", body });
        toast.success("Tax type updated");
      } else {
        await tenantApi("/tenant/tax-types", { method: "POST", body });
        toast.success("Tax type created");
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
      await tenantApi(`/tenant/tax-types/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Tax type deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<TenantTaxTypeRow>[] = [
    { header: "Tax Name", cell: (row) => <span className="font-medium">{row.taxName}</span> },
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
        description="Tax rates applied to your invoices."
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
              <Plus className="size-4" /> Add New Tax
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
              <DialogTitle>{editing ? "Edit Tax" : "Add Tax"}</DialogTitle>
              <DialogDescription>Tax rate applied to your invoices.</DialogDescription>
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
        description={`This will delete "${deleteTarget?.taxName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
