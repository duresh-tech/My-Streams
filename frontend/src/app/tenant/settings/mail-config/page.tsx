"use client";

import * as React from "react";
import { LoaderCircle, Pencil, Plus, Send, Trash2 } from "lucide-react";
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
import { ResourceTable, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useResourceList } from "@/hooks/use-resource-list";
import { useTenantSession } from "@/hooks/use-tenant-session";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";

type MailDriver = "SMTP";
type MailEncryption = "NONE" | "SSL" | "TLS" | "SMTP" | "SMTPS";

interface TenantMailConfigRow {
  id: string;
  systemCode: string;
  tenantBusinessId: string;
  mailDriver: "SMTP";
  mailHost: string | null;
  mailPort: number | null;
  mailUsername: string | null;
  mailEncryption: MailEncryption;
  fromMailAddress: string | null;
  fromMailName: string | null;
  hasPassword: boolean;
  tenantBusiness?: { id: string; systemCode: string; name: string };
}

interface BusinessOption {
  id: string;
  name: string;
}

interface MailConfigFormValues {
  tenantBusinessId: string;
  mailDriver: MailDriver;
  mailHost: string;
  mailPort: string;
  mailUsername: string;
  mailPassword: string;
  mailEncryption: MailEncryption;
  fromMailAddress: string;
  fromMailName: string;
}

const EMPTY_FORM: MailConfigFormValues = {
  tenantBusinessId: "",
  mailDriver: "SMTP",
  mailHost: "",
  mailPort: "",
  mailUsername: "",
  mailPassword: "",
  mailEncryption: "NONE",
  fromMailAddress: "",
  fromMailName: "",
};

