"use client";

import * as React from "react";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { ResourceTable, StatusBadgeText, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useResourceList } from "@/hooks/use-resource-list";
import { useTenantSession } from "@/hooks/use-tenant-session";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";

type CounterStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";

interface TenantCounterRow {
  id: string;
  systemCode: string;
  tenantBusinessId: string;
  tenantPlaceId: string | null;
  counterCode: string;
  counterName: string;
  description: string | null;
  status: CounterStatus;
  tenantBusiness?: { id: string; systemCode: string; name: string };
  tenantPlace?: { id: string; systemCode: string; placeName: string } | null;
}

interface BusinessOption {
  id: string;
  name: string;
}

interface PlaceOption {
  id: string;
  placeName: string;
}

interface CounterFormValues {
  tenantBusinessId: string;
  tenantPlaceId: string;
  counterCode: string;
  counterName: string;
  description: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: CounterFormValues = {
  tenantBusinessId: "",
  tenantPlaceId: "",
  counterCode: "",
  counterName: "",
  description: "",
  status: "ACTIVE",
};

export default function TenantCountersSelfPage() {
  const { hasPermission } = useTenantSession();

  const canCreate = hasPermission("tenant-counters:create");
  const canUpdate = hasPermission("tenant-counters:update");
  const canDelete = hasPermission("tenant-counters:delete");

  const list = useResourceList<TenantCounterRow>("/tenant/counters", {}, tenantApi);

  const [businessOptions, setBusinessOptions] = React.useState<BusinessOption[] | null>(null);
  const [placeOptions, setPlaceOptions] = React.useState<PlaceOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantCounterRow | null>(null);
  const [form, setForm] = React.useState<CounterFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<TenantCounterRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function loadBusinessOptions(): Promise<BusinessOption[]> {
    if (businessOptions) return Promise.resolve(businessOptions);
    return tenantApi<BusinessOption[]>("/tenant/counters/businesses")
      .then((data) => {
        setBusinessOptions(data);
        return data;
      })
      .catch(() => {
        toast.error("Failed to load your businesses");
        return [];
      });
  }

  function loadPlaceOptions(tenantBusinessId: string) {
    if (!tenantBusinessId) {
      setPlaceOptions([]);
      return;
    }
    tenantApi<PlaceOption[]>(`/tenant/counters/places?tenantBusinessId=${tenantBusinessId}`)
      .then((data) => setPlaceOptions(data))
      .catch(() => toast.error("Failed to load place list"));
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPlaceOptions(null);
    setFormOpen(true);
    loadBusinessOptions().then((options) => {
      if (options.length === 1) {
        setForm((f) => ({ ...f, tenantBusinessId: options[0].id }));
        loadPlaceOptions(options[0].id);
      }
    });
  }

  function openEdit(row: TenantCounterRow) {
    loadBusinessOptions();
    setEditing(row);
    setForm({
      tenantBusinessId: row.tenantBusinessId,
      tenantPlaceId: row.tenantPlaceId ?? "",
      counterCode: row.counterCode,
      counterName: row.counterName,
      description: row.description ?? "",
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    loadPlaceOptions(row.tenantBusinessId);
    setFormOpen(true);
  }

  function onBusinessChange(tenantBusinessId: string) {
    setForm((f) => ({ ...f, tenantBusinessId, tenantPlaceId: "" }));
    loadPlaceOptions(tenantBusinessId);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        tenantBusinessId: form.tenantBusinessId,
        tenantPlaceId: form.tenantPlaceId || undefined,
        counterCode: form.counterCode,
        counterName: form.counterName,
        description: form.description || undefined,
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await tenantApi(`/tenant/counters/${editing.id}`, { method: "PATCH", body });
        toast.success("Counter updated");
      } else {
        await tenantApi("/tenant/counters", { method: "POST", body });
        toast.success("Counter created");
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
      await tenantApi(`/tenant/counters/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Counter deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<TenantCounterRow>[] = [
    { header: "Code", cell: (row) => <span className="font-mono">{row.counterCode}</span> },
    { header: "Counter Name", cell: (row) => <span className="font-medium">{row.counterName}</span> },
    { header: "Place", cell: (row) => row.tenantPlace?.placeName ?? "—" },
    { header: "Description", cell: (row) => row.description ?? "—" },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<TenantCounterRow>
        title="Counters"
        description="Service counters within your business places."
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
              <Plus className="size-4" /> Add Counter
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
              <DialogTitle>{editing ? "Edit Counter" : "Add Counter"}</DialogTitle>
              <DialogDescription>A service counter within one of your business places.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {(businessOptions?.length ?? 0) > 1 && (
                <div className="grid gap-2">
                  <Label>Business</Label>
                  <Combobox
                    options={businessOptions?.map((biz) => ({ value: biz.id, label: biz.name })) ?? null}
                    value={form.tenantBusinessId}
                    onValueChange={onBusinessChange}
                    onOpenChange={(open) => open && loadBusinessOptions()}
                    placeholder="Select a business"
                    searchPlaceholder="Search businesses..."
                    emptyText="No businesses found."
                  />
                </div>
              )}

              <div className="grid gap-2">
                <Label>Place (optional)</Label>
                <Combobox
                  options={placeOptions?.map((place) => ({ value: place.id, label: place.placeName })) ?? null}
                  value={form.tenantPlaceId}
                  onValueChange={(v) => setForm((f) => ({ ...f, tenantPlaceId: v }))}
                  placeholder={form.tenantBusinessId ? "Select a place" : "Select a business first"}
                  searchPlaceholder="Search places..."
                  emptyText="No places found."
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="counterCode">Code</Label>
                  <Input
                    id="counterCode"
                    required
                    maxLength={30}
                    placeholder="CNT001"
                    className="font-mono"
                    value={form.counterCode}
                    onChange={(e) => setForm((f) => ({ ...f, counterCode: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="counterName">Counter Name</Label>
                  <Input
                    id="counterName"
                    required
                    value={form.counterName}
                    onChange={(e) => setForm((f) => ({ ...f, counterName: e.target.value }))}
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
                      setForm((f) => ({ ...f, status: v as CounterFormValues["status"] }))
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
                disabled={saving || !form.tenantBusinessId || !form.counterCode || !form.counterName}
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
        title="Delete counter"
        description={`This will delete "${deleteTarget?.counterName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
