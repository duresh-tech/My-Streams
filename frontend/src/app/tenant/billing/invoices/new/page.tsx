"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarClock, LoaderCircle, Radio, Server, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
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
  durationLabel,
  formatMoney,
  type BillFor,
  type BillableSubscription,
  type DurationUnit,
} from "@/lib/billing";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";
import { cn } from "@/lib/utils";

interface PlanOption {
  id: string;
  name: string;
  subscriptionFor: BillFor;
  durationValue: number;
  durationUnit: DurationUnit;
  customerPrice: number;
  orginalPrice: number;
  maxServerStream: number | null;
  maxPlaySession: number | null;
}

interface TaxOption {
  id: string;
  taxName: string;
  calculationType: "PERCENTAGE" | "FIXED";
  value: number;
}

interface InvoiceOptions {
  currency: string;
  activateOn: "PAYMENT" | "ISSUE";
  invoiceDueDays: number;
  defaultTaxTypeId: string | null;
  plans: PlanOption[];
  taxTypes: TaxOption[];
}

interface CustomerOption {
  id: string;
  customerCode: string;
  name: string;
  primaryMobile: string;
}

interface BillableServer {
  assignmentId: string;
  serverName: string;
  streamLimit: number | null;
  streamsUsed: number;
  isDedicated: boolean;
  subscription: BillableSubscription | null;
}

interface BillableStream {
  streamId: string;
  name: string;
  title: string;
  serverName: string;
  disabled: boolean;
  subscription: BillableSubscription | null;
}

interface Billables {
  servers: BillableServer[];
  streams: BillableStream[];
}

interface Preview {
  kind: "NEW" | "RENEWAL";
  periods: number;
  plan: { id: string; name: string; durationValue: number; durationUnit: DurationUnit };
  periodStart: number;
  periodEnd: number;
  currency: string;
  line: { description: string; unitPrice: number; discount: number; taxName: string | null; taxAmount: number; lineTotal: number };
  totals: { subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number };
  dueDate: number;
  activateOn: "PAYMENT" | "ISSUE";
  streamLimit?: number | null;
  warnings: string[];
}

/** Select items cannot carry an empty value, so the two non-id tax choices need sentinels. */
const TAX_DEFAULT = "default";
const TAX_NONE = "none";

function taxLabel(tax: TaxOption): string {
  return tax.calculationType === "PERCENTAGE" ? `${tax.taxName} (${tax.value}%)` : `${tax.taxName} (${tax.value} fixed)`;
}

function SubscriptionBadge({ subscription, timezone }: { subscription: BillableSubscription | null; timezone: string }) {
  if (!subscription) return <Badge variant="outline">Not billed yet</Badge>;
  switch (subscription.status) {
    case "PENDING_PAYMENT":
      return <Badge variant="warning">Unpaid {subscription.openInvoice?.invoiceNumber ?? ""}</Badge>;
    case "ACTIVE":
      return <Badge variant="success">Active until {formatDateTime(subscription.currentPeriodEnd, timezone)}</Badge>;
    case "PAST_DUE":
      return <Badge variant="destructive">Expired {formatDateTime(subscription.currentPeriodEnd, timezone)}</Badge>;
    default:
      return <Badge variant="destructive">Suspended</Badge>;
  }
}

