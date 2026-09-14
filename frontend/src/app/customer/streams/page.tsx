"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, LoaderCircle, Pencil, Play, Plus, RotateCw, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ServiceBillingBadges } from "@/components/service-billing-badges";
import { useAppTimezone } from "@/hooks/use-app-settings";
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
import {
  customerApi,
  CustomerApiError,
  type CustomerServer,
  type CustomerStream,
} from "@/lib/customer-api";
import { CUSTOM_URL, URL_PRESETS, presetOf, urlForPreset } from "@/lib/stream-url-presets";
import { BILLING_BLOCKED_MESSAGE } from "@/lib/billing";

interface FormInput {
  url: string;
  sourceTimeout: string;
  comment: string;
}

interface FormValues {
  serverId: string;
  applicationName: string;
  streamKey: string;
  title: string;
  inputs: FormInput[];
}

const EMPTY_INPUT: FormInput = { url: "publish://", sourceTimeout: "", comment: "" };

const EMPTY_FORM: FormValues = {
  serverId: "",
  applicationName: "",
  streamKey: "",
  title: "",
  inputs: [{ ...EMPTY_INPUT }],
};

/**
 * Wrapped in Suspense because useSearchParams() opts a page into client-side
 * rendering; without a boundary the production build fails on prerender.
 */
/**
 * Why edit, enable/disable and reload are unavailable, or null when they are
 * fine. All three push to the server and the API refuses them while the server
 * is not ACTIVE, so the reason is stated on click instead of after a failed
 * round trip. A missing status is treated as usable.
 */
function serverBlockReason(stream: CustomerStream): string | null {
  const status = stream.server?.status;
  if (!status || status === "ACTIVE") return null;
  return `Server "${stream.server?.name ?? "unknown"}" is ${status.toLowerCase()}, so this stream cannot be changed right now. Contact your provider.`;
}

/** Edit, enable, reload and delete also need an active bill; the API refuses them otherwise. */
function actionBlockReason(stream: CustomerStream): string | null {
  return serverBlockReason(stream) ?? (stream.access?.state === "BLOCKED" ? BILLING_BLOCKED_MESSAGE : null);
}

export default function CustomerStreamsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" /> Loading your streams...
        </div>
      }
    >
      <CustomerStreams />
    </React.Suspense>
  );
}

