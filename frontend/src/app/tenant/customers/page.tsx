"use client";

import * as React from "react";
import {
  Download,
  Eye,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  ShieldQuestion,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { UPLOADS_ORIGIN, type ListResponse } from "@/lib/api";
import {
  TenantApiError,
  getTenantAccessToken,
  tenantApi,
  uploadTenantFile,
} from "@/lib/tenant-api";
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY } from "@/lib/countries";
import { ID_PROOF_TYPES } from "@/lib/id-proof-types";

type CustomerStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";
type Gender = "MALE" | "FEMALE" | "TRANSGENDER" | "NOT_TO_SAY" | "NONE";
type CustomerType = "INDIVIDUAL" | "BUSINESS";

const GENDER_LABELS: Record<Gender, string> = {
  MALE: "Male",
  FEMALE: "Female",
  TRANSGENDER: "Transgender",
  NOT_TO_SAY: "Prefer not to say",
  NONE: "Not specified",
};

interface TenantCustomerRow {
  id: string;
  systemCode: string;
  tenantBusinessId: string;
  customerCode: string;
  fName: string;
  lName: string | null;
  fatherName: string | null;
  gender: Gender;
  dateOfBirth: string | null;
  primaryMobile: string;
  secondaryMobile: string | null;
  email: string | null;
  customerType: CustomerType;
  tenantPlaceId: string | null;
  tenantStreetId: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  customerPicture: string | null;
  idProofType: string | null;
  idProofNumber: string | null;
  idProofFile: string | null;
  taxType: string | null;
  taxNumber: string | null;
  notifyViaSMS: boolean;
  notifyViaWhatsApp: boolean;
  notifyViaRCS: boolean;
  allowPortalAccess: boolean;
  remark: string | null;
  status: CustomerStatus;
  tenantBusiness?: { id: string; systemCode: string; name: string };
  tenantPlace?: { id: string; systemCode: string; placeName: string };
  tenantStreet?: { id: string; systemCode: string; streetName: string };
}