function TargetOption({
  selected,
  onSelect,
  icon: Icon,
  title,
  subtitle,
  subscription,
  timezone,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  subscription: BillableSubscription | null;
  timezone: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full flex-wrap items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <SubscriptionBadge subscription={subscription} timezone={timezone} />
    </button>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 text-sm", strong && "text-base font-semibold")}>
      <span className={strong ? undefined : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function NewInvoicePage() {
  const router = useRouter();
  const timezone = useAppTimezone();
  const { hasPermission } = useTenantSession();
  const canCreate = hasPermission("tenant-invoices:create");
  const canDiscount = hasPermission("tenant-invoices:add_discount");
  const canPay = hasPermission("tenant-payments:create");

  const [options, setOptions] = React.useState<InvoiceOptions | null>(null);
  const [customers, setCustomers] = React.useState<CustomerOption[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [customerId, setCustomerId] = React.useState("");
  const [billables, setBillables] = React.useState<Billables | null>(null);
  const [loadingBillables, setLoadingBillables] = React.useState(false);
  const [billFor, setBillFor] = React.useState<BillFor>("STREAM");
  const [targetId, setTargetId] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [taxChoice, setTaxChoice] = React.useState(TAX_DEFAULT);
  const [discount, setDiscount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [periods, setPeriods] = React.useState("1");

  const [collect, setCollect] = React.useState(false);
  const [modes, setModes] = React.useState<{ id: string; paymentName: string }[] | null>(null);
  const [payModeId, setPayModeId] = React.useState("");
  const [payAmount, setPayAmount] = React.useState("");
  const [payDate, setPayDate] = React.useState("");
  const [payReference, setPayReference] = React.useState("");

  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  // "Today" in the business's timezone, not the browser's.
  const today = formatDateOnly(Math.floor(Date.now() / 1000), timezone);

  React.useEffect(() => {
    if (!canCreate) return;
    let cancelled = false;
    Promise.all([
      tenantApi<InvoiceOptions>("/tenant/invoices/options"),
      tenantApi<CustomerOption[]>("/tenant/invoices/options/customers"),
    ])
      .then(([opts, list]) => {
        if (cancelled) return;
        setOptions(opts);
        setCustomers(list);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof TenantApiError ? error.message : "Failed to load billing options");
      });
    return () => {
      cancelled = true;
    };
  }, [canCreate]);

  function onCustomerChange(id: string) {
    setCustomerId(id);
    setTargetId("");
    setPlanId("");
    setBillables(null);
    if (!id) return;
    setLoadingBillables(true);
    tenantApi<Billables>(`/tenant/invoices/options/customers/${id}/billables`)
      .then(setBillables)
      .catch((error) => toast.error(error instanceof TenantApiError ? error.message : "Failed to load the customer's servers"))
      .finally(() => setLoadingBillables(false));
  }

  function onBillForChange(value: BillFor) {
    setBillFor(value);
    setTargetId("");
    setPlanId("");
  }

  function onCollectChange(next: boolean) {
    setCollect(next);
    if (next && !modes) {
      tenantApi<{ id: string; paymentName: string }[]>("/tenant/invoices/options/payment-modes")
        .then(setModes)
        .catch(() => {
          setModes([]);
          toast.error("Failed to load payment modes");
        });
    }
  }

  const subscription =
    (billFor === "SERVER"
      ? billables?.servers.find((s) => s.assignmentId === targetId)?.subscription
      : billables?.streams.find((s) => s.streamId === targetId)?.subscription) ?? null;
  const unpaid = subscription?.status === "PENDING_PAYMENT";
  const isRenewal = !!subscription && !unpaid;
  const plansForType = options?.plans.filter((plan) => plan.subscriptionFor === billFor) ?? [];

  const discountValue = discount.trim() === "" ? undefined : Number(discount);
  const periodCount = Number(periods);
  const periodsValid = Number.isInteger(periodCount) && periodCount >= 1 && periodCount <= 24;
  const draft = React.useMemo(() => {
    if (!customerId || !targetId || unpaid || !periodsValid) return null;
    if (!isRenewal && !planId) return null;
    return {
      customerId,
      billFor,
      ...(billFor === "SERVER" ? { assignmentId: targetId } : { streamId: targetId }),
      periods: periodCount,
      ...(isRenewal ? {} : { planId, startDate: startDate || today }),
      ...(taxChoice === TAX_DEFAULT ? {} : { taxTypeId: taxChoice === TAX_NONE ? null : taxChoice }),
      ...(discountValue !== undefined && Number.isFinite(discountValue) && discountValue > 0
        ? { discount: discountValue }
        : {}),
    };
  }, [customerId, targetId, unpaid, periodsValid, isRenewal, planId, billFor, periodCount, startDate, today, taxChoice, discountValue]);
  const draftKey = draft ? JSON.stringify(draft) : "";

  // Every figure on the page comes from the server, so the summary always
  // matches what will be issued.
  React.useEffect(() => {
    if (!draftKey) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(() => {
      tenantApi<Preview>("/tenant/invoices/preview", { method: "POST", body: JSON.parse(draftKey) })
        .then((data) => {
          if (cancelled) return;
          setPreview(data);
          setPreviewError(null);
        })
        .catch((error) => {
          if (cancelled) return;
          setPreview(null);
          setPreviewError(error instanceof TenantApiError ? error.message : "Could not calculate the invoice");
        })
        .finally(() => !cancelled && setPreviewing(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draftKey]);

  async function onCreate() {
    if (!draft) return;
    setCreating(true);
    try {
      const payment =
        collect && preview
          ? {
              paymentModeId: payModeId,
              amount: payAmount.trim() === "" ? preview.totals.grandTotal : Number(payAmount),
              paidDate: payDate || today,
              referenceNo: payReference.trim() || null,
            }
          : undefined;
      const invoice = await tenantApi<{ id: string; invoiceNumber: string; warnings: string[] }>("/tenant/invoices", {
        method: "POST",
        body: { ...draft, notes: notes.trim() || null, ...(payment ? { payment } : {}) },
      });
      toast.success(
        payment ? `Invoice ${invoice.invoiceNumber} issued and payment recorded` : `Invoice ${invoice.invoiceNumber} issued`,
      );
      invoice.warnings.forEach((warning) => toast.warning(warning));
      router.push(`/tenant/billing/invoices/${invoice.id}`);
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Could not create the invoice");
      setCreating(false);
    }
  }

  if (!canCreate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">New invoice</CardTitle>
          <CardDescription>You don&apos;t have permission to create invoices.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">New invoice</CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!options) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const targets = billFor === "SERVER" ? billables?.servers ?? [] : billables?.streams ?? [];
  const selectedPlan = plansForType.find((plan) => plan.id === planId);
  const periodPlan = isRenewal ? options.plans.find((plan) => plan.id === subscription?.planId) : selectedPlan;
  const payNow = preview ? (payAmount.trim() === "" ? preview.totals.grandTotal : Number(payAmount) || 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/tenant/billing/invoices">
            <ArrowLeft className="size-4" /> Invoices
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">New invoice</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Customer</CardTitle>
              <CardDescription>Only customers with a stream or an assigned server can be billed.</CardDescription>
            </CardHeader>
            <CardContent>
              <Combobox
                options={customers?.map((c) => ({ value: c.id, label: `${c.name} · ${c.customerCode} · ${c.primaryMobile}` })) ?? null}
                value={customerId}
                onValueChange={onCustomerChange}
                placeholder="Select a customer"
                searchPlaceholder="Search by name, code or mobile..."
                emptyText="No customer with a stream or an assigned server."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. What to bill</CardTitle>
              <CardDescription>
                Each invoice bills one target: a stream plan bills a single stream, a server plan bills a single
                assigned server and sets its stream limit.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="inline-flex w-fit rounded-lg border p-1">
                {(["STREAM", "SERVER"] as BillFor[]).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={billFor === value ? "default" : "ghost"}
                    onClick={() => onBillForChange(value)}
                  >
                    {value === "STREAM" ? <Radio className="size-4" /> : <Server className="size-4" />}
                    {value === "STREAM" ? "Stream" : "Server"}
                  </Button>
                ))}
              </div>

              {!customerId ? (
                <p className="text-sm text-muted-foreground">Choose a customer first.</p>
              ) : loadingBillables ? (
                <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
              ) : targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {billFor === "STREAM"
                    ? "This customer has no streams."
                    : "This customer has no active server assignment."}
                </p>
              ) : billFor === "SERVER" ? (
                billables!.servers.map((server) => (
                  <TargetOption
                    key={server.assignmentId}
                    selected={targetId === server.assignmentId}
                    onSelect={() => setTargetId(server.assignmentId)}
                    icon={Server}
                    title={server.serverName}
                    subtitle={`${server.streamsUsed} / ${server.streamLimit ?? "∞"} streams${server.isDedicated ? " · Dedicated" : ""}`}
                    subscription={server.subscription}
                    timezone={timezone}
                  />
                ))
              ) : (
                billables!.streams.map((stream) => (
                  <TargetOption
                    key={stream.streamId}
                    selected={targetId === stream.streamId}
                    onSelect={() => setTargetId(stream.streamId)}
                    icon={Radio}
                    title={stream.title}
                    subtitle={`${stream.name} · ${stream.serverName}${stream.disabled ? " · Disabled" : ""}`}
                    subscription={stream.subscription}
                    timezone={timezone}
                  />
                ))
              )}

              {unpaid && subscription?.openInvoice && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <span>
                    Invoice{" "}
                    <Link href={`/tenant/billing/invoices/${subscription.openInvoice.id}`} className="font-medium underline">
                      {subscription.openInvoice.invoiceNumber}
                    </Link>{" "}
                    is still unpaid. Collect or void it before billing this again.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Plan and period</CardTitle>
              <CardDescription>The expiry date is calculated from the plan&apos;s duration.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {isRenewal && subscription ? (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  Renewal of <span className="font-medium">{subscription.planName}</span>. The new period starts when the
                  current one ends ({formatDateTime(subscription.currentPeriodEnd, timezone)}), at the price the customer
                  subscribed at.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <div className="grid gap-2">
                    <Label>Plan</Label>
                    <Select value={planId} onValueChange={setPlanId} disabled={!targetId || unpaid}>
                      <SelectTrigger>
                        <SelectValue placeholder={plansForType.length ? "Select a plan" : `No active ${billFor.toLowerCase()} plans`} />
                      </SelectTrigger>
                      <SelectContent>
                        {plansForType.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name} · {durationLabel(plan.durationValue, plan.durationUnit)} ·{" "}
                            {formatMoney(plan.customerPrice, options.currency)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedPlan && (
                      <p className="text-xs text-muted-foreground">
                        {selectedPlan.subscriptionFor === "SERVER"
                          ? `Up to ${selectedPlan.maxServerStream ?? "unlimited"} streams on the server`
                          : `Up to ${selectedPlan.maxPlaySession ?? "unlimited"} concurrent viewers`}
                        {selectedPlan.orginalPrice > selectedPlan.customerPrice &&
                          ` · MRP ${formatMoney(selectedPlan.orginalPrice, options.currency)}`}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="startDate">Starts on</Label>
                    <Input
                      id="startDate"
                      type="date"
                      min={today}
                      value={startDate || today}
                      onChange={(e) => setStartDate(e.target.value)}
                      disabled={!targetId || unpaid}
                    />
                    <p className="text-xs text-muted-foreground">
                      Today starts at the moment the invoice activates; a later date starts at its midnight.
                    </p>
                  </div>
                </div>
              )}
              <div className="grid gap-2 sm:max-w-xs">
                <Label htmlFor="periods">Periods to bill</Label>
                <Input
                  id="periods"
                  type="number"
                  min={1}
                  max={24}
                  step={1}
                  value={periods}
                  onChange={(e) => setPeriods(e.target.value)}
                  disabled={!targetId || unpaid}
                />
                <p className={cn("text-xs", periodsValid ? "text-muted-foreground" : "text-destructive")}>
                  {!periodsValid
                    ? "Enter a whole number from 1 to 24."
                    : periodCount === 1
                      ? "Bill more than one period to invoice in advance."
                      : `Bills ${periodCount} periods${
                          periodPlan
                            ? ` (${durationLabel(periodPlan.durationValue * periodCount, periodPlan.durationUnit)})`
                            : ""
                        } ahead on one invoice.`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Charges</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Tax</Label>
                  <Select value={taxChoice} onValueChange={setTaxChoice}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TAX_DEFAULT}>
                        Business default
                        {options.defaultTaxTypeId
                          ? ` (${options.taxTypes.find((t) => t.id === options.defaultTaxTypeId)?.taxName ?? "set"})`
                          : " (none)"}
                      </SelectItem>
                      <SelectItem value={TAX_NONE}>No tax</SelectItem>
                      {options.taxTypes.map((tax) => (
                        <SelectItem key={tax.id} value={tax.id}>
                          {taxLabel(tax)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {canDiscount && (
                  <div className="grid gap-2">
                    <Label htmlFor="discount">Discount ({options.currency})</Label>
                    <Input
                      id="discount"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Printed on the invoice"
                />
              </div>
            </CardContent>
          </Card>

          {canPay && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">5. Payment</CardTitle>
                <CardDescription>
                  Optionally record what the customer pays now. A part payment is allowed; any payment activates the
                  subscription.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <label className="flex w-fit items-center gap-2 text-sm font-medium">
                  <Checkbox checked={collect} onCheckedChange={(value) => onCollectChange(value === true)} />
                  <Wallet className="size-4 text-muted-foreground" />
                  Collect payment now
                </label>
                {collect && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Payment mode</Label>
                      <Select value={payModeId} onValueChange={setPayModeId}>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={modes === null ? "Loading..." : modes.length ? "Select a mode" : "No active payment modes"}
                          />
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
                    <div className="grid gap-2">
                      <Label htmlFor="payAmount">Amount ({options.currency})</Label>
                      <Input
                        id="payAmount"
                        type="number"
                        min={0.01}
                        step="0.01"
                        placeholder={preview ? preview.totals.grandTotal.toFixed(2) : "Full total"}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="payDate">Paid on</Label>
                      <Input
                        id="payDate"
                        type="date"
                        max={today}
                        value={payDate || today}
                        onChange={(e) => setPayDate(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="payReference">Reference no.</Label>
                      <Input
                        id="payReference"
                        maxLength={100}
                        placeholder="UPI reference, cheque number..."
                        value={payReference}
                        onChange={(e) => setPayReference(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="text-base">Invoice summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!draft ? (
              <p className="text-sm text-muted-foreground">
                {unpaid ? "Settle the unpaid invoice first." : "Choose a customer, what to bill and a plan to calculate the invoice."}
              </p>
            ) : previewError ? (
              <p className="text-sm text-destructive">{previewError}</p>
            ) : !preview ? (
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    <CalendarClock className="size-3.5" />
                    {preview.kind === "RENEWAL" ? "Renewal period" : "Service period"}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Starts</div>
                      <div className="font-medium">{formatDateTime(preview.periodStart, timezone)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Expires</div>
                      <div className="font-semibold">{formatDateTime(preview.periodEnd, timezone)}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {preview.plan.name} · {durationLabel(preview.plan.durationValue, preview.plan.durationUnit)}
                  </div>
                </div>

                <div className="grid gap-2">
                  <SummaryRow
                    label={preview.periods > 1 ? `Plan price × ${preview.periods}` : "Plan price"}
                    value={formatMoney(preview.totals.subtotal, preview.currency)}
                  />
                  {preview.totals.discountTotal > 0 && (
                    <SummaryRow label="Discount" value={`− ${formatMoney(preview.totals.discountTotal, preview.currency)}`} />
                  )}
                  <SummaryRow
                    label={preview.line.taxName ? `Tax · ${preview.line.taxName}` : "Tax"}
                    value={formatMoney(preview.totals.taxTotal, preview.currency)}
                  />
                  <Separator />
                  <SummaryRow label="Total" value={formatMoney(preview.totals.grandTotal, preview.currency)} strong />
                  {collect && (
                    <>
                      <SummaryRow label="Paying now" value={formatMoney(payNow, preview.currency)} />
                      <SummaryRow
                        label="Balance after"
                        value={formatMoney(Math.max(0, preview.totals.grandTotal - payNow), preview.currency)}
                      />
                    </>
                  )}
                </div>

                <div className="grid gap-1 text-xs text-muted-foreground">
                  <span>Payment due {formatDateOnly(preview.dueDate, timezone)}</span>
                  <span>
                    {preview.totals.grandTotal === 0
                      ? "Nothing to collect: the subscription activates immediately."
                      : preview.activateOn === "ISSUE"
                        ? "The subscription activates as soon as the invoice is issued."
                        : "The subscription activates as soon as any payment is recorded."}
                  </span>
                  {preview.streamLimit !== undefined && (
                    <span>On activation the server&apos;s stream limit becomes {preview.streamLimit ?? "unlimited"}.</span>
                  )}
                </div>

                {preview.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-amber-600">
                    {warning}
                  </p>
                ))}
              </>
            )}

            <Button
              onClick={onCreate}
              disabled={!draft || !preview || previewing || creating || !!previewError || (collect && !payModeId)}
            >
              {(creating || (previewing && !!draft)) && <LoaderCircle className="size-4 animate-spin" />}
              {collect ? "Create invoice & record payment" : "Create & issue invoice"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
