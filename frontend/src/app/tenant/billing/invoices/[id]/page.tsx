"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Ban, LoaderCircle, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { useTenantSession } from "@/hooks/use-tenant-session";
import { formatDateOnly, formatDateTime } from "@/lib/datetime";
import {
  INVOICE_STATUS_BADGE,
  SUBSCRIPTION_STATUS_BADGE,
  formatMoney,
  type BillFor,
  type InvoiceStatus,
  type SubscriptionStatus,
} from "@/lib/billing";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";
import { cn } from "@/lib/utils";

interface Party {
  name: string;
  customerCode?: string;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  taxNumber?: string | null;
}

interface InvoiceItem {
  id: string;
  description: string;
  periodStart: number | null;
  periodEnd: number | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxName: string | null;
  taxAmount: number;
  lineTotal: number;
  subscription: {
    id: string;
    systemCode: string;
    status: SubscriptionStatus;
    planName: string;
    subscriptionFor: BillFor;
    currentPeriodStart: number | null;
    currentPeriodEnd: number | null;
    streamLimit: number | null;
    server: { id: string; name: string };
    stream: { id: string; name: string; title: string } | null;
  } | null;
}

interface Payment {
  id: string;
  systemCode: string;
  amount: number;
  paidAt: number;
  referenceNo: string | null;
  remark: string | null;
  status: "RECORDED" | "VOID";
  paymentMode: { id: string; paymentName: string };
}

interface InvoiceDetail {
  id: string;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  isOverdue: boolean;
  currency: string;
  issueDate: number | null;
  dueDate: number | null;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  notes: string | null;
  voidReason: string | null;
  voidedAt: number | null;
  billedTo: Party | null;
  billedFrom: Party | null;
  customer: { id: string; customerCode: string; name: string };
  items: InvoiceItem[];
  payments: Payment[];
  warnings?: string[];
}

interface PaymentForm {
  paymentModeId: string;
  amount: string;
  paidDate: string;
  referenceNo: string;
  remark: string;
}

const CANCELLABLE: InvoiceStatus[] = ["ISSUED", "PARTIALLY_PAID", "PAID"];

