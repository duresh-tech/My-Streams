"use client";

import * as React from "react";
import { FlaskConical, LoaderCircle, Pencil, Plus, QrCode, Trash2, Unplug, Usb, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { QrDisplayPreview } from "@/components/qr-display-preview";
import { useResourceList } from "@/hooks/use-resource-list";
import { useTenantSession } from "@/hooks/use-tenant-session";
import { isWebSerialSupported, useWebSerialDevice } from "@/hooks/use-web-serial-device";
import { buildAudioCommand, DQ12_AUDIO_CLIP } from "@/lib/bonrix-dq12-commands";
import {
  canvasToRgb565,
  renderCancelScreen,
  renderFailScreen,
  renderQrScreen,
  renderSuccessScreen,
  renderWelcomeScreen,
} from "@/lib/dq12-display-image";
import { fetchDq12Assets, type Dq12Assets } from "@/lib/app-settings";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";

type DeviceStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";
type CollectionMode = "MANUAL" | "AUTOMATIC";

interface DeviceRow {
  id: string;
  systemCode: string;
  tenantBusinessId: string;
  tenantPlaceId: string | null;
  tenantCounterId: string | null;
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
}

interface OptionRow {
  id: string;
  name?: string;
  placeName?: string;
  counterName?: string;
}

interface DeviceFormValues {
  tenantBusinessId: string;
  tenantPlaceId: string;
  tenantCounterId: string;
  deviceCode: string;
  deviceName: string;
  deviceModel: "BONRIX_DQ12" | "GENERIC";
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: DeviceFormValues = {
  tenantBusinessId: "",
  tenantPlaceId: "",
  tenantCounterId: "",
  deviceCode: "",
  deviceName: "",
  deviceModel: "BONRIX_DQ12",
  status: "ACTIVE",
};

const CONNECTED_DEVICE_STORAGE_KEY = "qrDeviceSerial.connectedDeviceId";

interface PushResult {
  qrDataUrl: string;
  upiLink: string;
  amount: number;
  note?: string;
  isTest: boolean;
}

export default function TenantQrDevicesPage() {
  const { hasPermission } = useTenantSession();

  const canCreate = hasPermission("tenant-qr-devices:create");
  const canUpdate = hasPermission("tenant-qr-devices:update");
  const canDelete = hasPermission("tenant-qr-devices:delete");
  const canManagePayment = hasPermission("tenant-qr-devices:manage_payment_config");
  const canPush = hasPermission("tenant-qr-devices:push");
  const canTest = hasPermission("tenant-qr-devices:test");

  const list = useResourceList<DeviceRow>("/tenant/qr-devices", {}, tenantApi);
  // Only one QR device is allowed per account (backend-enforced too) - hide
  // the Add button once one already exists rather than letting the create
  // call fail.
  const canAddMore = canCreate && (list.rows?.length ?? 0) === 0;

  const [businessOptions, setBusinessOptions] = React.useState<OptionRow[] | null>(null);
  const [placeOptions, setPlaceOptions] = React.useState<OptionRow[] | null>(null);
  const [counterOptions, setCounterOptions] = React.useState<OptionRow[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DeviceRow | null>(null);
  const [form, setForm] = React.useState<DeviceFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<DeviceRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

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

  // Web Serial: the backend has no network path to a merchant's counter PC, so
  // hardware connect/write happens here in the browser, one COM port per tab.
  const serial = useWebSerialDevice();
  const [connectedDeviceId, setConnectedDeviceId] = React.useState<string | null>(null);
  const webSerialSupported = isWebSerialSupported();

  // Background art for the DQ12 screens, configured via App Settings
  // (qr_device.dq12.* keys) - null entries fall back to a plain label screen.
  const [dq12Assets, setDq12Assets] = React.useState<Dq12Assets | null>(null);
  React.useEffect(() => {
    fetchDq12Assets()
      .then(setDq12Assets)
      .catch(() => setDq12Assets({ welcome: null, success: null, pending: null, fail: null, cancel: null, qrBackground: null }));
  }, []);

  // A Web Serial permission grant survives page reloads, but the *open port
  // object* does not - the browser closes it on navigation/refresh. Only
  // auto-reopen it if the user has manually connected before (tracked via
  // CONNECTED_DEVICE_STORAGE_KEY, which onDisconnectDevice clears) - a fresh
  // visitor or someone who explicitly disconnected should not get silently
  // reconnected on their next visit.
  React.useEffect(() => {
    if (!webSerialSupported) return;
    const savedDeviceId = localStorage.getItem(CONNECTED_DEVICE_STORAGE_KEY);
    if (!savedDeviceId) return;
    serial.autoConnect().then((reopened) => {
      if (reopened) setConnectedDeviceId(savedDeviceId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onConnectDevice(row: DeviceRow) {
    try {
      await serial.connect();
      setConnectedDeviceId(row.id);
      localStorage.setItem(CONNECTED_DEVICE_STORAGE_KEY, row.id);
      toast.success(`Connected to ${row.deviceName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect to device");
    }
  }

  async function onDisconnectDevice() {
    await serial.disconnect();
    setConnectedDeviceId(null);
    localStorage.removeItem(CONNECTED_DEVICE_STORAGE_KEY);
  }

  /** Pushes a full-screen bitmap (RGB565, ~300KB) then triggers the matching
   * audio clip - matches Bonrix's own reference flow (sendImage, then a short
   * pause, then sendAtCommand). Both the image push and the audio command are
   * fire-and-forget on this device; a clean write is treated as success even
   * with no reply, and the exchange is logged to the backend either way. */
  async function sendSceneToDevice(
    deviceId: string,
    eventType: "PUSH_REQUESTED" | "TEST_TRIGGERED",
    label: string,
    canvas: HTMLCanvasElement,
    audioClip: number,
  ) {
    if (connectedDeviceId !== deviceId) return;
    let success = true;
    let message = `${label} sent`;
    let atCommand = `<image push: ${canvas.width}x${canvas.height} RGB565>`;
    let atResponse = "";
    try {
      const bytes = canvasToRgb565(canvas);
      await serial.sendRawBytes(bytes);
      atCommand = `<image push: ${canvas.width}x${canvas.height} RGB565, ${bytes.length} bytes>`;
      await new Promise((resolve) => setTimeout(resolve, 500)); // let the device finish rendering before the audio cue
      const audioResult = await serial.sendCommand(buildAudioCommand(audioClip));
      atCommand += `\n${audioResult.atCommand}`;
      atResponse = audioResult.atResponse;
    } catch (error) {
      success = false;
      message = error instanceof Error ? error.message : "Hardware write failed";
    }
    try {
      await tenantApi(`/tenant/qr-devices/${deviceId}/log-serial`, {
        method: "POST",
        body: { eventType: success ? eventType : "ERROR", atCommand, atResponse, message },
      });
    } catch {
      // Logging failure shouldn't block the operator - the QR is already shown either way.
    }
    if (success) toast.success(`${label} sent to device`);
    else toast.error(message);
  }

  function loadBusinessOptions(): Promise<OptionRow[]> {
    if (businessOptions) return Promise.resolve(businessOptions);
    return tenantApi<OptionRow[]>("/tenant/qr-devices/businesses")
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
    if (!tenantBusinessId) return setPlaceOptions([]);
    tenantApi<OptionRow[]>(`/tenant/qr-devices/places?tenantBusinessId=${tenantBusinessId}`)
      .then(setPlaceOptions)
      .catch(() => toast.error("Failed to load place list"));
  }

  function loadCounterOptions(tenantBusinessId: string) {
    if (!tenantBusinessId) return setCounterOptions([]);
    tenantApi<OptionRow[]>(`/tenant/qr-devices/counters?tenantBusinessId=${tenantBusinessId}`)
      .then(setCounterOptions)
      .catch(() => toast.error("Failed to load counter list"));
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPlaceOptions(null);
    setCounterOptions(null);
    setFormOpen(true);
    loadBusinessOptions().then((options) => {
      if (options.length === 1) {
        setForm((f) => ({ ...f, tenantBusinessId: options[0].id }));
        loadPlaceOptions(options[0].id);
        loadCounterOptions(options[0].id);
      }
    });
  }

  function openEdit(row: DeviceRow) {
    loadBusinessOptions();
    setEditing(row);
    setForm({
      tenantBusinessId: row.tenantBusinessId,
      tenantPlaceId: row.tenantPlaceId ?? "",
      tenantCounterId: row.tenantCounterId ?? "",
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
        deviceCode: form.deviceCode,
        deviceName: form.deviceName,
        deviceModel: form.deviceModel,
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await tenantApi(`/tenant/qr-devices/${editing.id}`, { method: "PATCH", body });
        toast.success("Device updated");
      } else {
        await tenantApi("/tenant/qr-devices", { method: "POST", body });
        toast.success("Device registered");
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
      await tenantApi(`/tenant/qr-devices/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Device deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
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
      await tenantApi(`/tenant/qr-devices/${paymentTarget.id}/payment-config`, {
        method: "PATCH",
        body: { upiVpa: paymentForm.upiVpa || undefined, collectionMode: paymentForm.collectionMode },
      });
      toast.success("Payment config updated");
      setPaymentTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Save failed");
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
      const result = await tenantApi<PushResult>(`/tenant/qr-devices/${pushTarget.id}/push`, {
        method: "POST",
        body: { amount: Number(pushAmount), note: pushNote || undefined },
      });
      setPreviewDevice(pushTarget);
      setPreviewResult(result);
      const deviceId = pushTarget.id;
      const vpa = pushTarget.upiVpa;
      setPushTarget(null);
      list.refresh();
      if (connectedDeviceId === deviceId) {
        const canvas = await renderQrScreen({
          backgroundUrl: dq12Assets?.qrBackground,
          qrDataUrl: result.qrDataUrl,
          amount: result.amount,
          vpa,
        });
        await sendSceneToDevice(deviceId, "PUSH_REQUESTED", "Payment QR", canvas, DQ12_AUDIO_CLIP.QR_SCAN);
      }
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Failed to generate QR");
    } finally {
      setPushing(false);
    }
  }

  async function onTest(row: DeviceRow) {
    setTestingId(row.id);
    try {
      const result = await tenantApi<PushResult>(`/tenant/qr-devices/${row.id}/test`, { method: "POST" });
      setPreviewDevice(row);
      setPreviewResult(result);
      list.refresh();
      if (connectedDeviceId === row.id) {
        const canvas = await renderWelcomeScreen(dq12Assets?.welcome);
        await sendSceneToDevice(row.id, "TEST_TRIGGERED", "Welcome", canvas, DQ12_AUDIO_CLIP.WELCOME);
      }
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Test failed");
    } finally {
      setTestingId(null);
    }
  }

  const columns: Column<DeviceRow>[] = [
    { header: "Code", cell: (row) => <span className="font-mono">{row.deviceCode}</span> },
    { header: "Device Name", cell: (row) => <span className="font-medium">{row.deviceName}</span> },
    { header: "Counter", cell: (row) => row.tenantCounter?.counterName ?? row.tenantPlace?.placeName ?? "—" },
    { header: "Mode", cell: (row) => (row.collectionMode === "MANUAL" ? "Manual" : "Automatic") },
    { header: "UPI ID", cell: (row) => row.upiVpa ?? "Not configured" },
    {
      header: "Hardware",
      cell: (row) =>
        !webSerialSupported || row.deviceModel !== "BONRIX_DQ12" ? (
          "—"
        ) : connectedDeviceId === row.id ? (
          <Badge variant="default">Connected</Badge>
        ) : (
          <Badge variant="outline">Not connected</Badge>
        ),
    },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      {webSerialSupported && (
        <div
          className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-white ${serial.connected ? "bg-emerald-600" : "bg-red-600"}`}
        >
          <span>{serial.connected ? "DQ12 device connected" : "DQ12 device not connected"}</span>
          {serial.connected && connectedDeviceId && (
            <span className="text-xs font-normal opacity-90">
              {list.rows?.find((r) => r.id === connectedDeviceId)?.deviceName ?? connectedDeviceId}
            </span>
          )}
        </div>
      )}

      <ResourceTable<DeviceRow>
        title="QR Devices"
        description="Payment QR display devices at your counters."
        columns={columns}
        rows={list.rows}
        error={list.error}
        page={list.page}
        totalPages={list.totalPages}
        onPageChange={list.setPage}
        search={list.search}
        onSearchChange={list.setSearch}
        onSearchSubmit={list.applySearch}
        toolbarAction={canAddMore ? <Button onClick={openCreate}><Plus className="size-4" /> Add Device</Button> : undefined}
        renderActions={(row) => (
          <RowActionsMenu
            actions={[
              ...(canUpdate ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }] : []),
              ...(canManagePayment ? [{ label: "Payment Config", icon: Wallet, onClick: () => openPaymentConfig(row) }] : []),
              ...(canPush ? [{ label: "Collect Payment", icon: QrCode, onClick: () => openPush(row) }] : []),
              ...(canTest ? [{ label: "Test", icon: FlaskConical, onClick: () => onTest(row), loading: testingId === row.id, disabled: testingId === row.id }] : []),
              ...(webSerialSupported && row.deviceModel === "BONRIX_DQ12"
                ? connectedDeviceId === row.id
                  ? [{ label: "Disconnect Device", icon: Unplug, onClick: onDisconnectDevice }]
                  : [{ label: "Connect Device", icon: Usb, onClick: () => onConnectDevice(row), loading: serial.connecting, disabled: serial.connecting }]
                : []),
              ...(canDelete ? [{ label: "Delete", icon: Trash2, onClick: () => setDeleteTarget(row), destructive: true }] : []),
            ]}
          />
        )}
      />

      {/* Create / Edit (device metadata/config) */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Device" : "Add Device"}</DialogTitle>
              <DialogDescription>Device config only - the UPI ID is managed separately under Payment Config.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {(businessOptions?.length ?? 0) > 1 && (
                <div className="grid gap-2">
                  <Label>Business</Label>
                  <Combobox
                    options={businessOptions?.map((b) => ({ value: b.id, label: b.name ?? "" })) ?? null}
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

      {/* Payment config - split from general config so it can be gated separately */}
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

      {/* Preview (push result / test result) - what the physical screen would show */}
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
            />
          )}

          {previewResult?.isTest && previewDevice && canTest && (
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">
                {connectedDeviceId === previewDevice.id
                  ? "Send a demo scene to the connected device"
                  : "Connect the device to send a demo scene"}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={connectedDeviceId !== previewDevice.id}
                  onClick={async () => {
                    const canvas = await renderWelcomeScreen(dq12Assets?.welcome);
                    await sendSceneToDevice(previewDevice.id, "TEST_TRIGGERED", "Welcome", canvas, DQ12_AUDIO_CLIP.WELCOME);
                  }}
                >
                  Welcome
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={connectedDeviceId !== previewDevice.id}
                  onClick={async () => {
                    const canvas = await renderSuccessScreen(dq12Assets?.success, previewResult.amount);
                    await sendSceneToDevice(previewDevice.id, "TEST_TRIGGERED", "Payment Success", canvas, DQ12_AUDIO_CLIP.SUCCESS);
                  }}
                >
                  Payment Success
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={connectedDeviceId !== previewDevice.id}
                  onClick={async () => {
                    const canvas = await renderFailScreen(dq12Assets?.fail);
                    await sendSceneToDevice(previewDevice.id, "TEST_TRIGGERED", "Payment Failed", canvas, DQ12_AUDIO_CLIP.FAIL);
                  }}
                >
                  Payment Failed
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={connectedDeviceId !== previewDevice.id}
                  onClick={async () => {
                    const canvas = await renderCancelScreen(dq12Assets?.cancel);
                    await sendSceneToDevice(previewDevice.id, "TEST_TRIGGERED", "Payment Cancelled", canvas, DQ12_AUDIO_CLIP.CANCEL);
                  }}
                >
                  Payment Cancelled
                </Button>
              </div>
            </div>
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
        description={`This will delete "${deleteTarget?.deviceName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
