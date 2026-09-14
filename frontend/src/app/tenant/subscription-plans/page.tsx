"use client";

import * as React from "react";
import { LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { ResourceTable, StatusBadgeText, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useResourceList } from "@/hooks/use-resource-list";
import { useTenantSession } from "@/hooks/use-tenant-session";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";
import { PLAY_PROTOCOLS } from "@/lib/stream-types";

type PlanStatus = "ACTIVE" | "INACTIVE" | "DELETED";
type SubscriptionFor = "STREAM" | "SERVER";
type DurationUnit = "DAY" | "MONTH" | "YEAR";

interface PlanRow {
  id: string;
  systemCode: string;
  name: string;
  description: string | null;
  subscriptionFor: SubscriptionFor;
  maxStreams: number | null;
  maxPlaySession: number | null;
  maxServerStream: number | null;
  features: string[];
  playbackProtocols: string[];
  durationValue: number;
  durationUnit: DurationUnit;
  orginalPrice: number;
  customerPrice: number;
  resellerPrice: number;
  showCustomer: boolean;
  showReseller: boolean;
  status: PlanStatus;
}

interface FormValues {
  name: string;
  description: string;
  subscriptionFor: SubscriptionFor;
  maxStreams: string;
  maxPlaySession: string;
  maxServerStream: string;
  features: string[];
  playbackProtocols: string[];
  durationValue: string;
  durationUnit: DurationUnit;
  orginalPrice: string;
  customerPrice: string;
  resellerPrice: string;
  showCustomer: boolean;
  showReseller: boolean;
  status: "ACTIVE" | "INACTIVE";
}

const EMPTY_FORM: FormValues = {
  name: "",
  description: "",
  subscriptionFor: "STREAM",
  maxStreams: "",
  maxPlaySession: "",
  maxServerStream: "",
  features: [],
  playbackProtocols: [],
  durationValue: "1",
  durationUnit: "MONTH",
  orginalPrice: "",
  customerPrice: "",
  resellerPrice: "",
  showCustomer: true,
  showReseller: false,
  status: "ACTIVE",
};

/** An empty limit field means unlimited, which is not the same as 0. */
function limitLabel(value: number | null): string {
  return value === null ? "Unlimited" : String(value);
}

function toLimit(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function formatDuration(value: number, unit: DurationUnit): string {
  const label = unit.toLowerCase();
  return `${value} ${value === 1 ? label : `${label}s`}`;
}

export default function TenantSubscriptionPlansPage() {
  const { hasPermission } = useTenantSession();

  const canCreate = hasPermission("tenant-subscription-plans:create");
  const canUpdate = hasPermission("tenant-subscription-plans:update");
  const canDelete = hasPermission("tenant-subscription-plans:delete");

  const [statusFilter, setStatusFilter] = React.useState("");
  const [forFilter, setForFilter] = React.useState("");

  const list = useResourceList<PlanRow>(
    "/tenant/subscription-plans",
    {
      status: statusFilter || undefined,
      subscriptionFor: forFilter || undefined,
    },
    tenantApi,
  );

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PlanRow | null>(null);
  const [form, setForm] = React.useState<FormValues>(EMPTY_FORM);
  const [featureDraft, setFeatureDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<PlanRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, features: [], playbackProtocols: [] });
    setFeatureDraft("");
    setFormOpen(true);
  }

  function openEdit(row: PlanRow) {
    setEditing(row);
    setForm({
      name: row.name,
      description: row.description ?? "",
      subscriptionFor: row.subscriptionFor,
      maxStreams: row.maxStreams == null ? "" : String(row.maxStreams),
      maxPlaySession: row.maxPlaySession == null ? "" : String(row.maxPlaySession),
      maxServerStream: row.maxServerStream == null ? "" : String(row.maxServerStream),
      features: [...row.features],
      playbackProtocols: [...row.playbackProtocols],
      durationValue: String(row.durationValue),
      durationUnit: row.durationUnit,
      orginalPrice: String(row.orginalPrice),
      customerPrice: String(row.customerPrice),
      resellerPrice: String(row.resellerPrice),
      showCustomer: row.showCustomer,
      showReseller: row.showReseller,
      status: row.status === "DELETED" ? "ACTIVE" : row.status,
    });
    setFeatureDraft("");
    setFormOpen(true);
  }

  function addFeature() {
    const value = featureDraft.trim();
    if (!value) return;
    if (form.features.includes(value)) {
      setFeatureDraft("");
      return;
    }
    setForm((f) => ({ ...f, features: [...f.features, value] }));
    setFeatureDraft("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const isStream = form.subscriptionFor === "STREAM";
      const body = {
        name: form.name,
        description: form.description.trim() || null,
        // The API rejects the limit that does not apply to the plan type, so
        // the irrelevant one is sent as null rather than whatever was typed
        // before the type was switched.
        maxStreams: isStream ? toLimit(form.maxStreams) : null,
        maxServerStream: isStream ? null : toLimit(form.maxServerStream),
        maxPlaySession: toLimit(form.maxPlaySession),
        features: form.features,
        playbackProtocols: form.playbackProtocols,
        durationValue: Number(form.durationValue),
        durationUnit: form.durationUnit,
        orginalPrice: Number(form.orginalPrice),
        customerPrice: Number(form.customerPrice),
        resellerPrice: Number(form.resellerPrice),
        showCustomer: form.showCustomer,
        showReseller: form.showReseller,
      };

      if (editing) {
        // subscriptionFor is omitted: the API rejects a change and the form
        // locks the field, so sending it would only be noise.
        await tenantApi(`/tenant/subscription-plans/${editing.id}`, {
          method: "PATCH",
          body: { ...body, status: form.status },
        });
        toast.success("Plan updated");
      } else {
        await tenantApi("/tenant/subscription-plans", {
          method: "POST",
          body: { ...body, subscriptionFor: form.subscriptionFor },
        });
        toast.success("Plan created");
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
      await tenantApi(`/tenant/subscription-plans/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Plan deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const isStream = form.subscriptionFor === "STREAM";

  const columns: Column<PlanRow>[] = [
    {
      header: "Plan",
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{row.name}</span>
          {row.description && (
            <span className="text-muted-foreground max-w-[22rem] truncate text-xs">
              {row.description}
            </span>
          )}
        </div>
      ),
    },
    {
      header: "For",
      cell: (row) => <Badge variant="outline">{row.subscriptionFor}</Badge>,
    },
    {
      header: "Limits",
      cell: (row) => (
        <div className="text-xs">
          {row.subscriptionFor === "STREAM" ? (
            <div>Streams: {limitLabel(row.maxStreams)}</div>
          ) : (
            <div>Server streams: {limitLabel(row.maxServerStream)}</div>
          )}
          <div className="text-muted-foreground">
            Play sessions: {limitLabel(row.maxPlaySession)}
          </div>
        </div>
      ),
    },
    {
      header: "Duration",
      cell: (row) => formatDuration(row.durationValue, row.durationUnit),
    },
    {
      header: "Pricing",
      cell: (row) => (
        <div className="text-xs">
          <div className="font-medium">Customer: {row.customerPrice}</div>
          <div className="text-muted-foreground">
            Reseller: {row.resellerPrice} · List: {row.orginalPrice}
          </div>
        </div>
      ),
    },
    {
      header: "Visible to",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.showCustomer && <Badge variant="info">Customer</Badge>}
          {row.showReseller && <Badge variant="secondary">Reseller</Badge>}
          {!row.showCustomer && !row.showReseller && (
            <span className="text-muted-foreground text-xs">Hidden</span>
          )}
        </div>
      ),
    },
    { header: "Status", cell: (row) => <StatusBadgeText status={row.status} /> },
  ];

  return (
    <>
      <ResourceTable<PlanRow>
        title="Subscription Plans"
        description="Plans your customers and resellers can subscribe to."
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
              value={forFilter || "ALL"}
              onValueChange={(v) => {
                setForFilter(v === "ALL" ? "" : v);
                list.setPage(1);
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                <SelectItem value="STREAM">Stream</SelectItem>
                <SelectItem value="SERVER">Server</SelectItem>
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
                <SelectItem value="DELETED">Deleted</SelectItem>
              </SelectContent>
            </Select>
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Plan
              </Button>
            )}
          </>
        }
        renderActions={
          canUpdate || canDelete
            ? (row) => (
                <RowActionsMenu
                  actions={[
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
                  ]}
                />
              )
            : undefined
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit plan" : "Add plan"}</DialogTitle>
              <DialogDescription>
                What a customer or reseller gets, for how long, and at what price.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    required
                    maxLength={150}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Plan for *</Label>
                  <Select
                    value={form.subscriptionFor}
                    disabled={!!editing}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, subscriptionFor: v as SubscriptionFor }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STREAM">Stream</SelectItem>
                      <SelectItem value="SERVER">Server</SelectItem>
                    </SelectContent>
                  </Select>
                  {editing && (
                    <p className="text-muted-foreground text-xs">
                      The plan type cannot be changed — its limits are type-specific, and anything
                      already sold on this plan would change meaning. Create a new plan instead.
                    </p>
                  )}
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

              {/* Limits. Empty means unlimited, which is why there is no 0 default. */}
              <div className="grid gap-2">
                <Label>Limits</Label>
                <p className="text-muted-foreground text-xs">
                  Leave a limit empty for unlimited. {isStream ? "Server streams" : "Streams"} does
                  not apply to a {form.subscriptionFor.toLowerCase()} plan.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="maxStreams" className="text-xs font-normal">
                      Max streams
                    </Label>
                    <Input
                      id="maxStreams"
                      type="number"
                      min={0}
                      placeholder="Unlimited"
                      disabled={!isStream}
                      value={isStream ? form.maxStreams : ""}
                      onChange={(e) => setForm((f) => ({ ...f, maxStreams: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxServerStream" className="text-xs font-normal">
                      Max server streams
                    </Label>
                    <Input
                      id="maxServerStream"
                      type="number"
                      min={0}
                      placeholder="Unlimited"
                      disabled={isStream}
                      value={isStream ? "" : form.maxServerStream}
                      onChange={(e) => setForm((f) => ({ ...f, maxServerStream: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="maxPlaySession" className="text-xs font-normal">
                      Max play sessions
                    </Label>
                    <Input
                      id="maxPlaySession"
                      type="number"
                      min={0}
                      placeholder="Unlimited"
                      value={form.maxPlaySession}
                      onChange={(e) => setForm((f) => ({ ...f, maxPlaySession: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="durationValue">Duration *</Label>
                  <Input
                    id="durationValue"
                    type="number"
                    min={1}
                    required
                    value={form.durationValue}
                    onChange={(e) => setForm((f) => ({ ...f, durationValue: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Duration unit *</Label>
                  <Select
                    value={form.durationUnit}
                    onValueChange={(v) => setForm((f) => ({ ...f, durationUnit: v as DurationUnit }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAY">Day</SelectItem>
                      <SelectItem value="MONTH">Month</SelectItem>
                      <SelectItem value="YEAR">Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Pricing</Label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="orginalPrice" className="text-xs font-normal">
                      List price *
                    </Label>
                    <Input
                      id="orginalPrice"
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={form.orginalPrice}
                      onChange={(e) => setForm((f) => ({ ...f, orginalPrice: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="customerPrice" className="text-xs font-normal">
                      Customer price *
                    </Label>
                    <Input
                      id="customerPrice"
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={form.customerPrice}
                      onChange={(e) => setForm((f) => ({ ...f, customerPrice: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="resellerPrice" className="text-xs font-normal">
                      Reseller price *
                    </Label>
                    <Input
                      id="resellerPrice"
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={form.resellerPrice}
                      onChange={(e) => setForm((f) => ({ ...f, resellerPrice: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Features: a free-form list, entered one at a time. */}
              <div className="grid gap-2">
                <Label htmlFor="featureDraft">Features</Label>
                <div className="flex gap-2">
                  <Input
                    id="featureDraft"
                    placeholder="HD quality"
                    value={featureDraft}
                    onChange={(e) => setFeatureDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter adds a feature rather than submitting the form,
                      // which would be a surprising way to lose a half-filled
                      // plan.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addFeature();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addFeature}>
                    <Plus className="size-4" /> Add
                  </Button>
                </div>
                {form.features.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {form.features.map((feature) => (
                      <Badge key={feature} variant="secondary" className="gap-1">
                        {feature}
                        <button
                          type="button"
                          aria-label={`Remove ${feature}`}
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              features: f.features.filter((x) => x !== feature),
                            }))
                          }
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Protocols come from the same list the streams module uses, so a
                  plan cannot promise something the servers do not support. */}
              <div className="grid gap-2">
                <Label>Playback protocols</Label>
                <div className="grid grid-cols-2 gap-2 rounded-md border p-3 sm:grid-cols-3">
                  {PLAY_PROTOCOLS.map((protocol) => (
                    <div key={protocol} className="flex items-center gap-2">
                      <Checkbox
                        id={`plan-proto-${protocol}`}
                        checked={form.playbackProtocols.includes(protocol)}
                        onCheckedChange={(checked) =>
                          setForm((f) => ({
                            ...f,
                            playbackProtocols:
                              checked === true
                                ? [...f.playbackProtocols, protocol]
                                : f.playbackProtocols.filter((p) => p !== protocol),
                          }))
                        }
                      />
                      <Label htmlFor={`plan-proto-${protocol}`} className="font-normal">
                        {protocol}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="showCustomer"
                    checked={form.showCustomer}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, showCustomer: c === true }))}
                  />
                  <Label htmlFor="showCustomer" className="font-normal">
                    Show to customers
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="showReseller"
                    checked={form.showReseller}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, showReseller: c === true }))}
                  />
                  <Label htmlFor="showReseller" className="font-normal">
                    Show to resellers
                  </Label>
                </div>
              </div>

              {editing && (
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v as "ACTIVE" | "INACTIVE" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  !form.name ||
                  !form.durationValue ||
                  form.orginalPrice === "" ||
                  form.customerPrice === "" ||
                  form.resellerPrice === ""
                }
              >
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                Save plan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete plan"
        description={`This will delete "${deleteTarget?.name}". Plans have no restore, so it cannot be brought back from the UI.`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </>
  );
}
