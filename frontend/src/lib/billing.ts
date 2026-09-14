/** Shared types, labels and formatting for the tenant billing pages. */

export type BillFor = "SERVER" | "STREAM";
export type DurationUnit = "DAY" | "MONTH" | "YEAR";
export type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID";
export type SubscriptionStatus = "PENDING_PAYMENT" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";

export type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

export const INVOICE_STATUS_BADGE: Record<InvoiceStatus, { label: string; variant: BadgeVariant }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  ISSUED: { label: "Issued", variant: "secondary" },
  PARTIALLY_PAID: { label: "Partially paid", variant: "warning" },
  PAID: { label: "Paid", variant: "success" },
  VOID: { label: "Cancelled", variant: "outline" },
};

export const SUBSCRIPTION_STATUS_BADGE: Record<SubscriptionStatus, { label: string; variant: BadgeVariant }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", variant: "warning" },
  ACTIVE: { label: "Active", variant: "success" },
  PAST_DUE: { label: "Past due", variant: "destructive" },
  SUSPENDED: { label: "Suspended", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

/** A live subscription on a billable server or stream, as the billables endpoint returns it. */
export interface BillableSubscription {
  id: string;
  status: SubscriptionStatus;
  planId: string;
  planName: string;
  currentPeriodEnd: number | null;
  openInvoice: { id: string; invoiceNumber: string | null } | null;
}

/** The bill status the customer portal shows on a server or stream. */
export interface ServiceBilling {
  /** STREAM: the service's own plan. SERVER: the plan on its server. */
  billedAs: BillFor;
  status: SubscriptionStatus;
  planName: string;
  currentPeriodEnd: number | null;
  openInvoice: { id: string; invoiceNumber: string | null; currency: string; balanceDue: number } | null;
}

/** Whether billing lets a customer's stream run; see backend billing-access.ts. */
export interface StreamAccess {
  state: "ACTIVE" | "GRACE" | "BLOCKED" | "EXEMPT";
  periodEnd: number | null;
  graceEndsAt: number | null;
}

export const BILLING_BLOCKED_MESSAGE =
  "This stream has no active bill, so it cannot be changed. Renew your plan to continue.";

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function durationLabel(value: number, unit: DurationUnit): string {
  const word = unit.toLowerCase();
  return `${value} ${value === 1 ? word : `${word}s`}`;
}
