"use client";

import * as React from "react";
import { LoaderCircle, Pencil, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { ResourceTable, StatusBadgeText, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useResourceList } from "@/hooks/use-resource-list";
import { useSession } from "@/hooks/use-session";
import { api, ApiError, UPLOADS_ORIGIN, uploadQrDisplayTemplateAsset } from "@/lib/api";

type TemplateStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";

interface TemplateRow {
  id: string;
  systemCode: string;
  tenantBusinessId: string | null;
  templateName: string;
  backgroundImagePath: string | null;
  logoOverridePath: string | null;
  primaryColor: string | null;
  footerText: string | null;
  isSystemDefault: boolean;
  status: TemplateStatus;
  tenantBusiness?: { id: string; systemCode: string; name: string } | null;
}

interface TemplateFormValues {
  templateName: string;
  backgroundImagePath: string;
  logoOverridePath: string;
  primaryColor: string;
  footerText: string;
  isSystemDefault: boolean;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: TemplateFormValues = {
  templateName: "",
  backgroundImagePath: "",
  logoOverridePath: "",
  primaryColor: "#0f172a",
  footerText: "",
  isSystemDefault: false,
  status: "ACTIVE",
};

function ImageUploadField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (path: string) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { path } = await uploadQrDisplayTemplateAsset(file);
      onChange(path);
      toast.success("Uploaded");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {value ? "Replace" : "Upload"}
        </Button>
        {value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${UPLOADS_ORIGIN}/uploads/${value}`} alt={label} className="h-10 rounded border object-contain" />
        )}
      </div>
    </div>
  );
}

export default function QrDisplayTemplatesPage() {
  const { hasPermission } = useSession();

  const canCreate = hasPermission("qr-display-templates:create");
  const canUpdate = hasPermission("qr-display-templates:update");
  const canDelete = hasPermission("qr-display-templates:delete");
  const canRestore = hasPermission("qr-display-templates:restore");

  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const list = useResourceList<TemplateRow>("/system/qr-display-templates", {
    status: statusFilter || undefined,
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TemplateRow | null>(null);
  const [form, setForm] = React.useState<TemplateFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<TemplateRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: TemplateRow) {
    setEditing(row);
    setForm({
      templateName: row.templateName,
      backgroundImagePath: row.backgroundImagePath ?? "",
      logoOverridePath: row.logoOverridePath ?? "",
      primaryColor: row.primaryColor ?? "#0f172a",
      footerText: row.footerText ?? "",
      isSystemDefault: row.isSystemDefault,
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        templateName: form.templateName,
        backgroundImagePath: form.backgroundImagePath || undefined,
        logoOverridePath: form.logoOverridePath || undefined,
        primaryColor: form.primaryColor || undefined,
        footerText: form.footerText || undefined,
        isSystemDefault: form.isSystemDefault,
        ...(editing ? { status: form.status } : {}),
      };
      if (editing) {
        await api(`/system/qr-display-templates/${editing.id}`, { method: "PATCH", body });
        toast.success("Template updated");
      } else {
        await api("/system/qr-display-templates", { method: "POST", body });
        toast.success("Template created");
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
      await api(`/system/qr-display-templates/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Template deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onRestore(row: TemplateRow) {
    setRestoringId(row.id);
    try {
      await api(`/system/qr-display-templates/${row.id}/restore`, { method: "PATCH" });
      toast.success("Template restored");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  const columns: Column<TemplateRow>[] = [
    {
      header: "Preview",
      cell: (row) =>
        row.backgroundImagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${UPLOADS_ORIGIN}/uploads/${row.backgroundImagePath}`} alt="" className="h-10 w-16 rounded border object-cover" />
        ) : (
          <div className="h-10 w-16 rounded border" style={{ backgroundColor: row.primaryColor ?? "#0f172a" }} />
        ),
    },
    { header: "Name", cell: (row) => <span className="font-medium">{row.templateName}</span> },
    { header: "Scope", cell: (row) => (row.tenantBusinessId ? row.tenantBusiness?.name ?? "Tenant" : "System") },
    { header: "Default", cell: (row) => (row.isSystemDefault ? "Yes" : "—") },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<TemplateRow>
        title="QR Display Templates"
        description="Manage reusable background/branding presets for QR display devices."
        columns={columns}
        rows={list.rows}
        error={list.error}
        page={list.page}
        totalPages={list.totalPages}
        onPageChange={list.setPage}
        search={list.search}
        onSearchChange={list.setSearch}
        onSearchSubmit={list.applySearch}
        toolbarAction={canCreate ? <Button onClick={openCreate}><Plus className="size-4" /> Add Template</Button> : undefined}
        renderActions={
          canUpdate || canDelete || canRestore
            ? (row) => (
                <RowActionsMenu
                  actions={
                    row.status === "DELETED"
                      ? canRestore
                        ? [{ label: "Restore", icon: RotateCcw, onClick: () => onRestore(row), loading: restoringId === row.id, disabled: restoringId === row.id }]
                        : []
                      : [
                          ...(canUpdate ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }] : []),
                          ...(canDelete ? [{ label: "Delete", icon: Trash2, onClick: () => setDeleteTarget(row), destructive: true }] : []),
                        ]
                  }
                />
              )
            : undefined
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Template" : "Add Template"}</DialogTitle>
              <DialogDescription>
                {editing ? "Update this display template." : "New templates created here are system-wide presets every tenant can select."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="templateName">Name</Label>
                <Input
                  id="templateName"
                  required
                  value={form.templateName}
                  onChange={(e) => setForm((f) => ({ ...f, templateName: e.target.value }))}
                />
              </div>

              <ImageUploadField
                label="Background Image"
                value={form.backgroundImagePath}
                onChange={(path) => setForm((f) => ({ ...f, backgroundImagePath: path }))}
              />
              <ImageUploadField
                label="Logo Override"
                value={form.logoOverridePath}
                onChange={(path) => setForm((f) => ({ ...f, logoOverridePath: path }))}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <Input
                    id="primaryColor"
                    type="color"
                    className="h-10 w-full"
                    value={form.primaryColor}
                    onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Checkbox
                    id="isSystemDefault"
                    checked={form.isSystemDefault}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isSystemDefault: v === true }))}
                  />
                  <Label htmlFor="isSystemDefault" className="font-normal">
                    Mark as default preset
                  </Label>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="footerText">Footer Text</Label>
                <Textarea
                  id="footerText"
                  placeholder="Scan to pay"
                  value={form.footerText}
                  onChange={(e) => setForm((f) => ({ ...f, footerText: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !form.templateName}>
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
        title="Delete template"
        description={`This will soft-delete "${deleteTarget?.templateName}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
