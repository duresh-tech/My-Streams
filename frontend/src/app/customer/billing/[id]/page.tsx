"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { formatDateOnly, formatDateTime } from "@/lib/datetime";
import { INVOICE_STATUS_BADGE, formatMoney } from "@/lib/billing";
import {
  customerApi,
  CustomerApiError,
  type CustomerInvoiceDetail,
  type CustomerInvoiceParty,
} from "@/lib/customer-api";
import { cn } from "@/lib/utils";

function PartyBlock({ title, party }: { title: string; party: CustomerInvoiceParty | null }) {
  if (!party) return null;
  const locality = [party.city, party.state, party.pincode].filter(Boolean).join(", ");
  return (
    <div className="space-y-0.5 text-sm">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</div>
      <div className="font-medium">{party.name}</div>
      {[party.addressLine1, party.addressLine2, locality, party.country, party.phone, party.email]
        .filter(Boolean)
        .map((line) => (
          <div key={line} className="text-muted-foreground">
            {line}
          </div>
        ))}
      {party.taxNumber && <div className="text-muted-foreground">Tax no. {party.taxNumber}</div>}
    </div>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-6 text-sm", strong && "text-base font-semibold")}>
      <span className={strong ? undefined : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function CustomerInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const timezone = useAppTimezone();
  const [invoice, setInvoice] = React.useState<CustomerInvoiceDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    customerApi<CustomerInvoiceDetail>(`/customer/billing/invoices/${id}`)
      .then(setInvoice)
      .catch((err) => setError(err instanceof CustomerApiError ? err.message : "Could not load the invoice"));
  }, [id]);

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (!invoice) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle className="size-4 animate-spin" /> Loading the invoice...
      </div>
    );
  }

  const money = (amount: number) => formatMoney(amount, invoice.currency);
  const status = INVOICE_STATUS_BADGE[invoice.status];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/customer/billing">
            <ArrowLeft className="size-4" /> My Bills
          </Link>
        </Button>
        <h1 className="text-xl font-semibold sm:text-2xl">{invoice.invoiceNumber ?? "Invoice"}</h1>
        <Badge variant={status.variant}>{status.label}</Badge>
        {invoice.isOverdue && <Badge variant="destructive">Overdue</Badge>}
      </div>

      {invoice.status === "VOID" && (
        <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-3 text-sm">
          This invoice was cancelled on {formatDateOnly(invoice.voidedAt, timezone)} and nothing is owed on it.
        </div>
      )}

      <Card>
        <CardContent className="grid gap-6 p-4 sm:p-6">
          <div className="grid gap-6 sm:grid-cols-3">
            <PartyBlock title="From" party={invoice.billedFrom} />
            <PartyBlock title="Billed to" party={invoice.billedTo} />
            <div className="space-y-1 text-sm sm:text-right">
              <div>
                <span className="text-muted-foreground">Issued </span>
                {formatDateOnly(invoice.issueDate, timezone)}
              </div>
              <div>
                <span className="text-muted-foreground">Due </span>
                {formatDateOnly(invoice.dueDate, timezone)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 pr-4 font-medium">Period</th>
                  <th className="py-2 pr-4 text-right font-medium">Price</th>
                  <th className="py-2 pr-4 text-right font-medium">Tax</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id} className="border-b align-top">
                    <td className="py-3 pr-4">{item.description}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {item.periodStart !== null
                        ? `${formatDateTime(item.periodStart, timezone)} → ${formatDateTime(item.periodEnd, timezone)}`
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      {money(item.unitPrice * item.quantity)}
                      {item.quantity > 1 && (
                        <div className="text-muted-foreground text-xs">
                          {item.quantity} × {money(item.unitPrice)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      {money(item.taxAmount)}
                      {item.taxName && <div className="text-muted-foreground text-xs">{item.taxName}</div>}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">{money(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto grid w-full max-w-xs gap-2">
            <TotalRow label="Subtotal" value={money(invoice.subtotal)} />
            {invoice.discountTotal > 0 && <TotalRow label="Discount" value={`− ${money(invoice.discountTotal)}`} />}
            <TotalRow label="Tax" value={money(invoice.taxTotal)} />
            <Separator />
            <TotalRow label="Total" value={money(invoice.grandTotal)} strong />
            {invoice.status !== "VOID" && (
              <>
                <TotalRow label="Paid" value={money(invoice.amountPaid)} />
                <TotalRow label="Balance due" value={money(invoice.balanceDue)} strong />
              </>
            )}
          </div>

          {invoice.notes && <p className="text-muted-foreground text-sm whitespace-pre-line">{invoice.notes}</p>}
        </CardContent>
      </Card>

      {invoice.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {invoice.payments.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span className="font-medium">{money(payment.amount)}</span>
                <span className="text-muted-foreground text-xs">
                  {payment.paymentMode} · {formatDateOnly(payment.paidAt, timezone)}
                  {payment.referenceNo ? ` · Ref ${payment.referenceNo}` : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