function CustomerStreams() {
  const searchParams = useSearchParams();
  const timezone = useAppTimezone();

  const [streams, setStreams] = React.useState<CustomerStream[] | null>(null);
  const [servers, setServers] = React.useState<CustomerServer[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CustomerStream | null>(null);
  const [form, setForm] = React.useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);

  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<CustomerStream | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [streamList, serverList] = await Promise.all([
        customerApi<CustomerStream[]>("/customer/streams"),
        customerApi<CustomerServer[]>("/customer/servers"),
      ]);
      setStreams(streamList);
      setServers(serverList);
      setError(null);
    } catch (err) {
      setError(err instanceof CustomerApiError ? err.message : "Could not load your streams");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // A query param opens a form once, on arrival. Acted-on params are recorded
  // so that a later reload of streams/servers - which happens after every save
  // - does not re-open a dialog the customer has already closed.
  const handledParam = React.useRef<string | null>(null);

  // Arriving from the servers page with ?create=<serverId> opens the form on
  // that server, so "Add stream" there lands somewhere useful.
  const createFor = searchParams?.get("create");
  React.useEffect(() => {
    if (!createFor || !servers.length) return;
    if (handledParam.current === `create:${createFor}`) return;
    const server = servers.find((s) => s.serverId === createFor && s.canCreateStream);
    if (!server) return;
    handledParam.current = `create:${createFor}`;
    setEditing(null);
    setForm({ ...EMPTY_FORM, serverId: server.serverId, inputs: [{ ...EMPTY_INPUT }] });
    setFormOpen(true);
  }, [createFor, servers]);

  // Arriving from a stream's view page with ?edit=<id> opens the edit form for
  // it, so the view page's Edit button does not need a second form of its own.
  const editFor = searchParams?.get("edit");
  React.useEffect(() => {
    if (!editFor || !streams) return;
    if (handledParam.current === `edit:${editFor}`) return;
    const stream = streams.find((item) => item.id === editFor);
    if (!stream) return;
    handledParam.current = `edit:${editFor}`;
    openEdit(stream);
  }, [editFor, streams]);

  const creatable = servers.filter((s) => s.canCreateStream);

  function openCreate() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      serverId: creatable.length === 1 ? creatable[0].serverId : "",
      inputs: [{ ...EMPTY_INPUT }],
    });
    setFormOpen(true);
  }

  function openEdit(stream: CustomerStream) {
    const blocked = actionBlockReason(stream);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setEditing(stream);
    setForm({
      serverId: stream.serverId,
      applicationName: stream.applicationName ?? "",
      streamKey: stream.streamKey,
      title: stream.title,
      inputs:
        stream.inputs.length > 0
          ? stream.inputs.map((input) => ({
              url: input.url,
              sourceTimeout: input.sourceTimeout == null ? "" : String(input.sourceTimeout),
              comment: input.comment ?? "",
            }))
          : [{ ...EMPTY_INPUT }],
    });
    setFormOpen(true);
  }

  function updateInput(index: number, patch: Partial<FormInput>) {
    setForm((f) => ({
      ...f,
      inputs: f.inputs.map((input, i) => (i === index ? { ...input, ...patch } : input)),
    }));
  }

  const willRename =
    !!editing && (form.applicationName || null) !== (editing.applicationName || null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const inputs = form.inputs
        .filter((i) => i.url.trim())
        .map((i) => ({
          url: i.url.trim(),
          sourceTimeout: i.sourceTimeout ? Number(i.sourceTimeout) : undefined,
          comment: i.comment.trim() || undefined,
        }));

      if (editing) {
        // Only these two are editable by a customer; the rest are the
        // provider's settings, and the API rejects them outright.
        await customerApi(`/customer/streams/${editing.id}`, {
          method: "PATCH",
          body: { applicationName: form.applicationName.trim() || null, inputs },
        });
        toast.success(willRename ? `Renamed and updated` : "Stream updated");
      } else {
        await customerApi("/customer/streams", {
          method: "POST",
          body: {
            serverId: form.serverId,
            applicationName: form.applicationName.trim() || undefined,
            streamKey: form.streamKey.trim(),
            title: form.title.trim(),
            inputs,
          },
        });
        toast.success("Stream created");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof CustomerApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function act(stream: CustomerStream, action: "enable" | "disable" | "reload") {
    // Switching off never needs a bill.
    const blocked = action === "disable" ? serverBlockReason(stream) : actionBlockReason(stream);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setBusyId(stream.id);
    try {
      await customerApi(`/customer/streams/${stream.id}/${action}`, { method: "POST" });
      toast.success(
        action === "reload" ? "Stream reloaded" : action === "enable" ? "Stream enabled" : "Stream disabled",
      );
      await load();
    } catch (err) {
      toast.error(err instanceof CustomerApiError ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await customerApi(`/customer/streams/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Stream deleted");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof CustomerApiError ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (!streams) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle className="size-4 animate-spin" /> Loading your streams...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">My Streams</h1>
          <p className="text-muted-foreground text-sm">
            {streams.length} stream{streams.length === 1 ? "" : "s"} across{" "}
            {servers.length} server{servers.length === 1 ? "" : "s"}.
          </p>
        </div>
        <Button
          onClick={openCreate}
          disabled={creatable.length === 0}
          className="w-full sm:w-auto"
        >
          <Plus className="size-4" />
          {creatable.length === 0 ? "No capacity left" : "Add Stream"}
        </Button>
      </div>

      {streams.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">
            You have no streams yet.
            {creatable.length > 0
              ? " Use Add Stream to create your first one."
              : " Your servers have no capacity left — contact your provider."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {streams.map((stream) => (
            <Card key={stream.id}>
              {/* Stacked on a phone: five actions in a wrapping row alongside
                  the title left each one a sliver wide. */}
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 sm:flex-1">
                  <Link
                    href={`/customer/streams/${stream.id}`}
                    className="font-medium hover:underline"
                  >
                    {stream.title}
                  </Link>
                  <div className="text-muted-foreground truncate font-mono text-xs">
                    {stream.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{stream.server?.name ?? "—"}</Badge>
                    {stream.server?.status && stream.server.status !== "ACTIVE" && (
                      <Badge variant="warning">Server {stream.server.status.toLowerCase()}</Badge>
                    )}
                    {stream.server?.status === "ACTIVE" &&
                      stream.server.connectionStatus !== "CONNECTED" && (
                        <Badge variant="outline">Server not responding</Badge>
                      )}
                    {stream.disabled ? (
                      <Badge variant="outline">Disabled</Badge>
                    ) : (
                      <Badge variant="success">Enabled</Badge>
                    )}
                    <ServiceBillingBadges
                      billing={stream.billing}
                      access={stream.access}
                      timezone={timezone}
                      invoiceHref={(id) => `/customer/billing/${id}`}
                    />
                  </div>
                </div>

                {/* A grid on a phone so the buttons line up in even columns
                    instead of leaving one stranded on its own row. */}
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/customer/streams/${stream.id}`}>
                      <Eye className="size-4" /> View
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(stream)}>
                    <Pencil className="size-4" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === stream.id}
                    onClick={() => act(stream, stream.disabled ? "enable" : "disable")}
                  >
                    {busyId === stream.id ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : stream.disabled ? (
                      <Play className="size-4" />
                    ) : (
                      <Square className="size-4" />
                    )}
                    {stream.disabled ? "Enable" : "Disable"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === stream.id}
                    onClick={() => act(stream, "reload")}
                  >
                    <RotateCw className="size-4" /> Reload
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const blocked = actionBlockReason(stream);
                      if (blocked) toast.error(blocked);
                      else setDeleteTarget(stream);
                    }}
                    aria-label={`Delete ${stream.title}`}
                  >
                    <Trash2 className="size-4" />
                    <span className="sm:hidden">Delete</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit stream" : "Add stream"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "You can change the application name and the sources. Title, protocols and the server are set by your provider."
                  : "Create a stream on one of your servers."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {!editing && (
                <div className="grid gap-2">
                  <Label>Server *</Label>
                  <Select
                    value={form.serverId}
                    onValueChange={(v) => setForm((f) => ({ ...f, serverId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a server" />
                    </SelectTrigger>
                    <SelectContent>
                      {creatable.map((server) => (
                        <SelectItem key={server.serverId} value={server.serverId}>
                          {server.name}
                          {server.streamLimit === null
                            ? " (unlimited)"
                            : ` (${server.streamsRemaining} left)`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="applicationName">Application name</Label>
                  <Input
                    id="applicationName"
                    maxLength={150}
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
                    readOnly={!!editing}
                    disabled={!!editing}
                    value={form.streamKey}
                    onChange={(e) => setForm((f) => ({ ...f, streamKey: e.target.value }))}
                  />
                </div>
              </div>

              {willRename && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Changing the application name recreates the stream on the server under its new
                  name. Anyone watching the old address will be disconnected.
                </p>
              )}

              {!editing && (
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
              )}

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Sources *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm((f) => ({ ...f, inputs: [...f.inputs, { ...EMPTY_INPUT }] }))
                    }
                  >
                    <Plus className="size-4" /> Add source
                  </Button>
                </div>
                <div className="grid gap-3">
                  {form.inputs.map((input, index) => (
                    <div key={index} className="grid gap-3 rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-xs font-medium">
                          Source — Priority {index + 1}
                        </span>
                        {form.inputs.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove source"
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
                    </div>
                  ))}
                </div>
              </div>
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
                  (!editing && (!form.serverId || !form.streamKey || !form.title)) ||
                  !form.inputs.some((i) => i.url.trim())
                }
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
        title="Delete this stream?"
        description={`"${deleteTarget?.title}" will be removed from the server and the slot freed on your quota.`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  );
}