function PartyBlock({ title, party }: { title: string; party: Party | null }) {
  if (!party) return null;
  const locality = [party.city, party.state, party.pincode].filter(Boolean).join(", ");
  return (
    <div className="space-y-0.5 text-sm">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
      <div className="font-medium">{party.name}</div>
      {party.customerCode && <div className="text-muted-foreground">{party.customerCode}</div>}
      {[party.addressLine1, party.addressLine2, locality, party.country].filter(Boolean).map((line) => (
        <div key={line} className="text-muted-foreground">
          {line}
        </div>
      ))}
      {party.phone && <div className="text-muted-foreground">{party.phone}</div>}
      {party.email && <div className="text-muted-foreground">{party.email}</div>}
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

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const timezone = useAppTimezone();
  const { hasPermission } = useTenantSession();
  const canView = hasPermission("tenant-invoices:view");
  const canPay = hasPermission("tenant-payments:create");
  const canVoid = hasPermission("tenant-invoices:void");
  const canVoidPayments = hasPermission("tenant-payments:void");
  const searchParams = useSearchParams();
  const wantsCancel = searchParams?.get("cancel") === "1";

  const [invoice, setInvoice] = React.useState<InvoiceDetail | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [payOpen, setPayOpen] = React.useState(false);
  const [modes, setModes] = React.useState<{ id: string; paymentName: string }[] | null>(null);
  const [payForm, setPayForm] = React.useState<PaymentForm | null>(null);
  const [paying, setPaying] = React.useState(false);

  const [voidOpen, setVoidOpen] = React.useState(false);
  const [voidReason, setVoidReason] = React.useState("");
  const [voiding, setVoiding] = React.useState(false);

  const today = formatDateOnly(Math.floor(Date.now() / 1000), timezone);

  React.useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    tenantApi<InvoiceDetail>(`/tenant/invoices/${id}`)
      .then((data) => {
        if (cancelled) return;
        setInvoice(data);
        // Arriving from the list's Cancel action opens the dialog once.
        if (wantsCancel && CANCELLABLE.includes(data.status)) {
          setVoidReason("");
          setVoidOpen(true);
        }
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof TenantApiError ? error.message : "Failed to load the invoice");
      });
    return () => {
      cancelled = true;
    };
  }, [id, canView, wantsCancel]);

  function applyUpdate(updated: InvoiceDetail) {
    setInvoice(updated);
    updated.warnings?.forEach((warning) => toast.warning(warning));
  }

  function openPayment() {
    if (!invoice) return;
    setPayForm({ paymentModeId: "", amount: invoice.balanceDue.toFixed(2), paidDate: today, referenceNo: "", remark: "" });
    setPayOpen(true);
    if (!modes) {
      tenantApi<{ id: string; paymentName: string }[]>("/tenant/invoices/options/payment-modes")
        .then(setModes)
        .catch(() => {
          setModes([]);
          toast.error("Failed to load payment modes");
        });
    }
  }

  async function onRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice || !payForm) return;
    setPaying(true);
    try {
      const updated = await tenantApi<InvoiceDetail>(`/tenant/invoices/${invoice.id}/payments`, {
        method: "POST",
        body: {
          paymentModeId: payForm.paymentModeId,
          amount: Number(payForm.amount),
          paidDate: payForm.paidDate,
          referenceNo: payForm.referenceNo.trim() || null,
          remark: payForm.remark.trim() || null,
        },
      });
      toast.success(updated.status === "PAID" ? "Payment recorded — invoice paid in full" : "Payment recorded");
      applyUpdate(updated);
      setPayOpen(false);
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Could not record the payment");
    } finally {
      setPaying(false);
    }
  }

  async function onVoid(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setVoiding(true);
    try {
      const updated = await tenantApi<InvoiceDetail>(`/tenant/invoices/${invoice.id}/void`, {
        method: "POST",
        body: { reason: voidReason.trim() },
      });
      toast.success("Invoice cancelled");
      applyUpdate(updated);
      setVoidOpen(false);
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Could not cancel the invoice");
    } finally {
      setVoiding(false);
    }
  }

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invoice</CardTitle>
          <CardDescription>You don&apos;t have permission to view invoices.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Invoice</CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!invoice) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const money = (amount: number) => formatMoney(amount, invoice.currency);
  const payable = invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID";
  const hasPayments = invoice.payments.some((payment) => payment.status === "RECORDED");
  // Cancelling voids the payments too, which needs its own permission.
  const voidable = CANCELLABLE.includes(invoice.status) && (!hasPayments || canVoidPayments);
  const status = INVOICE_STATUS_BADGE[invoice.status];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/tenant/billing/invoices">
            <ArrowLeft className="size-4" /> Invoices
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{invoice.invoiceNumber ?? "Draft invoice"}</h1>
        <Badge variant={status.variant}>{status.label}</Badge>
        {invoice.isOverdue && <Badge variant="destructive">Overdue</Badge>}
        <div className="ml-auto flex flex-wrap gap-2">
          {canPay && payable && (
            <Button onClick={openPayment}>
              <Wallet className="size-4" /> Record payment
            </Button>
          )}
          {canVoid && voidable && (
            <Button
              variant="outline"
              onClick={() => {
                setVoidReason("");
                setVoidOpen(true);
              }}
            >
              <Ban className="size-4" /> Cancel invoice
            </Button>
          )}
        </div>
      </div>

      {invoice.status === "VOID" && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Cancelled on {formatDateOnly(invoice.voidedAt, timezone)}
          {invoice.voidReason ? `: ${invoice.voidReason}` : ""}
        </div>
      )}

      <Card>
        <CardContent className="grid gap-6 p-6">
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
              <div>
                <span className="text-muted-foreground">Currency </span>
                {invoice.currency}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 pr-4 font-medium">Period</th>
                  <th className="py-2 pr-4 text-right font-medium">Price</th>
                  <th className="py-2 pr-4 text-right font-medium">Discount</th>
                  <th className="py-2 pr-4 text-right font-medium">Tax</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id} className="border-b align-top">
                    <td className="py-3 pr-4">{item.description}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {item.periodStart !== null ? (
                        <>
                          {formatDateTime(item.periodStart, timezone)} → {formatDateTime(item.periodEnd, timezone)}
                          <div className="text-xs text-muted-foreground">Expires {formatDateTime(item.periodEnd, timezone)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">{money(item.unitPrice * item.quantity)}</td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">{item.discount > 0 ? money(item.discount) : "—"}</td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap">
                      {money(item.taxAmount)}
                      {item.taxName && <div className="text-xs text-muted-foreground">{item.taxName}</div>}
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
            <TotalRow label="Paid" value={money(invoice.amountPaid)} />
            <TotalRow label="Balance due" value={money(invoice.balanceDue)} strong />
          </div>

          {invoice.notes && <p className="text-sm whitespace-pre-line text-muted-foreground">{invoice.notes}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {invoice.items.filter((item) => item.subscription).length === 0 && (
              <p className="text-sm text-muted-foreground">No subscription on this invoice.</p>
            )}
            {invoice.items.map((item) => {
              const sub = item.subscription;
              if (!sub) return null;
              const subStatus = SUBSCRIPTION_STATUS_BADGE[sub.status];
              return (
                <div key={item.id} className="grid gap-1 rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{sub.planName}</span>
                    <Badge variant="outline">{sub.subscriptionFor === "STREAM" ? "Stream" : "Server"}</Badge>
                    <Badge variant={subStatus.variant}>{subStatus.label}</Badge>
                  </div>
                  <div className="text-muted-foreground">
                    {sub.stream ? `${sub.stream.title} (${sub.stream.name}) on ${sub.server.name}` : sub.server.name}
                    {sub.subscriptionFor === "SERVER" && ` · stream limit ${sub.streamLimit ?? "unlimited"}`}
                  </div>
                  <div>
                    {sub.currentPeriodEnd !== null ? (
                      <>
                        Active {formatDateTime(sub.currentPeriodStart, timezone)} → expires{" "}
                        <span className="font-medium">{formatDateTime(sub.currentPeriodEnd, timezone)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Starts once this invoice is paid.</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent>
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded.</p>
            ) : (
              <div className="grid gap-2">
                {invoice.payments.map((payment) => (
                  <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                    <div>
                      <div className="font-medium">{money(payment.amount)}</div>
                      <div className="text-xs text-muted-foreground">
                        {payment.paymentMode.paymentName} · {formatDateOnly(payment.paidAt, timezone)}
                        {payment.referenceNo ? ` · Ref ${payment.referenceNo}` : ""}
                      </div>
                      {payment.remark && <div className="text-xs text-muted-foreground">{payment.remark}</div>}
                    </div>
                    {payment.status === "VOID" && <Badge variant="outline">Void</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          {payForm && (
            <form onSubmit={onRecordPayment}>
              <DialogHeader>
                <DialogTitle>Record payment</DialogTitle>
                <DialogDescription>
                  Balance due {money(invoice.balanceDue)}. Any payment activates the subscription.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Payment mode</Label>
                  <Select
                    value={payForm.paymentModeId}
                    onValueChange={(value) => setPayForm((f) => (f ? { ...f, paymentModeId: value } : f))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={modes === null ? "Loading..." : modes.length ? "Select a mode" : "No active payment modes"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(modes ?? []).map((mode) => (
                        <SelectItem key={mode.id} value={mode.id}>
                          {mode.paymentName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Amount ({invoice.currency})</Label>
                    <Input
                      id="amount"
                      type="number"
                      min={0.01}
                      max={invoice.balanceDue}
                      step="0.01"
                      required
                      value={payForm.amount}
                      onChange={(e) => setPayForm((f) => (f ? { ...f, amount: e.target.value } : f))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="paidDate">Paid on</Label>
                    <Input
                      id="paidDate"
                      type="date"
                      max={today}
                      required
                      value={payForm.paidDate}
                      onChange={(e) => setPayForm((f) => (f ? { ...f, paidDate: e.target.value } : f))}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="referenceNo">Reference no.</Label>
                  <Input
                    id="referenceNo"
                    maxLength={100}
                    placeholder="UPI reference, cheque number..."
                    value={payForm.referenceNo}
                    onChange={(e) => setPayForm((f) => (f ? { ...f, referenceNo: e.target.value } : f))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="remark">Remark</Label>
                  <Input
                    id="remark"
                    maxLength={255}
                    value={payForm.remark}
                    onChange={(e) => setPayForm((f) => (f ? { ...f, remark: e.target.value } : f))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPayOpen(false)} disabled={paying}>
                  Cancel
                </Button>
                <Button type="submit" disabled={paying || !payForm.paymentModeId || !payForm.amount}>
                  {paying && <LoaderCircle className="size-4 animate-spin" />}
                  Record payment
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <form onSubmit={onVoid}>
            <DialogHeader>
              <DialogTitle>Cancel invoice {invoice.invoiceNumber}</DialogTitle>
              <DialogDescription>
                The number stays used and cannot be reissued. A subscription this invoice opened is cancelled, and a
                renewal it added is rolled back.
                {hasPayments && " Its recorded payments are voided too, along with their income entries."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="voidReason">Reason</Label>
              <Textarea
                id="voidReason"
                rows={3}
                minLength={3}
                maxLength={255}
                required
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVoidOpen(false)} disabled={voiding}>
                Keep invoice
              </Button>
              <Button type="submit" variant="destructive" disabled={voiding || voidReason.trim().length < 3}>
                {voiding && <LoaderCircle className="size-4 animate-spin" />}
                Cancel invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
