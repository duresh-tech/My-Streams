"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney, type ServiceBilling, type StreamAccess } from "@/lib/billing";

/**
 * Bill status for one server or stream: paid until when, expired, or awaiting
 * payment, plus any invoice still due. For a stream, `access` adds whether
 * billing currently lets it run - in grace, blocked, or enabled by the provider.
 */
export function ServiceBillingBadges({
  billing,
  access,
  timezone,
  invoiceHref,
}: {
  billing: ServiceBilling | null | undefined;
  access?: StreamAccess;
  timezone: string;
  invoiceHref?: (invoiceId: string) => string;
}) {
  const accessBadge =
    access?.state === "BLOCKED" ? (
      <Badge variant="destructive">Blocked · no active bill</Badge>
    ) : access?.state === "GRACE" ? (
      <Badge variant="warning">Grace until {formatDateTime(access.graceEndsAt, timezone)}</Badge>
    ) : access?.state === "EXEMPT" ? (
      <Badge variant="info">Enabled by provider</Badge>
    ) : null;

  if (!billing) {
    return (
      <>
        <Badge variant="outline">Not billed</Badge>
        {accessBadge}
      </>
    );
  }

  const end = billing.currentPeriodEnd;
  const expired = end !== null && end <= Math.floor(Date.now() / 1000);
  const covered = billing.billedAs === "SERVER" ? " (server plan)" : "";

  let status: React.ReactNode;
  if (billing.status === "PENDING_PAYMENT") {
    status = <Badge variant="warning">Awaiting payment</Badge>;
  } else if (billing.status === "SUSPENDED" || billing.status === "PAST_DUE" || expired) {
    status = <Badge variant="destructive">Expired {formatDateTime(end, timezone)}</Badge>;
  } else {
    status = (
      <Badge variant="success">
        Paid until {formatDateTime(end, timezone)}
        {covered}
      </Badge>
    );
  }

  const open = billing.openInvoice;
  const due =
    open && open.balanceDue > 0 ? (
      <Badge variant="warning">
        Due {formatMoney(open.balanceDue, open.currency)}
        {open.invoiceNumber ? ` · ${open.invoiceNumber}` : ""}
      </Badge>
    ) : null;

  return (
    <>
      {status}
      {accessBadge}
      {due && invoiceHref ? <Link href={invoiceHref(open!.id)}>{due}</Link> : due}
    </>
  );
}
