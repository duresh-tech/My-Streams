"use client";

import * as React from "react";
import { LoaderCircle, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LocationPickerPanel } from "@/components/location-picker-panel";
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

type PlaceStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";

interface TenantPlaceRow {
  id: string;
  systemCode: string;
  tenantBusinessId: string;
  placeName: string;
  remark: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  status: PlaceStatus;
  tenantBusiness?: { id: string; systemCode: string; name: string };
}

interface BusinessOption {
  id: string;
  name: string;
}

interface PlaceFormValues {
  tenantBusinessId: string;
  placeName: string;
  remark: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: PlaceFormValues = {
  tenantBusinessId: "",
  placeName: "",
  remark: "",
  latitude: "",
  longitude: "",
  radiusMeters: "100",
  status: "ACTIVE",
};

export default function TenantPlacesPage() {
  const { hasPermission } = useTenantSession();

  const canCreate = hasPermission("tenant-places:create");
  const canUpdate = hasPermission("tenant-places:update");
  const canDelete = hasPermission("tenant-places:delete");

  const list = useResourceList<TenantPlaceRow>("/tenant/places", {}, tenantApi);

  const [businessOptions, setBusinessOptions] = React.useState<BusinessOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantPlaceRow | null>(null);
  const [form, setForm] = React.useState<PlaceFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<TenantPlaceRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [mapPickerOpen, setMapPickerOpen] = React.useState(false);

  function loadBusinessOptions(): Promise<BusinessOption[]> {
    if (businessOptions) return Promise.resolve(businessOptions);
    return tenantApi<BusinessOption[]>("/tenant/places/businesses")
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
    setMapPickerOpen(false);
    setFormOpen(true);
    loadBusinessOptions().then((options) => {
      if (options.length === 1) {
        setForm((f) => ({ ...f, tenantBusinessId: options[0].id }));
      }
    });
  }

  function openEdit(row: TenantPlaceRow) {
    loadBusinessOptions();
    setEditing(row);
    setForm({
      tenantBusinessId: row.tenantBusinessId,
      placeName: row.placeName,
      remark: row.remark ?? "",
      latitude: row.latitude != null ? String(row.latitude) : "",
      longitude: row.longitude != null ? String(row.longitude) : "",
      radiusMeters: String(row.radiusMeters),
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    setMapPickerOpen(false);
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        tenantBusinessId: form.tenantBusinessId,
        placeName: form.placeName,
        remark: form.remark || undefined,
        latitude: form.latitude === "" ? undefined : Number(form.latitude),
        longitude: form.longitude === "" ? undefined : Number(form.longitude),
        radiusMeters: form.radiusMeters === "" ? undefined : Number(form.radiusMeters),
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await tenantApi(`/tenant/places/${editing.id}`, { method: "PATCH", body });
        toast.success("Place updated");
      } else {
        await tenantApi("/tenant/places", { method: "POST", body });
        toast.success("Place created");
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
      await tenantApi(`/tenant/places/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Place deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<TenantPlaceRow>[] = [
    { header: "Place Name", cell: (row) => <span className="font-medium">{row.placeName}</span> },
    { header: "Remark", cell: (row) => row.remark ?? "—" },
    {
      header: "Coordinates",
      cell: (row) =>
        row.latitude != null && row.longitude != null ? `${row.latitude}, ${row.longitude}` : "—",
    },
    { header: "Radius (m)", cell: (row) => row.radiusMeters },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<TenantPlaceRow>
        title="Places"
        description="Places associated with your business."
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
              <Plus className="size-4" /> Add Place
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
        <DialogContent className={mapPickerOpen ? "sm:max-w-3xl" : undefined}>
          {mapPickerOpen ? (
            <>
              <DialogHeader>
                <DialogTitle>Select Location</DialogTitle>
                <DialogDescription>
                  Search for an address, click the map, or drag the marker.
                </DialogDescription>
              </DialogHeader>
              <LocationPickerPanel
                initialLat={form.latitude ? Number(form.latitude) : null}
                initialLng={form.longitude ? Number(form.longitude) : null}
                initialRadiusMeters={form.radiusMeters ? Number(form.radiusMeters) : 100}
                onCancel={() => setMapPickerOpen(false)}
                onConfirm={(lat, lng, radiusMeters) => {
                  setForm((f) => ({
                    ...f,
                    latitude: lat.toFixed(6),
                    longitude: lng.toFixed(6),
                    radiusMeters: String(radiusMeters),
                  }));
                  setMapPickerOpen(false);
                }}
              />
            </>
          ) : (
            <form onSubmit={onSubmit}>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Place" : "Add Place"}</DialogTitle>
                <DialogDescription>A place associated with your business.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {(businessOptions?.length ?? 0) > 1 && (
                  <div className="grid gap-2">
                    <Label>Business</Label>
                    <Combobox
                      options={businessOptions?.map((biz) => ({ value: biz.id, label: biz.name })) ?? null}
                      value={form.tenantBusinessId}
                      onValueChange={(v) => setForm((f) => ({ ...f, tenantBusinessId: v }))}
                      onOpenChange={(open) => open && loadBusinessOptions()}
                      placeholder="Select a business"
                      searchPlaceholder="Search businesses..."
                      emptyText="No businesses found."
                    />
                  </div>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="placeName">Place Name</Label>
                  <Input
                    id="placeName"
                    required
                    value={form.placeName}
                    onChange={(e) => setForm((f) => ({ ...f, placeName: e.target.value }))}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="remark">Remark</Label>
                  <Textarea
                    id="remark"
                    value={form.remark}
                    onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Location</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setMapPickerOpen(true)}>
                    <MapPin className="size-4" /> Pick on Map
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={form.latitude}
                      onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={form.longitude}
                      onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="radiusMeters">Radius (m)</Label>
                    <Input
                      id="radiusMeters"
                      type="number"
                      step="1"
                      min={1}
                      value={form.radiusMeters}
                      onChange={(e) => setForm((f) => ({ ...f, radiusMeters: e.target.value }))}
                    />
                  </div>
                </div>

                {editing && (
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, status: v as PlaceFormValues["status"] }))
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
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete place"
        description={`This will delete "${deleteTarget?.placeName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
