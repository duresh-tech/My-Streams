"use client";

import * as React from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";
import { CUSTOM_URL, URL_PRESETS, presetOf, urlForPreset } from "@/lib/stream-url-presets";
import {
  EMPTY_FORM,
  EMPTY_INPUT,
  PLAY_PROTOCOLS,
  SYNC_BADGE,
  clearable,
  clearableNumber,
  deriveStreamName,
  emptyProtocols,
  formFromStream,
  type FormInput,
  type FormValues,
  type StreamOption,
  type StreamRow,
} from "@/lib/stream-types";

/**
 * Create/edit dialog for a stream, shared by the streams list and the stream
 * view so the form exists in one place. It owns its own form state and option
 * lists; the caller only says whether it is open and which stream, if any, is
 * being edited.
 */
export function StreamFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
  canRename,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: StreamRow | null;
  onSaved: () => void;
  canRename: boolean;
}) {
  const [form, setForm] = React.useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [servers, setServers] = React.useState<StreamOption[] | null>(null);
  const [customers, setCustomers] = React.useState<StreamOption[] | null>(null);
  const [renameConfirm, setRenameConfirm] = React.useState<{ from: string; to: string } | null>(
    null,
  );

  // Only ACTIVE, CONNECTED servers can be chosen: a new stream is pushed to the
  // server as it is saved, so offering one that is down or suspended would only
  // produce a failure after the fact.
  const ensureServers = React.useCallback(() => {
    if (servers) return;
    tenantApi<{ items: StreamOption[] }>(
      "/tenant/streaming-servers?status=ACTIVE&connectionStatus=CONNECTED&limit=100&page=1",
    )
      .then((d) => setServers(d.items))
      .catch(() => toast.error("Failed to load servers"));
  }, [servers]);

  const ensureCustomers = React.useCallback(() => {
    if (customers) return;
    tenantApi<{
      items: { id: string; customerCode: string; fName: string; lName: string | null }[];
    }>("/tenant/customers?limit=100&page=1")
      .then((d) =>
        setCustomers(
          d.items.map((c) => ({
            id: c.id,
            name: `${c.customerCode} — ${c.fName}${c.lName ? " " + c.lName : ""}`,
          })),
        ),
      )
      .catch(() => toast.error("Failed to load customers"));
  }, [customers]);

  // Re-seed the form each time the dialog opens, so a cancelled edit cannot
  // leak its values into the next one.
  React.useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? formFromStream(editing)
        : { ...EMPTY_FORM, protocols: emptyProtocols(), inputs: [{ ...EMPTY_INPUT }] },
    );
    setRenameConfirm(null);
    ensureServers();
    ensureCustomers();
  }, [open, editing, ensureServers, ensureCustomers]);

  /** Patches one input row. */
  function updateInput(index: number, patch: Partial<FormInput>) {
    setForm((f) => ({
      ...f,
      inputs: f.inputs.map((input, i) => (i === index ? { ...input, ...patch } : input)),
    }));
  }

  /**
   * The stream's own server is added on edit: the field is read-only there, but
   * it would otherwise render blank whenever that server is currently down and
   * so missing from the filtered list.
   */
  const serverOptions = React.useMemo(() => {
    if (!servers) return null;
    const options = servers.map((s) => ({ value: s.id, label: s.name }));
    if (editing?.server && !options.some((o) => o.value === editing.server!.id)) {
      options.unshift({ value: editing.server.id, label: editing.server.name });
    }
    return options;
  }, [servers, editing]);

  const derivedName = deriveStreamName(form.applicationName, form.streamKey);
  const willRename = !!editing && derivedName !== "" && derivedName !== editing.name;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // A rename disconnects viewers, so it is confirmed before anything is sent.
    if (willRename && editing && !renameConfirm) {
      setRenameConfirm({ from: editing.name, to: derivedName });
      return;
    }
    await save();
  }

  async function save() {
    setSaving(true);
    try {
      const inputs = form.inputs
        .filter((i) => i.url.trim())
        .map((i) => ({
          url: i.url.trim(),
          sourceTimeout: clearableNumber(i.sourceTimeout) ?? undefined,
          comment: clearable(i.comment) ?? undefined,
        }));

      // Emptied fields send null, not undefined: undefined is dropped from the
      // body and read as "leave unchanged", so clearing a field in the form
      // could never clear it in the database.
      const common = {
        serverId: form.serverId,
        useSSL: form.useSSL,
        tenantCustomerId: clearable(form.tenantCustomerId),
        title: form.title,
        ingestDomain: clearable(form.ingestDomain),
        comment: clearable(form.comment),
        retryLimit: clearableNumber(form.retryLimit),
        sourceTimeout: clearableNumber(form.sourceTimeout),
        isStatic: form.isStatic,
        disabled: form.disabled,
        protocols: form.protocols,
        inputs,
      };

      if (editing) {
        // The rename goes first: PATCH refuses name changes by design, so the
        // stream must already carry its new name before the rest is saved.
        if (willRename) {
          const result = await tenantApi<{ renamed: boolean; warning?: string }>(
            `/tenant/streams/${editing.id}/rename`,
            {
              method: "POST",
              body: {
                applicationName: form.applicationName || undefined,
                streamKey: form.streamKey,
              },
            },
          );
          if (result.warning) toast.warning(result.warning);
          else toast.success(`Renamed to ${derivedName}`);
        }
        const saved = await tenantApi<StreamRow>(`/tenant/streams/${editing.id}`, {
          method: "PATCH",
          body: { ...common, status: form.status },
        });
        reportSaveOutcome(saved, "Stream updated");
      } else {
        const saved = await tenantApi<StreamRow>("/tenant/streams", {
          method: "POST",
          body: {
            ...common,
            applicationName: form.applicationName || undefined,
            streamKey: form.streamKey,
          },
        });
        reportSaveOutcome(saved, "Stream created");
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
      setRenameConfirm(null);
    }
  }

  /**
   * The local save already succeeded; the push to the server may not have.
   * Saying so beats a bare success toast on a stream the server never received.
   */
  function reportSaveOutcome(saved: StreamRow, successMessage: string) {
    if (saved?.syncStatus && saved.syncStatus !== "IN_SYNC") {
      const label = SYNC_BADGE[saved.syncStatus]?.label ?? saved.syncStatus;
      toast.warning(
        `${successMessage}, but the server was not updated (${label}). Run a sync once it is reachable.`,
      );
    } else {
      toast.success(successMessage);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit stream" : "Add stream"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Update this stream configuration."
                  : "Configure a new stream on one of your servers."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Server</Label>
                  <Combobox
                    options={serverOptions}
                    value={form.serverId}
                    onValueChange={(v) => setForm((f) => ({ ...f, serverId: v }))}
                    onOpenChange={(open) => open && ensureServers()}
                    placeholder="Select a server"
                    searchPlaceholder="Search servers..."
                    emptyText="No servers found."
                    disabled={!!editing}
                  />
                  {editing ? (
                    <p className="text-muted-foreground text-xs">
                      Moving a stream to another server is a transfer, not an edit.
                    </p>
                  ) : (
                    servers?.length === 0 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        No server is active and connected right now. Check a server&apos;s
                        connection before adding a stream to it.
                      </p>
                    )
                  )}
                </div>
                <div className="grid gap-2">
                  <Label>Customer</Label>
                  <Combobox
                    options={customers?.map((c) => ({ value: c.id, label: c.name })) ?? null}
                    value={form.tenantCustomerId}
                    onValueChange={(v) => setForm((f) => ({ ...f, tenantCustomerId: v }))}
                    onOpenChange={(open) => open && ensureCustomers()}
                    placeholder="Unassigned"
                    searchPlaceholder="Search customers..."
                    emptyText="No customers found."
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="applicationName">Application name</Label>
                  <Input
                    id="applicationName"
                    maxLength={150}
                    readOnly={!!editing && !canRename}
                    disabled={!!editing && !canRename}
                    placeholder="live (optional)"
                    value={form.applicationName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, applicationName: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="streamKey">Key *</Label>
                  <Input
                    id="streamKey"
                    required
                    maxLength={100}
                    readOnly={!!editing && !canRename}
                    disabled={!!editing && !canRename}
                    value={form.streamKey}
                    onChange={(e) => setForm((f) => ({ ...f, streamKey: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="derivedName">Name</Label>
                <Input
                  id="derivedName"
                  readOnly
                  disabled
                  value={derivedName}
                  placeholder="application-name/key"
                />
                <p
                  className={
                    editing && willRename
                      ? "text-xs text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground text-xs"
                  }
                >
                  {!editing
                    ? "Built automatically from application name and key. The application name is optional."
                    : willRename
                      ? `Renaming to "${derivedName}" recreates the stream on the server and deletes "${editing.name}". Everyone watching the old name is disconnected.`
                      : canRename
                        ? "Editing the application name or key renames the stream on the server."
                        : "You do not have permission to rename streams."}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    required
                    maxLength={150}
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="ingestDomain">Ingest domain</Label>
                  <Input
                    id="ingestDomain"
                    placeholder="ingest.example.com"
                    value={form.ingestDomain}
                    onChange={(e) => setForm((f) => ({ ...f, ingestDomain: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="comment">Comment</Label>
                <Textarea
                  id="comment"
                  value={form.comment}
                  onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="retryLimit">Retry limit</Label>
                  <Input
                    id="retryLimit"
                    type="number"
                    min={0}
                    value={form.retryLimit}
                    onChange={(e) => setForm((f) => ({ ...f, retryLimit: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sourceTimeout">Source timeout (s)</Label>
                  <Input
                    id="sourceTimeout"
                    type="number"
                    min={1}
                    value={form.sourceTimeout}
                    onChange={(e) => setForm((f) => ({ ...f, sourceTimeout: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="useSSL"
                    checked={form.useSSL}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, useSSL: c === true }))}
                  />
                  <Label htmlFor="useSSL" className="font-normal">
                    Use SSL for the ingest domain
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isStatic"
                    checked={form.isStatic}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, isStatic: c === true }))}
                  />
                  <Label htmlFor="isStatic" className="font-normal">
                    Static (always running)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="disabled"
                    checked={form.disabled}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, disabled: c === true }))}
                  />
                  <Label htmlFor="disabled" className="font-normal">
                    Disabled
                  </Label>
                </div>
              </div>

              {/* Inputs — array order is the failover priority */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Inputs *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm((f) => ({ ...f, inputs: [...f.inputs, { ...EMPTY_INPUT }] }))
                    }
                  >
                    <Plus className="size-4" /> Add input
                  </Button>
                </div>
                <div className="grid gap-3">
                  {form.inputs.map((input, index) => (
                    <div key={index} className="grid gap-3 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs font-medium">
                          URL — Priority {index + 1}
                        </span>
                        {form.inputs.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove input"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                inputs: f.inputs.filter((_, i) => i !== index),
                              }))
                            }
                          >
                            <X className="size-4" />
                          </Button>
                        )}
                      </div>
                      <Select
                        value={presetOf(input.url)}
                        onValueChange={(value) =>
                          updateInput(index, { url: urlForPreset(value, input.url) })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {URL_PRESETS.map((preset) => (
                            <SelectItem key={preset.value} value={preset.value}>
                              {preset.label}
                            </SelectItem>
                          ))}
                          <SelectItem value={CUSTOM_URL}>Custom</SelectItem>
                        </SelectContent>
                      </Select>

                      {presetOf(input.url) === CUSTOM_URL && (
                        <Input
                          placeholder="rtmp://source.example.com/live/KEY"
                          value={input.url}
                          onChange={(e) => updateInput(index, { url: e.target.value })}
                        />
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          type="number"
                          min={1}
                          placeholder="Source timeout (s)"
                          value={input.sourceTimeout}
                          onChange={(e) => updateInput(index, { sourceTimeout: e.target.value })}
                        />
                        <Input
                          placeholder="Comment"
                          value={input.comment}
                          onChange={(e) => updateInput(index, { comment: e.target.value })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Protocols — the whitelist flag is a mode switch, not a protocol */}
              <div className="grid gap-3">
                <Label>Protocols</Label>
                <div className="rounded-md border p-3">
                  <div className="grid gap-2">
                    <Label className="text-xs font-medium">Mode</Label>
                    <Select
                      value={form.protocols.whitelist ? "ALLOW" : "DENY"}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          protocols: { ...f.protocols, whitelist: v === "ALLOW" },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALLOW">Allow only the selected protocols</SelectItem>
                        <SelectItem value="DENY">Forbid the selected protocols</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PLAY_PROTOCOLS.map((protocol) => (
                      <div key={protocol} className="flex items-center gap-2">
                        <Checkbox
                          id={`proto-${protocol}`}
                          checked={!!form.protocols[protocol]}
                          onCheckedChange={(c) =>
                            setForm((f) => ({
                              ...f,
                              protocols: { ...f.protocols, [protocol]: c === true },
                            }))
                          }
                        />
                        <Label htmlFor={`proto-${protocol}`} className="font-normal">
                          {protocol}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {editing && (
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v as FormValues["status"] }))}
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
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  !form.serverId ||
                  !form.title ||
                  (!editing && (!form.applicationName || !form.streamKey)) ||
                  !form.inputs.some((i) => i.url.trim())
                }
              >
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                Save stream
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!renameConfirm}
        onOpenChange={(isOpen) => !isOpen && setRenameConfirm(null)}
        title="Rename this stream?"
        description={`"${renameConfirm?.from}" will be recreated on the server as "${renameConfirm?.to}" and the old name deleted. Anyone currently watching the old name will be disconnected, and any recording kept under it stays behind.`}
        loading={saving}
        onConfirm={save}
      />
    </>
  );
}
