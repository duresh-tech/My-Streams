"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { formatDateOnly } from "@/lib/datetime";
import { INVOICE_STATUS_BADGE, formatMoney } from "@/lib/billing";
import { customerApi, CustomerApiError, type CustomerInvoiceSummary } from "@/lib/customer-api";

export default function CustomerBillingPage() {
  const timezone = useAppTimezone();
  const [invoices, setInvoices] = React.useState<CustomerInvoiceSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    customerApi<CustomerInvoiceSummary[]>("/customer/billing/invoices")
      .then(setInvoices)
      .catch((err) => setError(err instanceof CustomerApiError ? err.message : "Could not load your bills"));
  }, []);

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (!invoices) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <LoaderCircle className="size-4 animate-spin" /> Loading your bills...
      </div>
    );
  }

  // Grouped by currency: a business bills in one, but a sum across two would be meaningless.
  const due = invoices.reduce<Record<string, number>>((totals, invoice) => {
    if (invoice.balanceDue > 0) totals[invoice.currency] = (totals[invoice.currency] ?? 0) + invoice.balanceDue;
    return totals;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">My Bills</h1>
        <p className="text-muted-foreground text-sm">Your invoices and what is still due on them.</p>
      </div>

      {Object.keys(due).length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 p-4">
            <span className="text-muted-foreground text-sm">Total due</span>
            {Object.entries(due).map(([currency, amount]) => (
              <span key={currency} className="text-lg font-semibold">
                {formatMoney(amount, currency)}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground p-6 text-sm">You have no invoices yet.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {invoices.map((invoice) => {
            const status = INVOICE_STATUS_BADGE[invoice.status];
            return (
              <Link key={invoice.id} href={`/customer/billing/${invoice.id}`} className="block">
                <Card className="hover:bg-accent/50 transition-colors">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{invoice.invoiceNumber ?? "Invoice"}</span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {invoice.isOverdue && <Badge variant="destructive">Overdue</Badge>}
                      </div>
                      {invoice.description && (
                        <div className="text-muted-foreground truncate text-sm">{invoice.description}</div>
                      )}
                      <div className="text-muted-foreground text-xs">
                        Issued {formatDateOnly(invoice.issueDate, timezone)}
                        {invoice.balanceDue > 0 && ` · Due ${formatDateOnly(invoice.dueDate, timezone)}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatMoney(invoice.grandTotal, invoice.currency)}</div>
                      {invoice.balanceDue > 0 && (
                        <div className="text-xs text-amber-600 dark:text-amber-400">
                          {formatMoney(invoice.balanceDue, invoice.currency)} due
                        </div>
                      )}
                    </div>
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
