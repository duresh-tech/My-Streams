"use client";

import * as React from "react";
import { LoaderCircle, Lock, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
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
import { TenantApiError, tenantApi } from "@/lib/tenant-api";
import { useTenantSession } from "@/hooks/use-tenant-session";

type ActivateOn = "PAYMENT" | "ISSUE";

interface TaxTypeOption {
  id: string;
  taxName: string;
  calculationType: "PERCENTAGE" | "FIXED";
  value: number;
}

interface BillingSettings {
  id: string;
  currency: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  invoiceDueDays: number;
  renewalLeadDays: number;
  graceDays: number;
  activateOn: ActivateOn;
  defaultTaxTypeId: string | null;
  defaultTaxType: TaxTypeOption | null;
  invoiceFooter: string | null;
  nextInvoiceNumberPreview: string;
  invoiceNumberLocked: boolean;
}

interface FormValues {
  currency: string;
  invoicePrefix: string;
  nextInvoiceNumber: string;
  invoiceDueDays: string;
  renewalLeadDays: string;
  graceDays: string;
  activateOn: ActivateOn;
  defaultTaxTypeId: string;
  invoiceFooter: string;
}

/** Select items cannot carry an empty value, so "no default tax" needs a sentinel. */
const NO_TAX = "none";

const ACTIVATE_ON_HINT: Record<ActivateOn, string> = {
  PAYMENT: "Service starts once any payment is recorded on the invoice, even a part payment.",
  ISSUE: "Service starts as soon as the invoice is issued, before payment (access on credit).",
};

function formFrom(settings: BillingSettings): FormValues {
  return {
    currency: settings.currency,
    invoicePrefix: settings.invoicePrefix,
    nextInvoiceNumber: String(settings.nextInvoiceNumber),
    invoiceDueDays: String(settings.invoiceDueDays),
    renewalLeadDays: String(settings.renewalLeadDays),
    graceDays: String(settings.graceDays),
    activateOn: settings.activateOn,
    defaultTaxTypeId: settings.defaultTaxTypeId ?? NO_TAX,
    invoiceFooter: settings.invoiceFooter ?? "",
  };
}

let currencyOptionsCache: ComboboxOption[] | null = null;

function currencyOptions(): ComboboxOption[] {
  if (!currencyOptionsCache) {
    const names = new Intl.DisplayNames(undefined, { type: "currency" });
    currencyOptionsCache = Intl.supportedValuesOf("currency").map((code) => ({
      value: code,
      label: `${code} — ${names.of(code) ?? code}`,
    }));
  }
  return currencyOptionsCache;
}

function taxLabel(tax: TaxTypeOption): string {
  return tax.calculationType === "PERCENTAGE"
    ? `${tax.taxName} (${tax.value}%)`
    : `${tax.taxName} (${tax.value} fixed)`;
}

/** Mirrors formatInvoiceNumber on the backend; used only for the live preview. */
function previewInvoiceNumber(prefix: string, sequence: string): string {
  const n = Number(sequence);
  return Number.isInteger(n) && n >= 1 ? `${prefix}${String(n).padStart(6, "0")}` : "—";
}

function RequiredMark() {
  return <span className="text-destructive"> *</span>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

export default function TenantBillingSettingsPage() {
  const { hasPermission } = useTenantSession();
  const canView = hasPermission("tenant-billing-settings:view");
  const canUpdate = hasPermission("tenant-billing-settings:update");
  const canListTaxTypes = hasPermission("tenant-tax-types:list");

  const [settings, setSettings] = React.useState<BillingSettings | null>(null);
  const [taxTypes, setTaxTypes] = React.useState<TaxTypeOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormValues | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      tenantApi<BillingSettings>("/tenant/billing-settings"),
      canListTaxTypes
        ? tenantApi<{ items: TaxTypeOption[] }>(
            "/tenant/tax-types?status=ACTIVE&limit=100&sortBy=taxName&sortOrder=asc",
          )
            .then((data) => data.items)
            .catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([data, activeTaxTypes]) => {
        if (cancelled) return;
        setSettings(data);
        setForm(formFrom(data));
        setTaxTypes(activeTaxTypes);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error instanceof TenantApiError ? error.message : "Failed to load billing settings");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canView, canListTaxTypes]);

  // The saved default may be inactive now, or the viewer may not be allowed to
  // list tax types - keep it selectable either way so the field is never blank.
  const taxOptions = React.useMemo(() => {
    const current = settings?.defaultTaxType;
    if (current && !taxTypes.some((tax) => tax.id === current.id)) return [current, ...taxTypes];
    return taxTypes;
  }, [settings, taxTypes]);

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !settings) return;
    setSaving(true);
    try {
      const updated = await tenantApi<BillingSettings>("/tenant/billing-settings", {
        method: "PATCH",
        body: {
          currency: form.currency,
          invoicePrefix: form.invoicePrefix,
          ...(settings.invoiceNumberLocked ? {} : { nextInvoiceNumber: Number(form.nextInvoiceNumber) }),
          invoiceDueDays: Number(form.invoiceDueDays),
          renewalLeadDays: Number(form.renewalLeadDays),
          graceDays: Number(form.graceDays),
          activateOn: form.activateOn,
          defaultTaxTypeId: form.defaultTaxTypeId === NO_TAX ? null : form.defaultTaxTypeId,
          invoiceFooter: form.invoiceFooter.trim() || null,
        },
      });
      setSettings(updated);
      setForm(formFrom(updated));
      toast.success("Billing settings updated");
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Billing</CardTitle>
          <CardDescription>You don&apos;t have permission to view billing settings.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !settings || !form) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Billing</CardTitle>
          <CardDescription>{loadError ?? "Failed to load billing settings."}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const disabled = !canUpdate;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Billing</CardTitle>
          <CardDescription>
            How invoices are numbered and taxed, and when subscriptions start, lapse and are suspended.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-6">
            <section className="grid gap-4">
              <h3 className="text-sm font-semibold">Invoices</h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>
                    Currency
                    {canUpdate && <RequiredMark />}
                  </Label>
                  <Combobox
                    options={currencyOptions()}
                    value={form.currency}
                    onValueChange={(value) => value && setField("currency", value)}
                    placeholder="Select a currency"
                    searchPlaceholder="Search currencies..."
                    emptyText="No currency found."
                    disabled={disabled}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Default tax</Label>
                  <Select
                    value={form.defaultTaxTypeId}
                    onValueChange={(value) => setField("defaultTaxTypeId", value)}
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TAX}>No default tax</SelectItem>
                      {taxOptions.map((tax) => (
                        <SelectItem key={tax.id} value={tax.id}>
                          {taxLabel(tax)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Hint>Preselected on new invoices; can be changed per invoice.</Hint>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="invoicePrefix">Invoice prefix</Label>
                  <Input
                    id="invoicePrefix"
                    maxLength={20}
                    pattern="[A-Za-z0-9/_\-]*"
                    title='Letters, digits, "-", "_" and "/" only'
                    disabled={disabled}
                    value={form.invoicePrefix}
                    onChange={(e) => setField("invoicePrefix", e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="nextInvoiceNumber" className="flex items-center gap-1.5">
                    Next invoice number
                    {settings.invoiceNumberLocked && <Lock className="size-3.5 text-muted-foreground" />}
                  </Label>
                  <Input
                    id="nextInvoiceNumber"
                    type="number"
                    min={1}
                    required
                    disabled={disabled || settings.invoiceNumberLocked}
                    value={form.nextInvoiceNumber}
                    onChange={(e) => setField("nextInvoiceNumber", e.target.value)}
                  />
                  <Hint>
                    {settings.invoiceNumberLocked
                      ? "Locked: invoices have already been issued."
                      : "Can be changed until the first invoice is issued."}
                  </Hint>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="invoiceDueDays">Payment due (days)</Label>
                  <Input
                    id="invoiceDueDays"
                    type="number"
                    min={0}
                    max={365}
                    required
                    disabled={disabled}
                    value={form.invoiceDueDays}
                    onChange={(e) => setField("invoiceDueDays", e.target.value)}
                  />
                  <Hint>After the issue date.</Hint>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Next invoice will be numbered{" "}
                <span className="font-mono font-medium text-foreground">
                  {settings.invoiceNumberLocked
                    ? previewInvoiceNumber(form.invoicePrefix, String(settings.nextInvoiceNumber))
                    : previewInvoiceNumber(form.invoicePrefix, form.nextInvoiceNumber)}
                </span>
              </p>

              <div className="grid gap-2">
                <Label htmlFor="invoiceFooter">Invoice footer</Label>
                <Textarea
                  id="invoiceFooter"
                  rows={3}
                  maxLength={2000}
                  disabled={disabled}
                  value={form.invoiceFooter}
                  onChange={(e) => setField("invoiceFooter", e.target.value)}
                  placeholder="Bank details, terms, or a thank-you note printed at the bottom of every invoice"
                />
              </div>
            </section>

            <Separator />

            <section className="grid gap-4">
              <h3 className="text-sm font-semibold">Subscriptions</h3>

              <div className="grid gap-2">
                <Label>Activate subscriptions</Label>
                <Select
                  value={form.activateOn}
                  onValueChange={(value) => setField("activateOn", value as ActivateOn)}
                  disabled={disabled}
                >
                  <SelectTrigger className="sm:max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAYMENT">On payment (any amount)</SelectItem>
                    <SelectItem value="ISSUE">When the invoice is issued</SelectItem>
                  </SelectContent>
                </Select>
                <Hint>{ACTIVATE_ON_HINT[form.activateOn]}</Hint>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="renewalLeadDays">Renewal invoice lead (days)</Label>
                  <Input
                    id="renewalLeadDays"
                    type="number"
                    min={0}
                    max={90}
                    required
                    disabled={disabled}
                    value={form.renewalLeadDays}
                    onChange={(e) => setField("renewalLeadDays", e.target.value)}
                  />
                  <Hint>Renewal invoices are raised this many days before a period ends.</Hint>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="graceDays">Grace period (days)</Label>
                  <Input
                    id="graceDays"
                    type="number"
                    min={0}
                    max={90}
                    required
                    disabled={disabled}
                    value={form.graceDays}
                    onChange={(e) => setField("graceDays", e.target.value)}
                  />
                  <Hint>How long an unpaid subscription keeps running after its period ends before it is suspended.</Hint>
                </div>
              </div>
            </section>

            {canUpdate && (
              <div>
                <Button type="submit" disabled={saving}>
                  {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
