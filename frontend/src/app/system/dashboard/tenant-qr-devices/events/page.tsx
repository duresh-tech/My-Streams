"use client";

import * as React from "react";
import { Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { api, type ListResponse } from "@/lib/api";

type EventType = "CREATED" | "CONFIG_UPDATED" | "PUSH_REQUESTED" | "TEST_TRIGGERED" | "PAYMENT_CONFIRMED" | "ERROR";

interface EventRow {
  id: string;
  tenantQrDeviceId: string;
  eventType: EventType;
  amount: number | null;
  message: string | null;
  atCommand: string | null;
  atResponse: string | null;
  payload: string | null;
  createdAt: number;
  device: { id: string; systemCode: string; deviceName: string; tenantBusiness: { id: string; name: string } };
}

interface BusinessOption {
  id: string;
  name: string;
}

const EVENT_TYPE_VARIANT: Record<EventType, "secondary" | "destructive" | "outline" | "success" | "info"> = {
  CREATED: "info",
  CONFIG_UPDATED: "outline",
  PUSH_REQUESTED: "secondary",
  TEST_TRIGGERED: "outline",
  PAYMENT_CONFIRMED: "success",
  ERROR: "destructive",
};

export default function TenantQrDeviceEventsPage() {
  const [eventType, setEventType] = React.useState<string>("");
  const [businessId, setBusinessId] = React.useState<string>("");
  const [businessOptions, setBusinessOptions] = React.useState<BusinessOption[] | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<EventRow | null>(null);

  const list = useResourceList<EventRow>("/system/tenant-qr-devices/events", {
    eventType: eventType || undefined,
    tenantBusinessId: businessId || undefined,
  });

  function ensureBusinessOptions() {
    if (businessOptions) return;
    api<ListResponse<BusinessOption>>("/system/tenant-business?limit=100&page=1")
      .then((data) => setBusinessOptions(data.items))
      .catch(() => toast.error("Failed to load business list"));
  }

  const columns: Column<EventRow>[] = [
    { header: "Time", cell: (row) => new Date(row.createdAt * 1000).toLocaleString() },
    { header: "Device", cell: (row) => <span className="font-medium">{row.device.deviceName}</span> },
    { header: "Business", cell: (row) => row.device.tenantBusiness.name },
    { header: "Type", cell: (row) => <Badge variant={EVENT_TYPE_VARIANT[row.eventType]}>{row.eventType}</Badge> },
    { header: "Amount", cell: (row) => (row.amount != null ? `₹${row.amount}` : "—") },
    { header: "Message", cell: (row) => row.message ?? "—" },
  ];

  return (
    <>
      <ResourceTable<EventRow>
        title="QR Device Event Log"
        description="Every push/test/config/error event across tenant QR devices, for hardware and integration debugging."
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
            <div className="w-56">
              <Combobox
                options={businessOptions?.map((b) => ({ value: b.id, label: b.name })) ?? null}
                value={businessId}
                onValueChange={(v) => { setBusinessId(v); list.setPage(1); }}
                onOpenChange={(open) => open && ensureBusinessOptions()}
                placeholder="All businesses"
                searchPlaceholder="Search businesses..."
                emptyText="No businesses found."
              />
            </div>
            <Select value={eventType || "ALL"} onValueChange={(v) => { setEventType(v === "ALL" ? "" : v); list.setPage(1); }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Event type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All event types</SelectItem>
                <SelectItem value="CREATED">Created</SelectItem>
                <SelectItem value="CONFIG_UPDATED">Config Updated</SelectItem>
                <SelectItem value="PUSH_REQUESTED">Push Requested</SelectItem>
                <SelectItem value="TEST_TRIGGERED">Test Triggered</SelectItem>
                <SelectItem value="PAYMENT_CONFIRMED">Payment Confirmed</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        renderActions={(row) => (
          <RowActionsMenu actions={[{ label: "View Details", icon: Eye, onClick: () => setDetailTarget(row) }]} />
        )}
      />

      <Dialog open={!!detailTarget} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
            <DialogDescription>
              {detailTarget?.device.deviceName} · {detailTarget && new Date(detailTarget.createdAt * 1000).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {detailTarget && (
            <div className="grid gap-3 text-sm">
              <div>
                <div className="text-xs font-medium text-muted-foreground">AT Command</div>
                <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{detailTarget.atCommand || "—"}</pre>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">AT Response</div>
                <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{detailTarget.atResponse || "—"}</pre>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Payload</div>
                <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{detailTarget.payload || "—"}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
