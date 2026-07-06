"use client";

import * as React from "react";
import { ArrowDownAZ, ArrowUpAZ, LoaderCircle, Pencil, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { api, ApiError, uploadFile, UPLOADS_ORIGIN } from "@/lib/api";

type TenantBusinessStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";

interface TenantBusinessRow {
  id: string;
  systemCode: string;
  name: string;
  tagLine: string | null;
  email: string;
  phone: string;
  country: string;
  countryCode: string;
  state: string;
  city: string;
  pincode: string;
  addressLine1: string;
  addressLine2: string | null;
  logoPath: string | null;
  taxNumber: string | null;
  isParentBusiness: boolean;
  status: TenantBusinessStatus;
}

interface TenantBusinessFormValues {
  name: string;
  tagLine: string;
  email: string;
  phone: string;
  country: string;
  countryCode: string;
  state: string;
  city: string;
  pincode: string;
  addressLine1: string;
  addressLine2: string;
  logoPath: string;
  taxNumber: string;
  isParentBusiness: boolean;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: TenantBusinessFormValues = {
  name: "",
  tagLine: "",
  email: "",
  phone: "",
  country: "",
  countryCode: "",
  state: "",
  city: "",
  pincode: "",
  addressLine1: "",
  addressLine2: "",
  logoPath: "",
  taxNumber: "",
  isParentBusiness: false,
  status: "ACTIVE",
};

export default function TenantBusinessPage() {
  const { hasPermission } = useSession();

  const canCreate = hasPermission("tenant-business:create");
  const canUpdate = hasPermission("tenant-business:update");
  const canDelete = hasPermission("tenant-business:delete");
  const canRestore = hasPermission("tenant-business:restore");

  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [countryFilter, setCountryFilter] = React.useState("");
  const [sortBy, setSortBy] = React.useState("createdAt");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  const list = useResourceList<TenantBusinessRow>("/system/tenant-business", {
    status: statusFilter || undefined,
    country: countryFilter || undefined,
    sortBy,
    sortOrder,
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantBusinessRow | null>(null);
  const [form, setForm] = React.useState<TenantBusinessFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<TenantBusinessRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: TenantBusinessRow) {
    setEditing(row);
    setForm({
      name: row.name,
      tagLine: row.tagLine ?? "",
      email: row.email,
      phone: row.phone,
      country: row.country,
      countryCode: row.countryCode,
      state: row.state,
      city: row.city,
      pincode: row.pincode,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2 ?? "",
      logoPath: row.logoPath ?? "",
      taxNumber: row.taxNumber ?? "",
      isParentBusiness: row.isParentBusiness,
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    setFormOpen(true);
  }

  async function onLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingLogo(true);
    try {
      const { path } = await uploadFile(file);
      setForm((f) => ({ ...f, logoPath: path }));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Logo upload failed");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name,
        tagLine: form.tagLine || undefined,
        email: form.email,
        phone: form.phone,
        country: form.country,
        countryCode: form.countryCode,
        state: form.state,
        city: form.city,
        pincode: form.pincode,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2 || undefined,
        logoPath: form.logoPath || undefined,
        taxNumber: form.taxNumber || undefined,
        isParentBusiness: form.isParentBusiness,
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await api(`/system/tenant-business/${editing.id}`, { method: "PATCH", body });
        toast.success("Business updated");
      } else {
        await api("/system/tenant-business", { method: "POST", body });
        toast.success("Business created");
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
      await api(`/system/tenant-business/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Business deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onRestore(row: TenantBusinessRow) {
    setRestoringId(row.id);
    try {
      await api(`/system/tenant-business/${row.id}/restore`, { method: "PATCH" });
      toast.success("Business restored");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  const columns: Column<TenantBusinessRow>[] = [
    { header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
    { header: "Email", cell: (row) => row.email },
    { header: "Location", cell: (row) => `${row.city}, ${row.country}` },
    {
      header: "Type",
      cell: (row) =>
        row.isParentBusiness ? (
          <Badge variant="secondary">Parent</Badge>
        ) : (
          <Badge variant="outline">Child</Badge>
        ),
    },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<TenantBusinessRow>
        title="Tenant Business"
        description="Manage tenant business accounts."
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
            <Input
              value={countryFilter}
              onChange={(e) => {
                setCountryFilter(e.target.value);
                list.setPage(1);
              }}
              placeholder="Country…"
              className="w-32"
            />
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
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="country">Country</SelectItem>
                <SelectItem value="city">City</SelectItem>
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
                <Plus className="size-4" /> Add Business
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
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Business" : "Add Business"}</DialogTitle>
              <DialogDescription>
                Tenant business profile and contact details.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                  {form.logoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${UPLOADS_ORIGIN}/uploads/${form.logoPath}`}
                      alt="Business logo"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Upload className="size-5 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onLogoSelected}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploadingLogo}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {uploadingLogo && <LoaderCircle className="size-4 animate-spin" />}
                  {form.logoPath ? "Change logo" : "Upload logo"}
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="name">Business name</Label>
                  <Input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tagLine">Tag line</Label>
                  <Input
                    id="tagLine"
                    value={form.tagLine}
                    onChange={(e) => setForm((f) => ({ ...f, tagLine: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    required
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    required
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="countryCode">Country code</Label>
                  <Input
                    id="countryCode"
                    required
                    value={form.countryCode}
                    onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    required
                    value={form.state}
                    onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    required
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="pincode">Pincode</Label>
                  <Input
                    id="pincode"
                    required
                    value={form.pincode}
                    onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="taxNumber">Tax number</Label>
                  <Input
                    id="taxNumber"
                    value={form.taxNumber}
                    onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="addressLine1">Address line 1</Label>
                <Input
                  id="addressLine1"
                  required
                  value={form.addressLine1}
                  onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="addressLine2">Address line 2</Label>
                <Input
                  id="addressLine2"
                  value={form.addressLine2}
                  onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="isParentBusiness"
                  checked={form.isParentBusiness}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isParentBusiness: v === true }))}
                />
                <Label htmlFor="isParentBusiness" className="font-normal">
                  Parent business
                </Label>
              </div>

              {editing && (
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, status: v as TenantBusinessFormValues["status"] }))
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
              <Button type="submit" disabled={saving || uploadingLogo}>
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
        title="Delete business"
        description={`This will soft-delete "${deleteTarget?.name}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
