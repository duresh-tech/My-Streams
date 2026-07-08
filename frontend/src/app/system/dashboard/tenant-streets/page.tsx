"use client";

import * as React from "react";
import { ArrowDownAZ, ArrowUpAZ, LoaderCircle, MapPin, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { useSession } from "@/hooks/use-session";
import { api, ApiError, type ListResponse } from "@/lib/api";

type StreetStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";

interface TenantStreetRow {
  id: string;
  systemCode: string;
  tenantBusinessId: string;
  tenantPlaceId: string;
  streetName: string;
  latitude: number | null;
  longitude: number | null;
  remark: string | null;
  status: StreetStatus;
  tenantBusiness?: { id: string; systemCode: string; name: string };
  tenantPlace?: { id: string; systemCode: string; placeName: string };
}

interface TenantBusinessOption {
  id: string;
  name: string;
}

interface PlaceOption {
  id: string;
  placeName: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
}

interface StreetFormValues {
  tenantBusinessId: string;
  tenantPlaceId: string;
  streetName: string;
  latitude: string;
  longitude: string;
  remark: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: StreetFormValues = {
  tenantBusinessId: "",
  tenantPlaceId: "",
  streetName: "",
  latitude: "",
  longitude: "",
  remark: "",
  status: "ACTIVE",
};

export default function TenantStreetsPage() {
  const { hasPermission } = useSession();

  const canCreate = hasPermission("tenant-streets:create");
  const canUpdate = hasPermission("tenant-streets:update");
  const canDelete = hasPermission("tenant-streets:delete");
  const canRestore = hasPermission("tenant-streets:restore");

  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [businessFilter, setBusinessFilter] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState("createdAt");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  const list = useResourceList<TenantStreetRow>("/system/tenant-streets", {
    status: statusFilter || undefined,
    tenantBusinessId: businessFilter || undefined,
    sortBy,
    sortOrder,
  });

  const [businessOptions, setBusinessOptions] = React.useState<TenantBusinessOption[] | null>(null);
  const [placeOptions, setPlaceOptions] = React.useState<PlaceOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantStreetRow | null>(null);
  const [form, setForm] = React.useState<StreetFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<TenantStreetRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);
  const [mapPickerOpen, setMapPickerOpen] = React.useState(false);

  function ensureBusinessOptions() {
    if (businessOptions) return;
    api<ListResponse<TenantBusinessOption>>("/system/tenant-business?limit=100&page=1")
      .then((data) => setBusinessOptions(data.items))
      .catch(() => toast.error("Failed to load business list"));
  }

  function loadPlaceOptions(tenantBusinessId: string) {
    if (!tenantBusinessId) {
      setPlaceOptions([]);
      return;
    }
    api<PlaceOption[]>(`/system/tenant-streets/places?tenantBusinessId=${tenantBusinessId}`)
      .then((data) => setPlaceOptions(data))
      .catch(() => toast.error("Failed to load place list"));
  }

  function openCreate() {
    ensureBusinessOptions();
    setEditing(null);
    setForm(EMPTY_FORM);
    setPlaceOptions(null);
    setMapPickerOpen(false);
    setFormOpen(true);
  }

  function openEdit(row: TenantStreetRow) {
    ensureBusinessOptions();
    setEditing(row);
    setForm({
      tenantBusinessId: row.tenantBusinessId,
      tenantPlaceId: row.tenantPlaceId,
      streetName: row.streetName,
      latitude: row.latitude != null ? String(row.latitude) : "",
      longitude: row.longitude != null ? String(row.longitude) : "",
      remark: row.remark ?? "",
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    loadPlaceOptions(row.tenantBusinessId);
    setMapPickerOpen(false);
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
        tenantPlaceId: form.tenantPlaceId,
        streetName: form.streetName,
        latitude: form.latitude === "" ? undefined : Number(form.latitude),
        longitude: form.longitude === "" ? undefined : Number(form.longitude),
        remark: form.remark || undefined,
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await api(`/system/tenant-streets/${editing.id}`, { method: "PATCH", body });
        toast.success("Street updated");
      } else {
        await api("/system/tenant-streets", { method: "POST", body });
        toast.success("Street created");
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
      await api(`/system/tenant-streets/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Street deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onRestore(row: TenantStreetRow) {
    setRestoringId(row.id);
    try {
      await api(`/system/tenant-streets/${row.id}/restore`, { method: "PATCH" });
      toast.success("Street restored");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  const columns: Column<TenantStreetRow>[] = [
    { header: "Street Name", cell: (row) => <span className="font-medium">{row.streetName}</span> },
    { header: "Business", cell: (row) => row.tenantBusiness?.name ?? "—" },
    { header: "Place", cell: (row) => row.tenantPlace?.placeName ?? "—" },
    { header: "Remark", cell: (row) => row.remark ?? "—" },
    {
      header: "Coordinates",
      cell: (row) =>
        row.latitude != null && row.longitude != null ? `${row.latitude}, ${row.longitude}` : "—",
    },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  const selectedPlace = placeOptions?.find((p) => p.id === form.tenantPlaceId) ?? null;
  const placeContext =
    selectedPlace && selectedPlace.latitude != null && selectedPlace.longitude != null
      ? { lat: selectedPlace.latitude, lng: selectedPlace.longitude, radiusMeters: selectedPlace.radiusMeters }
      : null;

  return (
    <>
      <ResourceTable<TenantStreetRow>
        title="Streets"
        description="Manage streets within tenant business places."
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
                <SelectItem value="streetName">Street Name</SelectItem>
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
                <Plus className="size-4" /> Add Street
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
                          ...(canUpdate
                            ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }]
                            : []),
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
                        ]
                  }
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
                showRadius={false}
                contextLocation={placeContext}
                onCancel={() => setMapPickerOpen(false)}
                onConfirm={(lat, lng) => {
                  setForm((f) => ({
                    ...f,
                    latitude: lat.toFixed(6),
                    longitude: lng.toFixed(6),
                  }));
                  setMapPickerOpen(false);
                }}
              />
            </>
          ) : (
            <form onSubmit={onSubmit}>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Street" : "Add Street"}</DialogTitle>
                <DialogDescription>A street within a tenant business place.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Business</Label>
                  <Combobox
                    options={businessOptions?.map((biz) => ({ value: biz.id, label: biz.name })) ?? null}
                    value={form.tenantBusinessId}
                    onValueChange={onBusinessChange}
                    onOpenChange={(open) => open && ensureBusinessOptions()}
                    placeholder="Select a business"
                    searchPlaceholder="Search businesses..."
                    emptyText="No businesses found."
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Place</Label>
                  <Combobox
                    options={placeOptions?.map((place) => ({ value: place.id, label: place.placeName })) ?? null}
                    value={form.tenantPlaceId}
                    onValueChange={(v) => setForm((f) => ({ ...f, tenantPlaceId: v }))}
                    placeholder={form.tenantBusinessId ? "Select a place" : "Select a business first"}
                    searchPlaceholder="Search places..."
                    emptyText="No places found."
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="streetName">Street Name</Label>
                  <Input
                    id="streetName"
                    required
                    value={form.streetName}
                    onChange={(e) => setForm((f) => ({ ...f, streetName: e.target.value }))}
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                </div>

                {editing && (
                  <div className="grid gap-2">
                    <Label>Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, status: v as StreetFormValues["status"] }))
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
                <Button type="submit" disabled={saving || !form.tenantBusinessId || !form.tenantPlaceId}>
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
        title="Delete street"
        description={`This will soft-delete "${deleteTarget?.streetName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
