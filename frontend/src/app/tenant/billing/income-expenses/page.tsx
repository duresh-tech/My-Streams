"use client";

import * as React from "react";
import Link from "next/link";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { ResourceTable, type Column } from "@/components/resource-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { useAppTimezone } from "@/hooks/use-app-settings";
import { useResourceList } from "@/hooks/use-resource-list";
import { useTenantSession } from "@/hooks/use-tenant-session";
import { formatDateOnly } from "@/lib/datetime";
import { formatMoney } from "@/lib/billing";
import { TenantApiError, tenantApi } from "@/lib/tenant-api";
import { cn } from "@/lib/utils";

type EntryType = "INCOME" | "EXPENSE";

interface EntryRow {
  id: string;
  systemCode: string;
  type: EntryType;
  amount: number;
  entryDate: number;
  referenceNo: string | null;
  remark: string | null;
  status: "ACTIVE" | "VOID";
  tenantInExCategoryId: string;
  tenantPaymentModeId: string | null;
  category: { id: string; name: string; type: EntryType };
  paymentMode: { id: string; paymentName: string } | null;
  invoice: { id: string; invoiceNumber: string | null } | null;
}

interface Options {
  currency: string | null;
  categories: { id: string; name: string; type: EntryType }[];
  paymentModes: { id: string; paymentName: string }[];
}

interface Summary {
  income: number;
  expense: number;
  net: number;
}

interface FormValues {
  type: EntryType;
  tenantInExCategoryId: string;
  amount: string;
  entryDate: string;
  tenantPaymentModeId: string;
  referenceNo: string;
  remark: string;
}

const ALL = "ALL";
/** Select items cannot carry an empty value. */
const NO_MODE = "none";

