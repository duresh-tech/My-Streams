"use client";

import * as React from "react";
import { FileJson } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResourceTable, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { useResourceList } from "@/hooks/use-resource-list";
import { formatDateTime } from "@/lib/datetime";
import { EMAIL_STATUS_BADGE, STREAM_EVENT_GROUPS, type EmailStatus } from "@/lib/stream-events";
import { tenantApi } from "@/lib/tenant-api";

interface EventRow {
  id: string;
  event: string;
  media: string | null;
  occurredAt: number;
  payload: Record<string, unknown>;
  emailStatus: EmailStatus;
  emailError: string | null;
  server: { id: string; name: string };
  stream: { id: string; name: string; title: string } | null;
  customer: { id: string; customerCode: string; name: string } | null;
}

interface Options {
  retentionDays: number;
  servers: { id: string; name: string; eventsEnabled: boolean }[];
}

const ALL = "ALL";
const AUTO_REFRESH_MS = 30000;

export default function TenantStreamEventsPage() {
  const timezone = useAppTimezone();
  const [options, setOptions] = React.useState<Options | null>(null);
  const [serverId, setServerId] = React.useState(ALL);
  const [event, setEvent] = React.useState(ALL);
  const [emailStatus, setEmailStatus] = React.useState(ALL);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [viewTarget, setViewTarget] = React.useState<EventRow | null>(null);
  const [autoRefresh, setAutoRefresh] = React.useState(true);

  const list = useResourceList<EventRow>(
    "/tenant/stream-events",
    {
      tenantFlussonicServerId: serverId === ALL ? undefined : serverId,
      event: event === ALL ? undefined : event,
      emailStatus: emailStatus === ALL ? undefined : emailStatus,
      from: from || undefined,
      to: to || undefined,
    },
    tenantApi,
  );

  // Polls in the background, keeping the table on screen. Paused while the
  // payload dialog is open or the tab is hidden, so nothing shifts under the reader.
  const { refreshSilently } = list;
  React.useEffect(() => {
    if (!autoRefresh || viewTarget) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refreshSilently();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, viewTarget, refreshSilently]);

  React.useEffect(() => {
    tenantApi<Options>("/tenant/stream-events/options")
      .then(setOptions)
      .catch(() => setOptions(null));
  }, []);

  const filterChange = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    list.setPage(1);
  };

  const columns: Column<EventRow>[] = [
    { header: "Time", cell: (row) => <span className="whitespace-nowrap">{formatDateTime(row.occurredAt, timezone)}</span> },
    {
      header: "Event",
      cell: (row) => (
        <Badge variant="outline" className="font-mono text-[11px]">
          {row.event}
        </Badge>
      ),
    },
    { header: "Server", cell: (row) => row.server.name },
    {
      header: "Stream",
      cell: (row) =>
        row.stream ? (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.stream.title}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">{row.stream.name}</div>
          </div>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">{row.media ?? "—"}</span>
        ),
    },
    {
      header: "Customer",
      cell: (row) =>
        row.customer ? (
          <div>
            <div>{row.customer.name}</div>
            <div className="text-xs text-muted-foreground">{row.customer.customerCode}</div>
          </div>
        ) : (
          "—"
        ),
    },
    {
      header: "Alert",
      cell: (row) => {
        const badge = EMAIL_STATUS_BADGE[row.emailStatus];
        return (
          <div className="grid gap-0.5">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {row.emailError && <span className="max-w-xs truncate text-xs text-destructive" title={row.emailError}>{row.emailError}</span>}
          </div>
        );
      },
    },
  ];

  const noServerSendsEvents = options !== null && !options.servers.some((s) => s.eventsEnabled);

  return (
    <div className="grid gap-4">
      {noServerSendsEvents && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          None of your streaming servers is set to send events. Turn on &quot;Receive stream events&quot; on a server under
          Streaming Servers.
        </div>
      )}

      <ResourceTable<EventRow>
        title="Stream Events"
        description={`What your streaming servers reported, newest first. Kept for ${options?.retentionDays ?? 30} days. Search matches the stream name.`}
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
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm whitespace-nowrap">
              <Checkbox checked={autoRefresh} onCheckedChange={(value) => setAutoRefresh(value === true)} />
              Auto refresh (30s)
            </label>
            <Select value={serverId} onValueChange={filterChange(setServerId)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All servers</SelectItem>
                {(options?.servers ?? []).map((server) => (
                  <SelectItem key={server.id} value={server.id}>
                    {server.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={event} onValueChange={filterChange(setEvent)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All events</SelectItem>
                {STREAM_EVENT_GROUPS.flatMap((group) => group.events).map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={emailStatus} onValueChange={filterChange(setEmailStatus)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any alert result</SelectItem>
                {(Object.keys(EMAIL_STATUS_BADGE) as EmailStatus[]).map((status) => (
                  <SelectItem key={status} value={status}>
                    {EMAIL_STATUS_BADGE[status].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label="From date"
              className="w-40"
              value={from}
              max={to || undefined}
              onChange={(e) => filterChange(setFrom)(e.target.value)}
            />
            <Input
              type="date"
              aria-label="To date"
              className="w-40"
              value={to}
              min={from || undefined}
              onChange={(e) => filterChange(setTo)(e.target.value)}
            />
          </div>
        }
        renderActions={(row) => (
          <RowActionsMenu actions={[{ label: "View details", icon: FileJson, onClick: () => setViewTarget(row) }]} />
        )}
      />

      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">{viewTarget?.event}</DialogTitle>
            <DialogDescription>
              {viewTarget && `${viewTarget.server.name} · ${formatDateTime(viewTarget.occurredAt, timezone)}`}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs">
            {viewTarget ? JSON.stringify(viewTarget.payload, null, 2) : ""}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
