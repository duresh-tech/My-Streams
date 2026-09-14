"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Eye, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useTenantSession } from "@/hooks/use-tenant-session";
import { formatDateOnly } from "@/lib/datetime";
import { INVOICE_STATUS_BADGE, formatMoney, type InvoiceStatus } from "@/lib/billing";
import { tenantApi } from "@/lib/tenant-api";

interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  isOverdue: boolean;
  currency: string;
  issueDate: number | null;
  dueDate: number | null;
  grandTotal: number;
  balanceDue: number;
  customer: { id: string; customerCode: string; name: string };
}

const ALL = "ALL";

export default function TenantInvoicesPage() {
  const router = useRouter();
  const timezone = useAppTimezone();
  const { hasPermission } = useTenantSession();
  const canCreate = hasPermission("tenant-invoices:create");
  const canView = hasPermission("tenant-invoices:view");
  const canCancel = hasPermission("tenant-invoices:void");

  const [statusFilter, setStatusFilter] = React.useState(ALL);
  const list = useResourceList<InvoiceRow>(
    "/tenant/invoices",
    { status: statusFilter === ALL ? undefined : statusFilter },
    tenantApi,
  );

  const columns: Column<InvoiceRow>[] = [
    {
      header: "Invoice",
      cell: (row) =>
        canView ? (
          <Link href={`/tenant/billing/invoices/${row.id}`} className="font-medium hover:underline">
            {row.invoiceNumber ?? "Draft"}
          </Link>
        ) : (
          <span className="font-medium">{row.invoiceNumber ?? "Draft"}</span>
        ),
    },
    {
      header: "Customer",
      cell: (row) => (
        <div>
          <div>{row.customer.name}</div>
          <div className="text-xs text-muted-foreground">{row.customer.customerCode}</div>
        </div>
      ),
    },
    { header: "Issued", cell: (row) => formatDateOnly(row.issueDate, timezone) },
    { header: "Due", cell: (row) => formatDateOnly(row.dueDate, timezone) },
    { header: "Total", cell: (row) => formatMoney(row.grandTotal, row.currency) },
    { header: "Balance", cell: (row) => formatMoney(row.balanceDue, row.currency) },
    {
      header: "Status",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant={INVOICE_STATUS_BADGE[row.status].variant}>{INVOICE_STATUS_BADGE[row.status].label}</Badge>
          {row.isOverdue && <Badge variant="destructive">Overdue</Badge>}
        </div>
      ),
    },
  ];

  return (
    <ResourceTable<InvoiceRow>
      title="Invoices"
      description="Invoices for the streams and servers assigned to your customers."
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {(Object.keys(INVOICE_STATUS_BADGE) as InvoiceStatus[])
                .filter((status) => status !== "DRAFT")
                .map((status) => (
                  <SelectItem key={status} value={status}>
                    {INVOICE_STATUS_BADGE[status].label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {canCreate && (
            <Button asChild>
              <Link href="/tenant/billing/invoices/new">
                <Plus className="size-4" /> New invoice
              </Link>
            </Button>
          )}
        </div>
      }
      renderActions={
        canView
          ? (row) => (
              <RowActionsMenu
                actions={[
                  { label: "View", icon: Eye, onClick: () => router.push(`/tenant/billing/invoices/${row.id}`) },
                  // The reason and the payment rules live on the detail page, which opens its dialog.
                  ...(canCancel && row.status !== "VOID" && row.status !== "DRAFT"
                    ? [
                        {
                          label: "Cancel",
                          icon: Ban,
                          destructive: true,
                          onClick: () => router.push(`/tenant/billing/invoices/${row.id}?cancel=1`),
                        },
                      ]
                    : []),
                ]}
              />
            )
          : undefined
      }
    />
  );
}