export default function TenantIncomeExpensesPage() {
  const timezone = useAppTimezone();
  const { hasPermission } = useTenantSession();
  const canCreate = hasPermission("tenant-income-expenses:create");
  const canUpdate = hasPermission("tenant-income-expenses:update");
  const canDelete = hasPermission("tenant-income-expenses:delete");
  const canViewInvoices = hasPermission("tenant-invoices:view");

  const today = formatDateOnly(Math.floor(Date.now() / 1000), timezone);

  const [typeFilter, setTypeFilter] = React.useState(ALL);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const filters = { type: typeFilter === ALL ? undefined : typeFilter, from: from || undefined, to: to || undefined };
  const filtersKey = JSON.stringify(filters);
  const list = useResourceList<EntryRow>("/tenant/income-expenses", filters, tenantApi);

  const [options, setOptions] = React.useState<Options | null>(null);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [summaryVersion, setSummaryVersion] = React.useState(0);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EntryRow | null>(null);
  const [form, setForm] = React.useState<FormValues | null>(null);
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<EntryRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    tenantApi<Options>("/tenant/income-expenses/options")
      .then(setOptions)
      .catch(() => toast.error("Failed to load categories and payment modes"));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(
      Object.entries(JSON.parse(filtersKey) as Record<string, string | undefined>).filter(
        (entry): entry is [string, string] => !!entry[1],
      ),
    );
    tenantApi<Summary>(`/tenant/income-expenses/summary?${params.toString()}`)
      .then((data) => !cancelled && setSummary(data))
      .catch(() => !cancelled && setSummary(null));
    return () => {
      cancelled = true;
    };
  }, [filtersKey, summaryVersion]);

  const money = (amount: number) =>
    options?.currency ? formatMoney(amount, options.currency) : amount.toFixed(2);

  function refresh() {
    list.refresh();
    setSummaryVersion((v) => v + 1);
  }

  function openCreate() {
    setEditing(null);
    setForm({
      type: typeFilter === "INCOME" ? "INCOME" : "EXPENSE",
      tenantInExCategoryId: "",
      amount: "",
      entryDate: today,
      tenantPaymentModeId: NO_MODE,
      referenceNo: "",
      remark: "",
    });
    setFormOpen(true);
  }

  function openEdit(row: EntryRow) {
    setEditing(row);
    setForm({
      type: row.type,
      tenantInExCategoryId: row.tenantInExCategoryId,
      amount: row.amount.toFixed(2),
      entryDate: formatDateOnly(row.entryDate, timezone),
      tenantPaymentModeId: row.tenantPaymentModeId ?? NO_MODE,
      referenceNo: row.referenceNo ?? "",
      remark: row.remark ?? "",
    });
    setFormOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const body = {
        tenantInExCategoryId: form.tenantInExCategoryId,
        amount: Number(form.amount),
        entryDate: form.entryDate,
        tenantPaymentModeId: form.tenantPaymentModeId === NO_MODE ? null : form.tenantPaymentModeId,
        referenceNo: form.referenceNo.trim() || null,
        remark: form.remark.trim() || null,
      };
      if (editing) {
        await tenantApi(`/tenant/income-expenses/${editing.id}`, { method: "PATCH", body });
        toast.success("Entry updated");
      } else {
        await tenantApi("/tenant/income-expenses", { method: "POST", body });
        toast.success("Entry recorded");
      }
      setFormOpen(false);
      refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await tenantApi(`/tenant/income-expenses/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Entry deleted");
      setDeleteTarget(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<EntryRow>[] = [
    { header: "Date", cell: (row) => formatDateOnly(row.entryDate, timezone) },
    {
      header: "Category",
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.category.name}</span>
          {row.type === "INCOME" ? <Badge variant="success">Income</Badge> : <Badge variant="outline">Expense</Badge>}
        </div>
      ),
    },
    {
      header: "Amount",
      cell: (row) => (
        <span
          className={cn(
            "font-medium whitespace-nowrap",
            row.status === "VOID"
              ? "text-muted-foreground line-through"
              : row.type === "INCOME"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400",
          )}
        >
          {row.type === "INCOME" ? "+" : "−"} {money(row.amount)}
        </span>
      ),
    },
    { header: "Mode", cell: (row) => row.paymentMode?.paymentName ?? "—" },
    {
      header: "Details",
      cell: (row) => (
        <div className="max-w-xs text-sm">
          {row.referenceNo && <div>Ref {row.referenceNo}</div>}
          {row.remark && <div className="truncate text-muted-foreground">{row.remark}</div>}
          {!row.referenceNo && !row.remark && "—"}
        </div>
      ),
    },
    {
      header: "Source",
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          {row.invoice ? (
            canViewInvoices ? (
              <Link href={`/tenant/billing/invoices/${row.invoice.id}`} className="text-sm hover:underline">
                {row.invoice.invoiceNumber ?? "Invoice"}
              </Link>
            ) : (
              <span className="text-sm">{row.invoice.invoiceNumber ?? "Invoice"}</span>
            )
          ) : (
            <span className="text-sm text-muted-foreground">Manual</span>
          )}
          {row.status === "VOID" && <Badge variant="outline">Void</Badge>}
        </div>
      ),
    },
  ];

  const formCategories = options?.categories.filter((category) => category.type === form?.type) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            { label: "Income", value: summary?.income, className: "text-emerald-600 dark:text-emerald-400" },
            { label: "Expense", value: summary?.expense, className: "text-red-600 dark:text-red-400" },
            { label: "Net", value: summary?.net, className: undefined },
          ] as const
        ).map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{card.label}</div>
              <div className={cn("text-2xl font-semibold", card.className)}>
                {card.value === undefined ? "—" : money(card.value)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ResourceTable<EntryRow>
        title="Income & Expenses"
        description="Your business ledger. Invoice payments are recorded here automatically; totals match the type and date filters and leave out voided entries."
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
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value);
                list.setPage(1);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                <SelectItem value="INCOME">Income</SelectItem>
                <SelectItem value="EXPENSE">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label="From date"
              className="w-40"
              value={from}
              max={to || undefined}
              onChange={(e) => {
                setFrom(e.target.value);
                list.setPage(1);
              }}
            />
            <Input
              type="date"
              aria-label="To date"
              className="w-40"
              value={to}
              min={from || undefined}
              onChange={(e) => {
                setTo(e.target.value);
                list.setPage(1);
              }}
            />
            {canCreate && (
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Entry
              </Button>
            )}
          </div>
        }
        renderActions={
          canUpdate || canDelete
            ? (row) => {
                // Entries from invoice payments follow the payment; cancelling the invoice reverses them.
                const editable = !row.invoice && row.status === "ACTIVE";
                return (
                  <RowActionsMenu
                    actions={[
                      ...(canUpdate && editable ? [{ label: "Edit", icon: Pencil, onClick: () => openEdit(row) }] : []),
                      ...(canDelete && editable
                        ? [{ label: "Delete", icon: Trash2, onClick: () => setDeleteTarget(row), destructive: true }]
                        : []),
                    ]}
                  />
                );
              }
            : undefined
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          {form && (
            <form onSubmit={onSubmit}>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit entry" : "Add entry"}</DialogTitle>
                <DialogDescription>Record money that came in or went out of the business.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Type</Label>
                    <Select
                      value={form.type}
                      onValueChange={(value) =>
                        setForm((f) => (f ? { ...f, type: value as EntryType, tenantInExCategoryId: "" } : f))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INCOME">Income</SelectItem>
                        <SelectItem value="EXPENSE">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Category</Label>
                    <Select
                      value={form.tenantInExCategoryId}
                      onValueChange={(value) => setForm((f) => (f ? { ...f, tenantInExCategoryId: value } : f))}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            options === null
                              ? "Loading..."
                              : formCategories.length
                                ? "Select a category"
                                : `No active ${form.type.toLowerCase()} categories`
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {formCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Amount{options?.currency ? ` (${options.currency})` : ""}</Label>
                    <Input
                      id="amount"
                      type="number"
                      min={0.01}
                      step="0.01"
                      required
                      value={form.amount}
                      onChange={(e) => setForm((f) => (f ? { ...f, amount: e.target.value } : f))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="entryDate">Date</Label>
                    <Input
                      id="entryDate"
                      type="date"
                      required
                      value={form.entryDate}
                      onChange={(e) => setForm((f) => (f ? { ...f, entryDate: e.target.value } : f))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Payment mode</Label>
                    <Select
                      value={form.tenantPaymentModeId}
                      onValueChange={(value) => setForm((f) => (f ? { ...f, tenantPaymentModeId: value } : f))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MODE}>Not specified</SelectItem>
                        {(options?.paymentModes ?? []).map((mode) => (
                          <SelectItem key={mode.id} value={mode.id}>
                            {mode.paymentName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="referenceNo">Reference no.</Label>
                    <Input
                      id="referenceNo"
                      maxLength={100}
                      value={form.referenceNo}
                      onChange={(e) => setForm((f) => (f ? { ...f, referenceNo: e.target.value } : f))}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="remark">Remark</Label>
                  <Input
                    id="remark"
                    maxLength={255}
                    value={form.remark}
                    onChange={(e) => setForm((f) => (f ? { ...f, remark: e.target.value } : f))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !form.tenantInExCategoryId || !form.amount || !form.entryDate}
                >
                  {saving && <LoaderCircle className="size-4 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete entry"
        description={`This will delete the ${deleteTarget?.type.toLowerCase() ?? ""} entry of ${
          deleteTarget ? money(deleteTarget.amount) : ""
        } under "${deleteTarget?.category.name ?? ""}".`}
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  );
}
