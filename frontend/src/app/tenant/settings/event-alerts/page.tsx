"use client";

import * as React from "react";
import { LoaderCircle, Pencil, Plus, Send, Trash2 } from "lucide-react";
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
import { ResourceTable, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { useResourceList } from "@/hooks/use-resource-list";
import { useTenantSession } from "@/hooks/use-tenant-session";
import { formatDateTime } from "@/lib/datetime";
import { STREAM_EVENT_GROUPS } from "@/lib/stream-events";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";

type CustomerRecipients = "NONE" | "STREAM_OWNER" | "SERVER_CUSTOMERS";

const CUSTOMER_RECIPIENTS: Record<CustomerRecipients, { label: string; hint: string }> = {
  NONE: { label: "No customers", hint: "Only the addresses above are emailed." },
  STREAM_OWNER: { label: "Stream owner", hint: "The customer the stream belongs to, when they have an email address." },
  SERVER_CUSTOMERS: {
    label: "Stream owner + server's customers",
    hint: "The owner plus every customer actively assigned to the stream's server - useful for outages on a shared server.",
  },
};

interface RuleRow {
  id: string;
  name: string;
  events: string[];
  serverIds: string[];
  streamIds: string[];
  customerIds: string[];
  recipients: string[];
  customerRecipients: CustomerRecipients;
  cooldownMinutes: number;
  status: "ACTIVE" | "INACTIVE";
  lastTriggeredAt: number | null;
}

interface Options {
  mailConfigured: boolean;
  servers: { id: string; name: string; eventsEnabled: boolean; eventTypes: string[] }[];
  streams: { id: string; name: string; title: string; serverId: string; customerId: string | null }[];
  customers: { id: string; customerCode: string; name: string; email: string | null }[];
}

interface FormValues {
  name: string;
  events: string[];
  serverIds: string[];
  streamIds: string[];
  customerIds: string[];
  recipients: string;
  customerRecipients: CustomerRecipients;
  cooldownMinutes: string;
  active: boolean;
}

const EMPTY_FORM: FormValues = {
  name: "",
  events: [],
  serverIds: [],
  streamIds: [],
  customerIds: [],
  recipients: "",
  customerRecipients: "NONE",
  cooldownMinutes: "15",
  active: true,
};

const toggle = (list: string[], id: string, on: boolean) => (on ? [...list.filter((x) => x !== id), id] : list.filter((x) => x !== id));

const parseRecipients = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((email) => email.trim())
    .filter(Boolean);

/** A bordered, scrollable checklist; nothing ticked means "all". */
function ScopeList({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: { id: string; label: string; hint?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{selected.length === 0 ? "All" : `${selected.length} selected`}</span>
      </div>
      <div className="h-56 overflow-y-auto rounded-md border p-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">None available.</p>
        ) : (
          items.map((item) => (
            <label key={item.id} className="flex min-w-0 items-center gap-2 py-0.5 text-sm" title={item.hint ? `${item.label} · ${item.hint}` : item.label}>
              <Checkbox
                checked={selected.includes(item.id)}
                onCheckedChange={(value) => onChange(toggle(selected, item.id, value === true))}
              />
              <span className="min-w-0 truncate">{item.label}</span>
              {item.hint && <span className="min-w-0 shrink truncate text-xs text-muted-foreground">{item.hint}</span>}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export default function TenantEventAlertsPage() {
  const timezone = useAppTimezone();
  const { hasPermission } = useTenantSession();
  const canCreate = hasPermission("tenant-event-alerts:create");
  const canUpdate = hasPermission("tenant-event-alerts:update");
  const canDelete = hasPermission("tenant-event-alerts:delete");

  const list = useResourceList<RuleRow>("/tenant/event-alerts", {}, tenantApi);
  const [options, setOptions] = React.useState<Options | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RuleRow | null>(null);
  const [form, setForm] = React.useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<RuleRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    tenantApi<Options>("/tenant/event-alerts/options")
      .then(setOptions)
      .catch(() => toast.error("Failed to load servers, streams and customers"));
  }, []);

  const serverName = (id: string) => options?.servers.find((s) => s.id === id)?.name ?? "Unknown server";
  // Streams narrow to the servers picked, so the list stays relevant.
  const streamItems = (options?.streams ?? [])
    .filter((s) => form.serverIds.length === 0 || form.serverIds.includes(s.serverId))
    .map((s) => ({ id: s.id, label: s.title, hint: `${s.name} · ${serverName(s.serverId)}` }));
  // An event no selected (or no) server sends can never trigger the rule.
  const scopedServers = (options?.servers ?? []).filter((s) => form.serverIds.length === 0 || form.serverIds.includes(s.id));
  const unsentEvents = form.events.filter((event) => !scopedServers.some((s) => s.eventsEnabled && s.eventTypes.includes(event)));

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(row: RuleRow) {
    setEditing(row);
    setForm({
      name: row.name,
      events: row.events,
      serverIds: row.serverIds,
      streamIds: row.streamIds,
      customerIds: row.customerIds,
      recipients: row.recipients.join("\n"),
      customerRecipients: row.customerRecipients,
      cooldownMinutes: String(row.cooldownMinutes),
      active: row.status === "ACTIVE",
    });
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        events: form.events,
        serverIds: form.serverIds,
        streamIds: form.streamIds,
        customerIds: form.customerIds,
        recipients: parseRecipients(form.recipients),
        customerRecipients: form.customerRecipients,
        cooldownMinutes: Number(form.cooldownMinutes) || 0,
        status: form.active ? "ACTIVE" : "INACTIVE",
      };
      if (editing) {
        await tenantApi(`/tenant/event-alerts/${editing.id}`, { method: "PATCH", body });
        toast.success("Alert rule updated");
      } else {
        await tenantApi("/tenant/event-alerts", { method: "POST", body });
        toast.success("Alert rule created");
      }
      setFormOpen(false);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onTest(row: RuleRow) {
    setTestingId(row.id);
    try {
      const result = await tenantApi<{ recipients: string[] }>(`/tenant/event-alerts/${row.id}/test`, { method: "POST" });
      toast.success(`Test alert sent to ${result.recipients.join(", ")}`);
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Could not send the test alert");
    } finally {
      setTestingId(null);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await tenantApi(`/tenant/event-alerts/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Alert rule deleted");
      setDeleteTarget(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const scopeText = (row: RuleRow) => {
    const parts = [
      row.serverIds.length ? `${row.serverIds.length} server(s)` : "all servers",
      ...(row.streamIds.length ? [`${row.streamIds.length} stream(s)`] : []),
      ...(row.customerIds.length ? [`${row.customerIds.length} customer(s)`] : []),
    ];
    return parts.join(" · ");
  };

  const columns: Column<RuleRow>[] = [
    { header: "Name", cell: (row) => <span className="font-medium">{row.name}</span> },
    {
      header: "Events",
      cell: (row) =>
        row.events.length === 0 ? (
          <span className="text-xs text-muted-foreground">None - never fires</span>
        ) : (
          <div className="flex max-w-xs flex-wrap gap-1">
            {row.events.map((event) => (
              <Badge key={event} variant="outline" className="font-mono text-[11px]">
                {event}
              </Badge>
            ))}
          </div>
        ),
    },
    { header: "Scope", cell: (row) => <span className="text-sm">{scopeText(row)}</span> },
    {
      header: "Email to",
      cell: (row) => (
        <div className="max-w-xs text-sm">
          <div className="truncate">{row.recipients.join(", ") || "—"}</div>
          {row.customerRecipients !== "NONE" && (
            <div className="text-xs text-muted-foreground">+ {CUSTOMER_RECIPIENTS[row.customerRecipients].label} (Bcc)</div>
          )}
        </div>
      ),
    },
    { header: "Cooldown", cell: (row) => (row.cooldownMinutes ? `${row.cooldownMinutes} min` : "None") },
    {
      header: "Status",
      cell: (row) => (
        <div className="grid gap-0.5">
          <Badge variant={row.status === "ACTIVE" ? "success" : "outline"}>{row.status === "ACTIVE" ? "Active" : "Paused"}</Badge>
          {row.lastTriggeredAt && (
            <span className="text-xs text-muted-foreground">Last sent {formatDateTime(row.lastTriggeredAt, timezone)}</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      {options && !options.mailConfigured && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          No mail configuration: events are still logged, but no alert emails can be sent until Mail Config is set up.
        </div>
      )}

      <ResourceTable<RuleRow>
        title="Event Alerts"
        description="Email someone when your streaming servers report specific events. A server only reports the events ticked on it under Streaming Servers."
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
              <Plus className="size-4" /> Add Alert
            </Button>
          ) : undefined
        }
        renderActions={
          canUpdate || canDelete
            ? (row) => (
                <RowActionsMenu
                  actions={[
                    ...(canUpdate ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }] : []),
                    ...(canUpdate
                      ? [{ label: testingId === row.id ? "Sending..." : "Send test", icon: Send, onClick: () => onTest(row) }]
                      : []),
                    ...(canDelete ? [{ label: "Delete", icon: Trash2, onClick: () => setDeleteTarget(row), destructive: true }] : []),
                  ]}
                />
              )
            : undefined
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit alert" : "Add alert"}</DialogTitle>
              <DialogDescription>Sends an email when any of the chosen events happens within the chosen scope.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    required
                    maxLength={150}
                    placeholder="Source lost"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <Checkbox checked={form.active} onCheckedChange={(value) => setForm((f) => ({ ...f, active: value === true }))} />
                  Active
                </label>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Events</Label>
                  <span className="text-xs text-muted-foreground">
                    {form.events.length === 0 ? "None ticked - this rule never fires" : `${form.events.length} selected`}
                  </span>
                </div>
                <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
                  {STREAM_EVENT_GROUPS.map((group) => (
                    <div key={group.group} className="grid content-start gap-1.5">
                      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</div>
                      {group.events.map((event) => (
                        <label key={event} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={form.events.includes(event)}
                            onCheckedChange={(value) => setForm((f) => ({ ...f, events: toggle(f.events, event, value === true) }))}
                          />
                          <code className="text-xs">{event}</code>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
                {options && unsentEvents.length > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    No server in scope sends {unsentEvents.join(", ")}. Tick them on the server under Streaming Servers, or
                    this rule will not fire for them.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <ScopeList
                  label="Servers"
                  items={(options?.servers ?? []).map((s) => ({ id: s.id, label: s.name, hint: s.eventsEnabled ? undefined : "events off" }))}
                  selected={form.serverIds}
                  onChange={(serverIds) => setForm((f) => ({ ...f, serverIds }))}
                />
                <ScopeList
                  label="Streams"
                  items={streamItems}
                  selected={form.streamIds}
                  onChange={(streamIds) => setForm((f) => ({ ...f, streamIds }))}
                />
                <ScopeList
                  label="Customers"
                  items={(options?.customers ?? []).map((c) => ({ id: c.id, label: c.name, hint: c.customerCode }))}
                  selected={form.customerIds}
                  onChange={(customerIds) => setForm((f) => ({ ...f, customerIds }))}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <div className="grid gap-2">
                  <Label htmlFor="recipients">Email to</Label>
                  <Textarea
                    id="recipients"
                    rows={3}
                    placeholder={"noc@example.com\nsupport@example.com"}
                    value={form.recipients}
                    onChange={(e) => setForm((f) => ({ ...f, recipients: e.target.value }))}
                  />
                  <div className="grid gap-2 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
                    <Select
                      value={form.customerRecipients}
                      onValueChange={(value) => setForm((f) => ({ ...f, customerRecipients: value as CustomerRecipients }))}
                    >
                      <SelectTrigger aria-label="Customer recipients">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(CUSTOMER_RECIPIENTS) as CustomerRecipients[]).map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {CUSTOMER_RECIPIENTS[mode].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {CUSTOMER_RECIPIENTS[form.customerRecipients].hint}
                      {form.customerRecipients !== "NONE" && " Customers are Bcc'd, so they never see each other's address."}
                    </p>
                  </div>
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="cooldown">Cooldown (minutes)</Label>
                  <Input
                    id="cooldown"
                    type="number"
                    min={0}
                    max={10080}
                    value={form.cooldownMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, cooldownMinutes: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Per stream. 0 sends every time.</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || !form.name.trim() || (parseRecipients(form.recipients).length === 0 && form.customerRecipients === "NONE")}
              >
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
        title="Delete alert"
        description={`"${deleteTarget?.name ?? ""}" will stop sending emails.`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  );
}