export default function TenantMailConfigPage() {
  const { hasPermission } = useTenantSession();

  const canCreate = hasPermission("tenant-mail-config:create");
  const canUpdate = hasPermission("tenant-mail-config:update");
  const canDelete = hasPermission("tenant-mail-config:delete");
  const canTest = hasPermission("tenant-mail-config:test");

  const list = useResourceList<TenantMailConfigRow>("/tenant/mail-config", {}, tenantApi);
  const canAddMore = canCreate && (list.rows?.length ?? 0) === 0;

  const [businessOptions, setBusinessOptions] = React.useState<BusinessOption[] | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TenantMailConfigRow | null>(null);
  const [form, setForm] = React.useState<MailConfigFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<TenantMailConfigRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [testTarget, setTestTarget] = React.useState<TenantMailConfigRow | null>(null);
  const [testEmail, setTestEmail] = React.useState("");
  const [sendingTest, setSendingTest] = React.useState(false);

  function loadBusinessOptions(): Promise<BusinessOption[]> {
    if (businessOptions) return Promise.resolve(businessOptions);
    return tenantApi<BusinessOption[]>("/tenant/mail-config/businesses")
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

  function openEdit(row: TenantMailConfigRow) {
    loadBusinessOptions();
    setEditing(row);
    setForm({
      tenantBusinessId: row.tenantBusinessId,
      mailDriver: row.mailDriver,
      mailHost: row.mailHost ?? "",
      mailPort: row.mailPort != null ? String(row.mailPort) : "",
      mailUsername: row.mailUsername ?? "",
      mailPassword: "",
      mailEncryption: row.mailEncryption,
      fromMailAddress: row.fromMailAddress ?? "",
      fromMailName: row.fromMailName ?? "",
    });
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        tenantBusinessId: form.tenantBusinessId,
        mailDriver: form.mailDriver,
        mailHost: form.mailHost || undefined,
        mailPort: form.mailPort ? Number(form.mailPort) : undefined,
        mailUsername: form.mailUsername || undefined,
        ...(form.mailPassword ? { mailPassword: form.mailPassword } : {}),
        mailEncryption: form.mailEncryption,
        fromMailAddress: form.fromMailAddress || undefined,
        fromMailName: form.fromMailName || undefined,
      };
      if (editing) {
        await tenantApi(`/tenant/mail-config/${editing.id}`, { method: "PATCH", body });
        toast.success("Mail config updated");
      } else {
        await tenantApi("/tenant/mail-config", { method: "POST", body });
        toast.success("Mail config created");
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
      await tenantApi(`/tenant/mail-config/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Mail config deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  function openTest(row: TenantMailConfigRow) {
    setTestTarget(row);
    setTestEmail("");
  }

  async function onSendTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testTarget) return;
    setSendingTest(true);
    try {
      await tenantApi(`/tenant/mail-config/${testTarget.id}/test-email`, {
        method: "POST",
        body: { toEmail: testEmail },
      });
      toast.success(`Test email sent to ${testEmail}`);
      setTestTarget(null);
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  }

  const columns: Column<TenantMailConfigRow>[] = [
    { header: "Driver", cell: (row) => <Badge variant="outline">{row.mailDriver}</Badge> },
    { header: "Host", cell: (row) => row.mailHost ?? "—" },
    { header: "Port", cell: (row) => row.mailPort ?? "—" },
    { header: "Encryption", cell: (row) => <Badge variant="outline">{row.mailEncryption}</Badge> },
    { header: "From Address", cell: (row) => row.fromMailAddress ?? "—" },
    {
      header: "Password",
      cell: (row) =>
        row.hasPassword ? (
          <Badge variant="secondary">Set</Badge>
        ) : (
          <Badge variant="outline">Not set</Badge>
        ),
    },
  ];

  return (
    <>
      <ResourceTable<TenantMailConfigRow>
        title="Mail Config"
        description="SMTP mail configuration used to send email from your business."
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
          canAddMore ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" /> Add Mail Config
            </Button>
          ) : undefined
        }
        renderActions={
          canUpdate || canDelete || canTest
            ? (row) => (
                <RowActionsMenu
                  actions={[
                    ...(canTest
                      ? [{ label: "Send Test Email", icon: Send, onClick: () => openTest(row) }]
                      : []),
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
              <DialogTitle>{editing ? "Edit Mail Config" : "Add Mail Config"}</DialogTitle>
              <DialogDescription>SMTP mail configuration used to send email from your business.</DialogDescription>
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
                <Label>Driver</Label>
                <Select
                  value={form.mailDriver}
                  onValueChange={(v) => setForm((f) => ({ ...f, mailDriver: v as MailDriver }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SMTP">SMTP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="mailHost">Host</Label>
                  <Input
                    id="mailHost"
                    value={form.mailHost}
                    onChange={(e) => setForm((f) => ({ ...f, mailHost: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mailPort">Port</Label>
                  <Input
                    id="mailPort"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.mailPort}
                    onChange={(e) => setForm((f) => ({ ...f, mailPort: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="mailUsername">Username</Label>
                  <Input
                    id="mailUsername"
                    value={form.mailUsername}
                    onChange={(e) => setForm((f) => ({ ...f, mailUsername: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mailPassword">Password {editing && "(optional)"}</Label>
                  <Input
                    id="mailPassword"
                    type="password"
                    value={form.mailPassword}
                    onChange={(e) => setForm((f) => ({ ...f, mailPassword: e.target.value }))}
                    placeholder={editing ? "Leave blank to keep current" : undefined}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Encryption</Label>
                <Select
                  value={form.mailEncryption}
                  onValueChange={(v) => setForm((f) => ({ ...f, mailEncryption: v as MailEncryption }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    <SelectItem value="SSL">SSL</SelectItem>
                    <SelectItem value="TLS">TLS</SelectItem>
                    <SelectItem value="SMTP">SMTP</SelectItem>
                    <SelectItem value="SMTPS">SMTPS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="fromMailAddress">From Address</Label>
                  <Input
                    id="fromMailAddress"
                    type="email"
                    value={form.fromMailAddress}
                    onChange={(e) => setForm((f) => ({ ...f, fromMailAddress: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fromMailName">From Name</Label>
                  <Input
                    id="fromMailName"
                    value={form.fromMailName}
                    onChange={(e) => setForm((f) => ({ ...f, fromMailName: e.target.value }))}
                  />
                </div>
              </div>
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
        title="Delete mail config"
        description="This will soft-delete this mail config."
        loading={deleting}
        onConfirm={onDelete}
      />

      <Dialog open={!!testTarget} onOpenChange={(open) => !open && setTestTarget(null)}>
        <DialogContent>
          <form onSubmit={onSendTest}>
            <DialogHeader>
              <DialogTitle>Send Test Email</DialogTitle>
              <DialogDescription>
                Sends a real test email using this mail config's stored SMTP settings.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="testEmail">Recipient email</Label>
                <Input
                  id="testEmail"
                  type="email"
                  required
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTestTarget(null)} disabled={sendingTest}>
                Cancel
              </Button>
              <Button type="submit" disabled={sendingTest || !testEmail}>
                {sendingTest && <LoaderCircle className="size-4 animate-spin" />}
                Send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
