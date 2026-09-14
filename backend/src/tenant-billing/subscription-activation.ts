import { Prisma } from '@prisma/client';
import { now } from '../common/utils/id.util';
import { accessState, graceDaysFor } from './billing-access';
import { addDuration } from './billing-math';

/**
 * Puts the subscriptions an invoice pays for into effect: marks each ACTIVE for
 * its invoiced period and applies the plan's limits to the customer's access.
 *
 * Runs inside the caller's transaction - on issue (activateOn = ISSUE, or a
 * zero-total invoice) or when any payment is recorded on it. Idempotent: a
 * subscription already covering the period is left alone, so paying an invoice
 * that was activated on issue changes nothing.
 *
 * Service runs from the moment it is switched on. A period quoted to start
 * earlier - a new subscription invoiced before it was paid, or a renewal paid
 * after the service was suspended - moves to now, keeping its length, and the
 * invoice line is moved with it. A renewal paid during grace keeps following
 * on from the previous period.
 *
 * Never throws over limits. If the customer already runs more streams than the
 * plan allows, the period is still recorded - they have paid for it - and the
 * limit is left as it was, with a warning for the tenant to resolve.
 */
export async function activateInvoiceSubscriptions(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  /** Null when the billing job activates, with no user behind it. */
  actorId: string | null,
): Promise<string[]> {
  const warnings: string[] = [];
  const items = await tx.tenantInvoiceItem.findMany({
    where: { tenantInvoiceId: invoiceId, tenantSubscriptionId: { not: null } },
    orderBy: { sortOrder: 'asc' },
    include: {
      tenantSubscription: {
        include: {
          tenantCustomerServer: true,
          tenantFlussonicServer: { select: { name: true } },
        },
      },
    },
  });

  for (const item of items) {
    const subscription = item.tenantSubscription;
    if (!subscription || subscription.status === 'CANCELLED') continue;
    if (item.periodStart === null || item.periodEnd === null) continue;
    if (
      subscription.status === 'ACTIVE' &&
      subscription.currentPeriodEnd !== null &&
      subscription.currentPeriodEnd >= item.periodEnd
    ) {
      continue;
    }

    const timestamp = now();
    let periodStart = Number(item.periodStart);
    let periodEnd = Number(item.periodEnd);
    const currentEnd = subscription.currentPeriodEnd === null ? null : Number(subscription.currentPeriodEnd);

    if (periodStart < timestamp) {
      const graceDays = await graceDaysFor(tx, subscription.tenantBusinessId);
      const lapsed = currentEnd === null || accessState(currentEnd, timestamp, graceDays) === 'BLOCKED';
      if (lapsed) {
        periodStart = timestamp;
        periodEnd = addDuration(timestamp, subscription.durationValue * item.quantity, subscription.durationUnit);
        await tx.tenantInvoiceItem.update({ where: { id: item.id }, data: { periodStart, periodEnd } });
      }
    }

    // A renewal that follows on from the current period extends it; a first
    // period, or one after a gap, starts afresh.
    const continues = currentEnd !== null && currentEnd >= periodStart;
    await tx.tenantSubscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: continues ? subscription.currentPeriodStart : periodStart,
        currentPeriodEnd: periodEnd,
        suspendedAt: null,
        updatedAt: timestamp,
        updatedBy: actorId,
      },
    });

    // A STREAM plan bills one stream; its play-session and protocol limits need
    // the streamer config mapper (docs/billing-plan.md §7) and are recorded only.
    const assignment = subscription.tenantCustomerServer;
    if (
      subscription.subscriptionFor !== 'SERVER' ||
      !assignment ||
      assignment.streamLimit === subscription.streamLimit
    ) {
      continue;
    }
    if (subscription.streamLimit !== null) {
      const used = await tx.tenantStream.count({
        where: {
          tenantCustomerId: assignment.tenantCustomerId,
          tenantFlussonicServerId: assignment.tenantFlussonicServerId,
          status: { not: 'DELETED' },
        },
      });
      if (used > subscription.streamLimit) {
        warnings.push(
          `Stream limit on ${subscription.tenantFlussonicServer.name} was left at ` +
            `${assignment.streamLimit ?? 'unlimited'}: the customer runs ${used} streams, ` +
            `more than the plan's ${subscription.streamLimit}.`,
        );
        continue;
      }
    }
    await tx.tenantCustomerServer.update({
      where: { id: assignment.id },
      data: { streamLimit: subscription.streamLimit, updatedAt: timestamp, updatedBy: actorId },
    });
  }
  return warnings;
}
