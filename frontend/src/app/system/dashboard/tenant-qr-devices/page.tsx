"use client";

import * as React from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  FlaskConical,
  LoaderCircle,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  Trash2,
  Wallet,
} from "lucide-react";
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
import { ResourceTable, StatusBadgeText, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { QrDisplayPreview, type QrDisplayTemplateInfo } from "@/components/qr-display-preview";
import { useResourceList } from "@/hooks/use-resource-list";
import { useSession } from "@/hooks/use-session";
import { api, ApiError, type ListResponse } from "@/lib/api";

type DeviceStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";
type CollectionMode = "MANUAL" | "AUTOMATIC";

interface DeviceRow {
  id: string;
  systemCode: string;
  tenantBusinessId: string;
  tenantPlaceId: string | null;
  tenantCounterId: string | null;
  displayTemplateId: string | null;
  deviceCode: string;
  deviceName: string;
  deviceModel: "BONRIX_DQ12" | "GENERIC";
  collectionMode: CollectionMode;
  upiVpa: string | null;
  lastPushAt: number | null;
  lastTestAt: number | null;
  status: DeviceStatus;
  tenantBusiness?: { id: string; systemCode: string; name: string };
  tenantPlace?: { id: string; systemCode: string; placeName: string } | null;
  tenantCounter?: { id: string; systemCode: string; counterName: string } | null;
  displayTemplate?: QrDisplayTemplateInfo | null;
}

interface OptionRow {
  id: string;
  name?: string;
  placeName?: string;
  counterName?: string;
  templateName?: string;
}

interface DeviceFormValues {
  tenantBusinessId: string;
  tenantPlaceId: string;
  tenantCounterId: string;
  displayTemplateId: string;
  deviceCode: string;
  deviceName: string;
  deviceModel: "BONRIX_DQ12" | "GENERIC";
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: DeviceFormValues = {
  tenantBusinessId: "",
  tenantPlaceId: "",
  tenantCounterId: "",
  displayTemplateId: "",
  deviceCode: "",
  deviceName: "",
  deviceModel: "BONRIX_DQ12",
  status: "ACTIVE",
};

interface PushResult {
  qrDataUrl: string;
  amount: number;
  note?: string;
  isTest: boolean;
}

export default function TenantQrDevicesPage() {
  const { hasPermission } = useSession();

  const canCreate = hasPermission("tenant-qr-devices:create");
  const canUpdate = hasPermission("tenant-qr-devices:update");
  const canDelete = hasPermission("tenant-qr-devices:delete");
  const canRestore = hasPermission("tenant-qr-devices:restore");
  const canManagePayment = hasPermission("tenant-qr-devices:manage_payment_config");
  const canPush = hasPermission("tenant-qr-devices:push");
  const canTest = hasPermission("tenant-qr-devices:test");

  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState("createdAt");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  const list = useResourceList<DeviceRow>("/system/tenant-qr-devices", {
    status: statusFilter || undefined,
    sortBy,
    sortOrder,
  });

  const [businessOptions, setBusinessOptions] = React.useState<OptionRow[] | null>(null);
  const [placeOptions, setPlaceOptions] = React.useState<OptionRow[] | null>(null);
  const [counterOptions, setCounterOptions] = React.useState<OptionRow[] | null>(null);
  const [templateOptions, setTemplateOptions] = React.useState<OptionRow[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DeviceRow | null>(null);
  const [form, setForm] = React.useState<DeviceFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<DeviceRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  const [paymentTarget, setPaymentTarget] = React.useState<DeviceRow | null>(null);
  const [paymentForm, setPaymentForm] = React.useState({ upiVpa: "", collectionMode: "MANUAL" as CollectionMode });
  const [savingPayment, setSavingPayment] = React.useState(false);

  const [pushTarget, setPushTarget] = React.useState<DeviceRow | null>(null);
  const [pushAmount, setPushAmount] = React.useState("");
  const [pushNote, setPushNote] = React.useState("");
  const [pushing, setPushing] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);

  const [previewDevice, setPreviewDevice] = React.useState<DeviceRow | null>(null);
  const [previewResult, setPreviewResult] = React.useState<PushResult | null>(null);

  function ensureBusinessOptions() {
    if (businessOptions) return;
    api<ListResponse<OptionRow>>("/system/tenant-business?limit=100&page=1")
      .then((data) => setBusinessOptions(data.items))
      .catch(() => toast.error("Failed to load business list"));
  }

  function loadPlaceOptions(tenantBusinessId: string) {
    if (!tenantBusinessId) return setPlaceOptions([]);
    api<OptionRow[]>(`/system/tenant-qr-devices/places?tenantBusinessId=${tenantBusinessId}`)
      .then(setPlaceOptions)
      .catch(() => toast.error("Failed to load place list"));
  }

  function loadCounterOptions(tenantBusinessId: string) {
    if (!tenantBusinessId) return setCounterOptions([]);
    api<OptionRow[]>(`/system/tenant-qr-devices/counters?tenantBusinessId=${tenantBusinessId}`)
      .then(setCounterOptions)
      .catch(() => toast.error("Failed to load counter list"));
  }

  function ensureTemplateOptions() {
    if (templateOptions) return;
    api<ListResponse<OptionRow>>("/system/qr-display-templates?limit=100&page=1")
      .then((data) => setTemplateOptions(data.items))
      .catch(() => toast.error("Failed to load template list"));
  }

  function openCreate() {
    ensureBusinessOptions();
    ensureTemplateOptions();
    setEditing(null);
    setForm(EMPTY_FORM);
    setPlaceOptions(null);
    setCounterOptions(null);
    setFormOpen(true);
  }

  function openEdit(row: DeviceRow) {
    ensureBusinessOptions();
    ensureTemplateOptions();
    setEditing(row);
    setForm({
      tenantBusinessId: row.tenantBusinessId,
      tenantPlaceId: row.tenantPlaceId ?? "",
      tenantCounterId: row.tenantCounterId ?? "",
      displayTemplateId: row.displayTemplateId ?? "",
      deviceCode: row.deviceCode,
      deviceName: row.deviceName,
      deviceModel: row.deviceModel,
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    loadPlaceOptions(row.tenantBusinessId);
    loadCounterOptions(row.tenantBusinessId);
    setFormOpen(true);
  }

  function onBusinessChange(tenantBusinessId: string) {
    setForm((f) => ({ ...f, tenantBusinessId, tenantPlaceId: "", tenantCounterId: "" }));
    loadPlaceOptions(tenantBusinessId);
    loadCounterOptions(tenantBusinessId);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        tenantBusinessId: form.tenantBusinessId,
        tenantPlaceId: form.tenantPlaceId || undefined,
        tenantCounterId: form.tenantCounterId || undefined,
        displayTemplateId: form.displayTemplateId || undefined,
        deviceCode: form.deviceCode,
        deviceName: form.deviceName,
        deviceModel: form.deviceModel,
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await api(`/system/tenant-qr-devices/${editing.id}`, { method: "PATCH", body });
        toast.success("Device updated");
      } else {
        await api("/system/tenant-qr-devices", { method: "POST", body });
        toast.success("Device registered");
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
      await api(`/system/tenant-qr-devices/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Device deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onRestore(row: DeviceRow) {
    setRestoringId(row.id);
    try {
      await api(`/system/tenant-qr-devices/${row.id}/restore`, { method: "PATCH" });
      toast.success("Device restored");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  function openPaymentConfig(row: DeviceRow) {
    setPaymentTarget(row);
    setPaymentForm({ upiVpa: row.upiVpa ?? "", collectionMode: row.collectionMode });
  }

  async function onSavePaymentConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentTarget) return;
    setSavingPayment(true);
    try {
      await api(`/system/tenant-qr-devices/${paymentTarget.id}/payment-config`, {
        method: "PATCH",
        body: { upiVpa: paymentForm.upiVpa || undefined, collectionMode: paymentForm.collectionMode },
      });
      toast.success("Payment config updated");
      setPaymentTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Save failed");
    } finally {
      setSavingPayment(false);
    }
  }

  function openPush(row: DeviceRow) {
    setPushTarget(row);
    setPushAmount("");
    setPushNote("");
  }

  async function onSubmitPush(e: React.FormEvent) {
    e.preventDefault();
    if (!pushTarget) return;
    setPushing(true);
    try {
      const result = await api<PushResult>(`/system/tenant-qr-devices/${pushTarget.id}/push`, {
        method: "POST",
        body: { amount: Number(pushAmount), note: pushNote || undefined },
      });
      setPreviewDevice(pushTarget);
      setPreviewResult(result);
      setPushTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Failed to generate QR");
    } finally {
      setPushing(false);
    }
  }

  async function onTest(row: DeviceRow) {
    setTestingId(row.id);
    try {
      const result = await api<PushResult>(`/system/tenant-qr-devices/${row.id}/test`, { method: "POST" });
      setPreviewDevice(row);
      setPreviewResult(result);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Test failed");
    } finally {
      setTestingId(null);
    }
  }

  const columns: Column<DeviceRow>[] = [
    { header: "Code", cell: (row) => <span className="font-mono">{row.deviceCode}</span> },
    { header: "Device Name", cell: (row) => <span className="font-medium">{row.deviceName}</span> },
    { header: "Business", cell: (row) => row.tenantBusiness?.name ?? "—" },
    { header: "Counter", cell: (row) => row.tenantCounter?.counterName ?? row.tenantPlace?.placeName ?? "—" },
    { header: "Mode", cell: (row) => (row.collectionMode === "MANUAL" ? "Manual" : "Automatic") },
    { header: "Last Push", cell: (row) => (row.lastPushAt ? new Date(row.lastPushAt * 1000).toLocaleString() : "—") },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<DeviceRow>
        title="Tenant QR Devices"
        description="Registry of QR display / payment devices across all tenants."
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
            <Select value={statusFilter || "ALL"} onValueChange={(v) => { setStatusFilter(v === "ALL" ? "" : v); list.setPage(1); }}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="BLOCKED">Blocked</SelectItem>
                <SelectItem value="DELETED">Deleted</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => { setSortBy(v); list.setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Sort by" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">Created</SelectItem>
                <SelectItem value="deviceName">Device Name</SelectItem>
                <SelectItem value="deviceCode">Device Code</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" aria-label="Toggle sort order" onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}>
              {sortOrder === "asc" ? <ArrowUpAZ className="size-4" /> : <ArrowDownAZ className="size-4" />}
            </Button>
            {canCreate && <Button onClick={openCreate}><Plus className="size-4" /> Add Device</Button>}
          </>
        }
        renderActions={(row) => (
          <RowActionsMenu
            actions={
              row.status === "DELETED"
                ? canRestore
                  ? [{ label: "Restore", icon: RotateCcw, onClick: () => onRestore(row), loading: restoringId === row.id, disabled: restoringId === row.id }]
                  : []
                : [
                    ...(canUpdate ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }] : []),
                    ...(canManagePayment ? [{ label: "Payment Config", icon: Wallet, onClick: () => openPaymentConfig(row) }] : []),
                    ...(canPush ? [{ label: "Collect Payment", icon: QrCode, onClick: () => openPush(row) }] : []),
                    ...(canTest ? [{ label: "Test", icon: FlaskConical, onClick: () => onTest(row), loading: testingId === row.id, disabled: testingId === row.id }] : []),
                    ...(canDelete ? [{ label: "Delete", icon: Trash2, onClick: () => setDeleteTarget(row), destructive: true }] : []),
                  ]
            }
          />
        )}
      />

      {/* Create / Edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Device" : "Add Device"}</DialogTitle>
              <DialogDescription>Metadata only - payment config is managed separately.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Business</Label>
                <Combobox
                  options={businessOptions?.map((b) => ({ value: b.id, label: b.name ?? "" })) ?? null}
                  value={form.tenantBusinessId}
                  onValueChange={onBusinessChange}
                  onOpenChange={(open) => open && ensureBusinessOptions()}
                  placeholder="Select a business"
                  searchPlaceholder="Search businesses..."
                  emptyText="No businesses found."
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Place (optional)</Label>
                  <Combobox
                    options={placeOptions?.map((p) => ({ value: p.id, label: p.placeName ?? "" })) ?? null}
                    value={form.tenantPlaceId}
                    onValueChange={(v) => setForm((f) => ({ ...f, tenantPlaceId: v }))}
                    placeholder={form.tenantBusinessId ? "Select a place" : "Select a business first"}
                    searchPlaceholder="Search places..."
                    emptyText="No places found."
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Counter (optional)</Label>
                  <Combobox
                    options={counterOptions?.map((c) => ({ value: c.id, label: c.counterName ?? "" })) ?? null}
                    value={form.tenantCounterId}
                    onValueChange={(v) => setForm((f) => ({ ...f, tenantCounterId: v }))}
                    placeholder={form.tenantBusinessId ? "Select a counter" : "Select a business first"}
                    searchPlaceholder="Search counters..."
                    emptyText="No counters found."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="deviceCode">Code</Label>
                  <Input id="deviceCode" required maxLength={30} placeholder="DQ12-01" className="font-mono" value={form.deviceCode} onChange={(e) => setForm((f) => ({ ...f, deviceCode: e.target.value }))} />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="deviceName">Device Name</Label>
                  <Input id="deviceName" required value={form.deviceName} onChange={(e) => setForm((f) => ({ ...f, deviceName: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Model</Label>
                  <Select value={form.deviceModel} onValueChange={(v) => setForm((f) => ({ ...f, deviceModel: v as DeviceFormValues["deviceModel"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BONRIX_DQ12">Bonrix DQ12</SelectItem>
                      <SelectItem value="GENERIC">Generic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Display Template</Label>
                  <Combobox
                    options={templateOptions?.map((t) => ({ value: t.id, label: t.templateName ?? "" })) ?? null}
                    value={form.displayTemplateId}
                    onValueChange={(v) => setForm((f) => ({ ...f, displayTemplateId: v }))}
                    onOpenChange={(open) => open && ensureTemplateOptions()}
                    placeholder="Use system default"
                    searchPlaceholder="Search templates..."
                    emptyText="No templates found."
                  />
                </div>
              </div>

              {editing && (
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as DeviceFormValues["status"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving || !form.tenantBusinessId || !form.deviceCode || !form.deviceName}>
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment config */}
      <Dialog open={!!paymentTarget} onOpenChange={(open) => !open && setPaymentTarget(null)}>
        <DialogContent>
          <form onSubmit={onSavePaymentConfig}>
            <DialogHeader>
              <DialogTitle>Payment Config</DialogTitle>
              <DialogDescription>{paymentTarget?.deviceName}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="upiVpa">UPI ID</Label>
                <Input id="upiVpa" placeholder="business@okhdfcbank" value={paymentForm.upiVpa} onChange={(e) => setPaymentForm((f) => ({ ...f, upiVpa: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Collection Mode</Label>
                <Select value={paymentForm.collectionMode} onValueChange={(v) => setPaymentForm((f) => ({ ...f, collectionMode: v as CollectionMode }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MANUAL">Manual (direct UPI ID)</SelectItem>
                    <SelectItem value="AUTOMATIC" disabled>Automatic - payment gateway (Phase 2, not available yet)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentTarget(null)} disabled={savingPayment}>Cancel</Button>
              <Button type="submit" disabled={savingPayment}>
                {savingPayment && <LoaderCircle className="size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Collect payment (push) - amount entry */}
      <Dialog open={!!pushTarget} onOpenChange={(open) => !open && setPushTarget(null)}>
        <DialogContent>
          <form onSubmit={onSubmitPush}>
            <DialogHeader>
              <DialogTitle>Collect Payment</DialogTitle>
              <DialogDescription>{pushTarget?.deviceName}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="pushAmount">Amount (₹)</Label>
                <Input id="pushAmount" type="number" step="0.01" min="0.01" required value={pushAmount} onChange={(e) => setPushAmount(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pushNote">Note (optional)</Label>
                <Input id="pushNote" maxLength={100} value={pushNote} onChange={(e) => setPushNote(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPushTarget(null)} disabled={pushing}>Cancel</Button>
              <Button type="submit" disabled={pushing || !pushAmount}>
                {pushing && <LoaderCircle className="size-4 animate-spin" />}
                Generate QR
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Preview (push result / test result) */}
      <Dialog open={!!previewResult} onOpenChange={(open) => !open && setPreviewResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{previewResult?.isTest ? "Test Preview" : "Payment QR"}</DialogTitle>
            <DialogDescription>{previewDevice?.deviceName}</DialogDescription>
          </DialogHeader>
          {previewResult && previewDevice && (
            <QrDisplayPreview
              qrDataUrl={previewResult.qrDataUrl}
              amount={previewResult.amount}
              note={previewResult.note}
              isTest={previewResult.isTest}
              deviceName={previewDevice.deviceName}
              template={previewDevice.displayTemplate}
            />
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setPreviewResult(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete device"
        description={`This will soft-delete "${deleteTarget?.deviceName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
