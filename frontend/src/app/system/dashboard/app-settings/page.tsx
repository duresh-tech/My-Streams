"use client";

import * as React from "react";
import { ArrowDownAZ, ArrowUpAZ, LoaderCircle, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useResourceList } from "@/hooks/use-resource-list";
import { useSession } from "@/hooks/use-session";
import { api, ApiError } from "@/lib/api";

type DataType = "STRING" | "TEXT" | "INTEGER" | "DECIMAL" | "BOOLEAN" | "JSON" | "DATE" | "DATETIME" | "TIME";
type SettingStatus = "ACTIVE" | "INACTIVE" | "BLOCKED" | "DELETED";

const DATA_TYPES: DataType[] = ["STRING", "TEXT", "INTEGER", "DECIMAL", "BOOLEAN", "JSON", "DATE", "DATETIME", "TIME"];

interface AppSettingRow {
  id: string;
  key: string;
  dataType: DataType;
  value: string;
  description: string | null;
  status: SettingStatus;
}

interface AppSettingFormValues {
  key: string;
  dataType: DataType;
  value: string;
  description: string;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
}

const EMPTY_FORM: AppSettingFormValues = {
  key: "",
  dataType: "STRING",
  value: "",
  description: "",
  status: "ACTIVE",
};

export default function AppSettingsPage() {
  const { hasPermission } = useSession();
  const canCreate = hasPermission("app-settings:create");
  const canUpdate = hasPermission("app-settings:update");
  const canDelete = hasPermission("app-settings:delete");
  const canRestore = hasPermission("app-settings:restore");

  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [dataTypeFilter, setDataTypeFilter] = React.useState<string>("");
  const [sortBy, setSortBy] = React.useState("createdAt");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  const list = useResourceList<AppSettingRow>("/system/app-settings", {
    status: statusFilter || undefined,
    dataType: dataTypeFilter || undefined,
    sortBy,
    sortOrder,
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AppSettingRow | null>(null);
  const [form, setForm] = React.useState<AppSettingFormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<AppSettingRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: AppSettingRow) {
    setEditing(row);
    setForm({
      key: row.key,
      dataType: row.dataType,
      value: row.value,
      description: row.description ?? "",
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api(`/system/app-settings/${editing.id}`, {
          method: "PATCH",
          body: { value: form.value, description: form.description || undefined, status: form.status },
        });
        toast.success("Setting updated");
      } else {
        await api("/system/app-settings", {
          method: "POST",
          body: {
            key: form.key,
            dataType: form.dataType,
            value: form.value,
            description: form.description || undefined,
          },
        });
        toast.success("Setting created");
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
      await api(`/system/app-settings/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Setting deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function onRestore(row: AppSettingRow) {
    setRestoringId(row.id);
    try {
      await api(`/system/app-settings/${row.id}/restore`, { method: "PATCH" });
      toast.success("Setting restored");
      list.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  const columns: Column<AppSettingRow>[] = [
    { header: "Key", cell: (row) => <code className="text-xs">{row.key}</code> },
    { header: "Data Type", cell: (row) => <Badge variant="outline">{row.dataType}</Badge> },
    {
      header: "Value",
      cell: (row) => (
        <span className="block max-w-64 truncate font-mono text-xs" title={row.value}>
          {row.value}
        </span>
      ),
    },
    { header: "Description", cell: (row) => row.description ?? "—" },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<AppSettingRow>
        title="App Settings"
        description="Typed key-value configuration for the application."
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
              value={dataTypeFilter || "ALL"}
              onValueChange={(v) => {
                setDataTypeFilter(v === "ALL" ? "" : v);
                list.setPage(1);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Data type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                {DATA_TYPES.map((dt) => (
                  <SelectItem key={dt} value={dt}>
                    {dt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                <SelectItem value="key">Key</SelectItem>
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
              {sortOrder === "asc" ? <ArrowUpAZ className="size-4" /> : <ArrowDownAZ className="size-4" />}
            </Button>
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Setting
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
              <DialogTitle>{editing ? "Edit Setting" : "Add Setting"}</DialogTitle>
              <DialogDescription>
                {editing ? "Key and data type are locked after creation." : "Key must be unique (e.g. app.name)."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="key">Key</Label>
                  <Input
                    id="key"
                    required
                    maxLength={150}
                    disabled={!!editing}
                    placeholder="app.name"
                    value={form.key}
                    onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Data Type</Label>
                  <Select
                    value={form.dataType}
                    onValueChange={(v) => setForm((f) => ({ ...f, dataType: v as DataType, value: "" }))}
                    disabled={!!editing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATA_TYPES.map((dt) => (
                        <SelectItem key={dt} value={dt}>
                          {dt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="value">Value</Label>
                <ValueInput dataType={form.dataType} value={form.value} onChange={(v) => setForm((f) => ({ ...f, value: v }))} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  maxLength={255}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {editing && (
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v as AppSettingFormValues["status"] }))}
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
              <Button type="submit" disabled={saving || !form.key || form.value === ""}>
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
        title="Delete setting"
        description={`This will soft-delete "${deleteTarget?.key}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}

function ValueInput({
  dataType,
  value,
  onChange,
}: {
  dataType: DataType;
  value: string;
  onChange: (value: string) => void;
}) {
  switch (dataType) {
    case "TEXT":
    case "JSON":
      return (
        <Textarea
          id="value"
          required
          className="font-mono text-xs"
          rows={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "INTEGER":
      return (
        <Input id="value" required type="number" step={1} value={value} onChange={(e) => onChange(e.target.value)} />
      );
    case "DECIMAL":
      return (
        <Input id="value" required type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} />
      );
    case "BOOLEAN":
      return (
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger id="value">
            <SelectValue placeholder="Select a value" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      );
    case "DATE":
      return <Input id="value" required type="date" value={value} onChange={(e) => onChange(e.target.value)} />;
    case "DATETIME":
      return (
        <Input id="value" required type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />
      );
    case "TIME":
      return <Input id="value" required type="time" value={value} onChange={(e) => onChange(e.target.value)} />;
    case "STRING":
    default:
      return <Input id="value" required value={value} onChange={(e) => onChange(e.target.value)} />;
  }
}