interface BusinessOption {
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

interface StreetOption {
  id: string;
  streetName: string;
  latitude: number | null;
  longitude: number | null;
}

interface CustomerFormValues {
  tenantBusinessId: string;
  customerCode: string;
  fName: string;
  lName: string;
  fatherName: string;
  gender: Gender;
  dateOfBirth: string;
  primaryMobile: string;
  secondaryMobile: string;
  email: string;
  customerType: CustomerType;
  tenantPlaceId: string;
  tenantStreetId: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  latitude: string;
  longitude: string;
  customerPicture: string;
  idProofType: string;
  idProofNumber: string;
  idProofFile: string;
  taxType: string;
  taxNumber: string;
  notifyViaSMS: boolean;
  notifyViaWhatsApp: boolean;
  notifyViaRCS: boolean;
  allowPortalAccess: boolean;
  remark: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: CustomerFormValues = {
  tenantBusinessId: "",
  customerCode: "",
  fName: "",
  lName: "",
  fatherName: "",
  gender: "NONE",
  dateOfBirth: "",
  primaryMobile: "",
  secondaryMobile: "",
  email: "",
  customerType: "INDIVIDUAL",
  tenantPlaceId: "",
  tenantStreetId: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: DEFAULT_COUNTRY,
  pincode: "",
  latitude: "",
  longitude: "",
  customerPicture: "",
  idProofType: "",
  idProofNumber: "",
  idProofFile: "",
  taxType: "",
  taxNumber: "",
  notifyViaSMS: true,
  notifyViaWhatsApp: true,
  notifyViaRCS: false,
  allowPortalAccess: true,
  remark: "",
  status: "ACTIVE",
};

export default function TenantCustomersPage() {
  const { hasPermission } = useTenantSession();

  const canCreate = hasPermission("tenant-customers:create");
  const canView = hasPermission("tenant-customers:view");
  const canUpdate = hasPermission("tenant-customers:update");
  const canDelete = hasPermission("tenant-customers:delete");
  const canRestore = hasPermission("tenant-customers:restore");
  const canViewDeleted = hasPermission("tenant-customers:view_deleted");
  const canExport = hasPermission("tenant-customers:export");
  const canImport = hasPermission("tenant-customers:import");
  const canChangeStatus = hasPermission("tenant-customers:change_status");

  const [viewingDeleted, setViewingDeleted] = React.useState(false);

  const list = useResourceList<TenantCustomerRow>(
    viewingDeleted ? "/tenant/customers/deleted" : "/tenant/customers",
    {},
    tenantApi,
  );

  const [businessOptions, setBusinessOptions] = React.useState<BusinessOption[] | null>(null);
  const [placeOptions, setPlaceOptions] = React.useState<PlaceOption[] | null>(null);
  const [streetOptions, setStreetOptions] = React.useState<StreetOption[] | null>(null);
  const [taxTypeOptions, setTaxTypeOptions] = React.useState<string[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantCustomerRow | null>(null);
  const [form, setForm] = React.useState<CustomerFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [mapPickerOpen, setMapPickerOpen] = React.useState(false);
  const [uploadingPicture, setUploadingPicture] = React.useState(false);
  const [uploadingIdProof, setUploadingIdProof] = React.useState(false);
  const pictureInputRef = React.useRef<HTMLInputElement>(null);
  const idProofInputRef = React.useRef<HTMLInputElement>(null);

  const [viewTarget, setViewTarget] = React.useState<TenantCustomerRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TenantCustomerRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  const [statusTarget, setStatusTarget] = React.useState<TenantCustomerRow | null>(null);
  const [newStatus, setNewStatus] = React.useState<"ACTIVE" | "INACTIVE" | "BLOCKED">("ACTIVE");
  const [changingStatus, setChangingStatus] = React.useState(false);

  const [exporting, setExporting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [importResult, setImportResult] = React.useState<{
    created: number;
    skipped: number;
    errors: Array<{ row: number; error: string }>;
  } | null>(null);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  function loadBusinessOptions(): Promise<BusinessOption[]> {
    if (businessOptions) return Promise.resolve(businessOptions);
    return tenantApi<BusinessOption[]>("/tenant/customers/businesses")
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
    tenantApi<PlaceOption[]>(`/tenant/customers/places?tenantBusinessId=${tenantBusinessId}`)
      .then((data) => setPlaceOptions(data))
      .catch(() => toast.error("Failed to load place list"));
  }

  function loadStreetOptions(tenantBusinessId: string, tenantPlaceId: string) {
    if (!tenantBusinessId || !tenantPlaceId) {
      setStreetOptions([]);
      return;
    }
    tenantApi<StreetOption[]>(
      `/tenant/customers/streets?tenantBusinessId=${tenantBusinessId}&tenantPlaceId=${tenantPlaceId}`,
    )
      .then((data) => setStreetOptions(data))
      .catch(() => toast.error("Failed to load street list"));
  }

  function loadTaxTypeOptions(tenantBusinessId: string) {
    if (!tenantBusinessId) {
      setTaxTypeOptions([]);
      return;
    }
    tenantApi<ListResponse<{ taxName: string }>>(
      `/tenant/tax-types?tenantBusinessId=${tenantBusinessId}&status=ACTIVE&limit=100&page=1`,
    )
      .then((data) => setTaxTypeOptions(data.items.map((t) => t.taxName)))
      .catch(() => toast.error("Failed to load tax type list"));
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPlaceOptions(null);
    setStreetOptions(null);
    setTaxTypeOptions(null);
    setMapPickerOpen(false);
    setFormOpen(true);
    loadBusinessOptions().then((options) => {
      if (options.length === 1) {
        setForm((f) => ({ ...f, tenantBusinessId: options[0].id }));
        loadPlaceOptions(options[0].id);
        loadTaxTypeOptions(options[0].id);
      }
    });
  }

  function openEdit(row: TenantCustomerRow) {
    loadBusinessOptions();
    setEditing(row);
    setForm({
      tenantBusinessId: row.tenantBusinessId,
      customerCode: row.customerCode,
      fName: row.fName,
      lName: row.lName ?? "",
      fatherName: row.fatherName ?? "",
      gender: row.gender,
      dateOfBirth: row.dateOfBirth ?? "",
      primaryMobile: row.primaryMobile,
      secondaryMobile: row.secondaryMobile ?? "",
      email: row.email ?? "",
      customerType: row.customerType,
      tenantPlaceId: row.tenantPlaceId ?? "",
      tenantStreetId: row.tenantStreetId ?? "",
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2 ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      country: row.country ?? "",
      pincode: row.pincode ?? "",
      latitude: row.latitude != null ? String(row.latitude) : "",
      longitude: row.longitude != null ? String(row.longitude) : "",
      customerPicture: row.customerPicture ?? "",
      idProofType: row.idProofType ?? "",
      idProofNumber: row.idProofNumber ?? "",
      idProofFile: row.idProofFile ?? "",
      taxType: row.taxType ?? "",
      taxNumber: row.taxNumber ?? "",
      notifyViaSMS: row.notifyViaSMS,
      notifyViaWhatsApp: row.notifyViaWhatsApp,
      notifyViaRCS: row.notifyViaRCS,
      allowPortalAccess: row.allowPortalAccess,
      remark: row.remark ?? "",
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    loadPlaceOptions(row.tenantBusinessId);
    if (row.tenantPlaceId) loadStreetOptions(row.tenantBusinessId, row.tenantPlaceId);
    loadTaxTypeOptions(row.tenantBusinessId);
    setMapPickerOpen(false);
    setFormOpen(true);
  }

  function onBusinessChange(tenantBusinessId: string) {
    setForm((f) => ({ ...f, tenantBusinessId, tenantPlaceId: "", tenantStreetId: "" }));
    loadPlaceOptions(tenantBusinessId);
    loadTaxTypeOptions(tenantBusinessId);
    setStreetOptions([]);
  }

  function onPlaceChange(tenantPlaceId: string) {
    setForm((f) => ({ ...f, tenantPlaceId, tenantStreetId: "" }));
    loadStreetOptions(form.tenantBusinessId, tenantPlaceId);
  }

  async function onPictureSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPicture(true);
    try {
      const { path } = await uploadTenantFile(file);
      setForm((f) => ({ ...f, customerPicture: path }));
      toast.success("Picture uploaded");
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Upload failed");
    } finally {
      setUploadingPicture(false);
    }
  }

  async function onIdProofSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingIdProof(true);
    try {
      const { path } = await uploadTenantFile(file);
      setForm((f) => ({ ...f, idProofFile: path }));
      toast.success("ID proof uploaded");
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Upload failed");
    } finally {
      setUploadingIdProof(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        tenantBusinessId: form.tenantBusinessId,
        customerCode: form.customerCode,
        fName: form.fName,
        lName: form.lName || undefined,
        fatherName: form.fatherName || undefined,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth || undefined,
        primaryMobile: form.primaryMobile,
        secondaryMobile: form.secondaryMobile || undefined,
        email: form.email || undefined,
        customerType: form.customerType,
        tenantPlaceId: form.tenantPlaceId || undefined,
        tenantStreetId: form.tenantStreetId || undefined,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2 || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        country: form.country || undefined,
        pincode: form.pincode || undefined,
        latitude: form.latitude === "" ? undefined : Number(form.latitude),
        longitude: form.longitude === "" ? undefined : Number(form.longitude),
        customerPicture: form.customerPicture || undefined,
        idProofType: form.idProofType || undefined,
        idProofNumber: form.idProofNumber || undefined,
        idProofFile: form.idProofFile || undefined,
        taxType: form.taxType || undefined,
        taxNumber: form.taxNumber || undefined,
        notifyViaSMS: form.notifyViaSMS,
        notifyViaWhatsApp: form.notifyViaWhatsApp,
        notifyViaRCS: form.notifyViaRCS,
        allowPortalAccess: form.allowPortalAccess,
        remark: form.remark || undefined,
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await tenantApi(`/tenant/customers/${editing.id}`, { method: "PATCH", body });
        toast.success("Customer updated");
      } else {
        await tenantApi("/tenant/customers", { method: "POST", body });
        toast.success("Customer created");
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
      await tenantApi(`/tenant/customers/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Customer deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onRestore(row: TenantCustomerRow) {
    setRestoringId(row.id);
    try {
      await tenantApi(`/tenant/customers/${row.id}/restore`, { method: "PATCH" });
      toast.success("Customer restored");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  function openStatusChange(row: TenantCustomerRow) {
    setStatusTarget(row);
    setNewStatus(row.status === "DELETED" ? "ACTIVE" : row.status);
  }

  async function onChangeStatus() {
    if (!statusTarget) return;
    setChangingStatus(true);
    try {
      await tenantApi(`/tenant/customers/${statusTarget.id}/status`, {
        method: "PATCH",
        body: { status: newStatus },
      });
      toast.success("Status updated");
      setStatusTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Status update failed");
    } finally {
      setChangingStatus(false);
    }
  }

  async function onExport() {
    setExporting(true);
    try {
      const headers: Record<string, string> = { "x-device-type": "website" };
      const token = getTenantAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
      const res = await fetch(`${apiUrl}/tenant/customers/export`, { headers });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tenant-customers.csv";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function onImportSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const headers: Record<string, string> = { "x-device-type": "website" };
      const token = getTenantAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
      const res = await fetch(`${apiUrl}/tenant/customers/import`, {
        method: "POST",
        headers,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Import failed");
      setImportResult(data);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const columns: Column<TenantCustomerRow>[] = [
    { header: "Code", cell: (row) => <span className="font-mono">{row.customerCode}</span> },
    {
      header: "Name",
      cell: (row) => (
        <span className="font-medium">
          {row.fName} {row.lName ?? ""}
        </span>
      ),
    },
    { header: "Mobile", cell: (row) => row.primaryMobile },
    { header: "Email", cell: (row) => row.email ?? "—" },
    { header: "Type", cell: (row) => row.customerType },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  const selectedPlace = placeOptions?.find((p) => p.id === form.tenantPlaceId) ?? null;
  const selectedStreet = streetOptions?.find((s) => s.id === form.tenantStreetId) ?? null;
  const contextLocation =
    selectedStreet && selectedStreet.latitude != null && selectedStreet.longitude != null
      ? { lat: selectedStreet.latitude, lng: selectedStreet.longitude, radiusMeters: 50 }
      : selectedPlace && selectedPlace.latitude != null && selectedPlace.longitude != null
        ? { lat: selectedPlace.latitude, lng: selectedPlace.longitude, radiusMeters: selectedPlace.radiusMeters }
        : null;

  return (
    <>
      <ResourceTable<TenantCustomerRow>
        title="Customers"
        description="Customers belonging to your business."
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
            {canViewDeleted && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setViewingDeleted((v) => !v);
                  list.setPage(1);
                }}
              >
                {viewingDeleted ? "View Active" : "View Deleted"}
              </Button>
            )}
            {canExport && (
              <Button type="button" variant="outline" onClick={onExport} disabled={exporting}>
                {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                Export
              </Button>
            )}
            {canImport && (
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={onImportSelected}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  Import
                </Button>
              </>
            )}
            {canCreate && !viewingDeleted && (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Customer
              </Button>
            )}
          </>
        }
        renderActions={
          canView || canUpdate || canDelete || canRestore || canChangeStatus
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
                          ...(canView ? [{ label: "View", icon: Eye, onClick: () => setViewTarget(row) }] : []),
                          ...(canUpdate ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }] : []),
                          ...(canChangeStatus
                            ? [{ label: "Change Status", icon: ShieldQuestion, onClick: () => openStatusChange(row) }]
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
        <DialogContent className={mapPickerOpen ? "sm:max-w-3xl" : "sm:max-w-2xl"}>
          {mapPickerOpen ? (
            <>
              <DialogHeader>
                <DialogTitle>Select Location</DialogTitle>
                <DialogDescription>Search for an address, click the map, or drag the marker.</DialogDescription>
              </DialogHeader>
              <LocationPickerPanel
                initialLat={form.latitude ? Number(form.latitude) : null}
                initialLng={form.longitude ? Number(form.longitude) : null}
                showRadius={false}
                contextLocation={contextLocation}
                onCancel={() => setMapPickerOpen(false)}
                onConfirm={(lat, lng) => {
                  setForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
                  setMapPickerOpen(false);
                }}
              />
            </>
          ) : (
            <form onSubmit={onSubmit}>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Customer" : "Add Customer"}</DialogTitle>
                <DialogDescription>A customer belonging to one of your businesses.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <section className="grid gap-4">
                  <h4 className="text-sm font-semibold text-muted-foreground">Identity</h4>
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
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="customerCode">Customer Code</Label>
                      <Input
                        id="customerCode"
                        required
                        maxLength={30}
                        value={form.customerCode}
                        onChange={(e) => setForm((f) => ({ ...f, customerCode: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Customer Type</Label>
                      <Select
                        value={form.customerType}
                        onValueChange={(v) => setForm((f) => ({ ...f, customerType: v as CustomerType }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                          <SelectItem value="BUSINESS">Business</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="grid gap-2">
                      <Label htmlFor="fName">First Name</Label>
                      <Input
                        id="fName"
                        required
                        value={form.fName}
                        onChange={(e) => setForm((f) => ({ ...f, fName: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lName">Last Name</Label>
                      <Input
                        id="lName"
                        value={form.lName}
                        onChange={(e) => setForm((f) => ({ ...f, lName: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="fatherName">Father&apos;s Name</Label>
                      <Input
                        id="fatherName"
                        value={form.fatherName}
                        onChange={(e) => setForm((f) => ({ ...f, fatherName: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Gender</Label>
                      <Select
                        value={form.gender}
                        onValueChange={(v) => setForm((f) => ({ ...f, gender: v as Gender }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(GENDER_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="dateOfBirth">Date of Birth</Label>
                      <Input
                        id="dateOfBirth"
                        type="date"
                        value={form.dateOfBirth}
                        onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                      />
                    </div>
                  </div>
                </section>

                <section className="grid gap-4">
                  <h4 className="text-sm font-semibold text-muted-foreground">Contact</h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="primaryMobile">Primary Mobile</Label>
                      <Input
                        id="primaryMobile"
                        required
                        value={form.primaryMobile}
                        onChange={(e) => setForm((f) => ({ ...f, primaryMobile: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="secondaryMobile">Secondary Mobile</Label>
                      <Input
                        id="secondaryMobile"
                        value={form.secondaryMobile}
                        onChange={(e) => setForm((f) => ({ ...f, secondaryMobile: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                </section>

                <section className="grid gap-4">
                  <h4 className="text-sm font-semibold text-muted-foreground">Address &amp; Map</h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Place</Label>
                      <Combobox
                        options={placeOptions?.map((place) => ({ value: place.id, label: place.placeName })) ?? null}
                        value={form.tenantPlaceId}
                        onValueChange={onPlaceChange}
                        placeholder={form.tenantBusinessId ? "Select a place" : "Select a business first"}
                        searchPlaceholder="Search places..."
                        emptyText="No places found."
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Street</Label>
                      <Combobox
                        options={streetOptions?.map((s) => ({ value: s.id, label: s.streetName })) ?? null}
                        value={form.tenantStreetId}
                        onValueChange={(v) => setForm((f) => ({ ...f, tenantStreetId: v }))}
                        placeholder={form.tenantPlaceId ? "Select a street" : "Select a place first"}
                        searchPlaceholder="Search streets..."
                        emptyText="No streets found."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="addressLine1">Address Line 1</Label>
                      <Input
                        id="addressLine1"
                        required
                        value={form.addressLine1}
                        onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="addressLine2">Address Line 2</Label>
                      <Input
                        id="addressLine2"
                        value={form.addressLine2}
                        onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="grid gap-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        value={form.state}
                        onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Country</Label>
                      <Combobox
                        options={COUNTRY_OPTIONS}
                        value={form.country}
                        onValueChange={(v) => setForm((f) => ({ ...f, country: v }))}
                        placeholder="Select a country"
                        searchPlaceholder="Search countries..."
                        emptyText="No countries found."
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pincode">Pincode</Label>
                      <Input
                        id="pincode"
                        value={form.pincode}
                        onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Location</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setMapPickerOpen(true)}>
                      <MapPin className="size-4" /> Pick on Map
                    </Button>
                  </div>
                  {form.latitude && form.longitude && (
                    <p className="text-xs text-muted-foreground">
                      {form.latitude}, {form.longitude}
                    </p>
                  )}
                </section>

                <section className="grid gap-4">
                  <h4 className="text-sm font-semibold text-muted-foreground">Picture &amp; KYC/Tax</h4>
                  <div className="flex items-center gap-4">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                      {form.customerPicture ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${UPLOADS_ORIGIN}/uploads/${form.customerPicture}`}
                          alt="Customer"
                          className="size-full object-cover"
                        />
                      ) : (
                        <UserRound className="size-6 text-muted-foreground" />
                      )}
                    </div>
                    <input
                      ref={pictureInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onPictureSelected}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingPicture}
                      onClick={() => pictureInputRef.current?.click()}
                    >
                      {uploadingPicture ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
                      Upload Picture
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>ID Proof Type</Label>
                      <Select
                        value={form.idProofType}
                        onValueChange={(v) => setForm((f) => ({ ...f, idProofType: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select ID proof type" />
                        </SelectTrigger>
                        <SelectContent>
                          {ID_PROOF_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="idProofNumber">ID Proof Number</Label>
                      <Input
                        id="idProofNumber"
                        value={form.idProofNumber}
                        onChange={(e) => setForm((f) => ({ ...f, idProofNumber: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      ref={idProofInputRef}
                      type="file"
                      className="hidden"
                      onChange={onIdProofSelected}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingIdProof}
                      onClick={() => idProofInputRef.current?.click()}
                    >
                      {uploadingIdProof ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
                      Upload ID Proof File
                    </Button>
                    {form.idProofFile && (
                      <a
                        href={`${UPLOADS_ORIGIN}/uploads/${form.idProofFile}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground underline"
                      >
                        View uploaded file
                      </a>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Tax Type</Label>
                      <Combobox
                        options={taxTypeOptions?.map((t) => ({ value: t, label: t })) ?? null}
                        value={form.taxType}
                        onValueChange={(v) => setForm((f) => ({ ...f, taxType: v }))}
                        placeholder={form.tenantBusinessId ? "Select a tax type" : "Select a business first"}
                        searchPlaceholder="Search tax types..."
                        emptyText="No tax types configured."
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="taxNumber">Tax Number</Label>
                      <Input
                        id="taxNumber"
                        value={form.taxNumber}
                        onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
                      />
                    </div>
                  </div>
                </section>

                <section className="grid gap-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Notifications &amp; Access</h4>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.notifyViaSMS}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, notifyViaSMS: !!c }))}
                      />
                      SMS
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.notifyViaWhatsApp}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, notifyViaWhatsApp: !!c }))}
                      />
                      WhatsApp
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.notifyViaRCS}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, notifyViaRCS: !!c }))}
                      />
                      RCS
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.allowPortalAccess}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, allowPortalAccess: !!c }))}
                      />
                      Portal Access
                    </label>
                  </div>
                </section>

                <section className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="remark">Remark</Label>
                    <Textarea
                      id="remark"
                      value={form.remark}
                      onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                    />
                  </div>
                  {editing && (
                    <div className="grid gap-2">
                      <Label>Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(v) => setForm((f) => ({ ...f, status: v as CustomerFormValues["status"] }))}
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
                </section>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    saving ||
                    !form.tenantBusinessId ||
                    !form.customerCode ||
                    !form.fName ||
                    !form.primaryMobile ||
                    !form.addressLine1
                  }
                >
                  {saving && <LoaderCircle className="size-4 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Customer details</DialogTitle>
            <DialogDescription>{viewTarget?.systemCode}</DialogDescription>
          </DialogHeader>
          {viewTarget && (
            <div className="grid gap-4 py-2">
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold">
                  {viewTarget.fName} {viewTarget.lName ?? ""}
                </p>
                <StatusBadgeText status={viewTarget.status} />
              </div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md border p-4 sm:grid-cols-2">
                <DetailField label="Customer Code" value={viewTarget.customerCode} />
                <DetailField label="Gender" value={GENDER_LABELS[viewTarget.gender]} />
                <DetailField label="Customer Type" value={viewTarget.customerType} />
                <DetailField label="Primary Mobile" value={viewTarget.primaryMobile} />
                <DetailField label="Secondary Mobile" value={viewTarget.secondaryMobile} />
                <DetailField label="Email" value={viewTarget.email} />
                <DetailField label="Place" value={viewTarget.tenantPlace?.placeName} />
                <DetailField label="Street" value={viewTarget.tenantStreet?.streetName} />
                <DetailField label="Address" value={viewTarget.addressLine1} />
                <DetailField label="City" value={viewTarget.city} />
                <DetailField label="State" value={viewTarget.state} />
                <DetailField label="Country" value={viewTarget.country} />
                <DetailField label="Pincode" value={viewTarget.pincode} />
                <DetailField label="ID Proof Type" value={viewTarget.idProofType} />
                <DetailField label="ID Proof Number" value={viewTarget.idProofNumber} />
                <DetailField label="Tax Type" value={viewTarget.taxType} />
                <DetailField label="Tax Number" value={viewTarget.taxNumber} />
                <DetailField label="Remark" value={viewTarget.remark} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewTarget(null)}>
              Close
            </Button>
            {canUpdate && viewTarget && (
              <Button
                type="button"
                onClick={() => {
                  const row = viewTarget;
                  setViewTarget(null);
                  openEdit(row);
                }}
              >
                <Pencil className="size-4" /> Edit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!statusTarget} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Status</DialogTitle>
            <DialogDescription>{statusTarget?.fName}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>Status</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as typeof newStatus)}>
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatusTarget(null)} disabled={changingStatus}>
              Cancel
            </Button>
            <Button type="button" onClick={onChangeStatus} disabled={changingStatus}>
              {changingStatus && <LoaderCircle className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!importResult} onOpenChange={(open) => !open && setImportResult(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import results</DialogTitle>
            <DialogDescription>
              {importResult?.created} created, {importResult?.skipped} skipped
            </DialogDescription>
          </DialogHeader>
          {importResult && importResult.errors.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-md border p-3 text-sm">
              {importResult.errors.map((err) => (
                <p key={err.row} className="text-destructive">
                  Row {err.row}: {err.error}
                </p>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setImportResult(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete customer"
        description={`This will delete "${deleteTarget?.fName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value || "—"}</p>
    </div>
  );
}
