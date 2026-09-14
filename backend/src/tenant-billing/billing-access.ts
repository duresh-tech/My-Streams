import { Prisma, TenantSubscriptionStatus } from '@prisma/client';
import { appTimezone } from '../common/utils/time.util';
import { addDuration } from './billing-math';

/**
 * Whether a customer's stream may run. Decided from subscription dates alone,
 * so the answer is right at any moment - between scheduled runs too.
 *
 *   ACTIVE  - a covering subscription's period has not ended
 *   GRACE   - it ended less than graceDays ago: still usable, renew now
 *   BLOCKED - nothing covers it, or grace is over: switched off, customer actions refused
 *   EXEMPT  - blocked by the rule, but a tenant user switched it on anyway
 */
export type BillingAccessState = 'ACTIVE' | 'GRACE' | 'BLOCKED' | 'EXEMPT';

/** TenantBillingSettings.graceDays' default, for a business that has no settings row yet. */
export const DEFAULT_GRACE_DAYS = 3;

/** CANCELLED never covers; PENDING_PAYMENT has no period yet, so it cannot. */
const COVERING_STATUSES: TenantSubscriptionStatus[] = ['ACTIVE', 'PAST_DUE', 'SUSPENDED'];

export const COVERAGE_SELECT = {
  subscriptionFor: true,
  tenantStreamId: true,
  tenantCustomerId: true,
  tenantFlussonicServerId: true,
  currentPeriodEnd: true,
} satisfies Prisma.TenantSubscriptionSelect;

export type CoveringSubscription = Prisma.TenantSubscriptionGetPayload<{ select: typeof COVERAGE_SELECT }>;

export interface AccessStream {
  id: string;
  tenantCustomerId: string | null;
  tenantFlussonicServerId: string;
  billingExempt?: boolean;
}

export interface StreamAccess {
  state: BillingAccessState;
  /** The latest end among the subscriptions covering the stream. */
  periodEnd: number | null;
  graceEndsAt: number | null;
}

export function graceEnd(periodEnd: number, graceDays: number, timeZone = appTimezone()): number {
  return graceDays > 0 ? addDuration(periodEnd, graceDays, 'DAY', timeZone) : periodEnd;
}

export function accessState(
  periodEnd: number | null,
  at: number,
  graceDays: number,
  timeZone = appTimezone(),
): 'ACTIVE' | 'GRACE' | 'BLOCKED' {
  if (periodEnd === null) return 'BLOCKED';
  if (periodEnd > at) return 'ACTIVE';
  return graceEnd(periodEnd, graceDays, timeZone) > at ? 'GRACE' : 'BLOCKED';
}

/**
 * A stream is covered by its own STREAM subscription, or by a SERVER
 * subscription of the same customer on the server it runs on. The tenant's own
 * streams (no customer) are not billed and always run.
 */
export function streamAccess(
  stream: AccessStream,
  subscriptions: CoveringSubscription[],
  at: number,
  graceDays: number,
  timeZone = appTimezone(),
): StreamAccess {
  if (!stream.tenantCustomerId) return { state: 'ACTIVE', periodEnd: null, graceEndsAt: null };

  let periodEnd: number | null = null;
  for (const subscription of subscriptions) {
    if (subscription.currentPeriodEnd === null) continue;
    const covers =
      subscription.subscriptionFor === 'STREAM'
        ? subscription.tenantStreamId === stream.id
        : subscription.tenantCustomerId === stream.tenantCustomerId &&
          subscription.tenantFlussonicServerId === stream.tenantFlussonicServerId;
    if (covers) periodEnd = Math.max(periodEnd ?? 0, Number(subscription.currentPeriodEnd));
  }

  const state = accessState(periodEnd, at, graceDays, timeZone);
  return {
    state: state === 'BLOCKED' && stream.billingExempt ? 'EXEMPT' : state,
    periodEnd,
    graceEndsAt: periodEnd === null ? null : graceEnd(periodEnd, graceDays, timeZone),
  };
}

type Db = Prisma.TransactionClient;

/** Subscriptions that can cover a stream, narrowed by `where`. */
export function loadCoverage(db: Db, where: Prisma.TenantSubscriptionWhereInput) {
  return db.tenantSubscription.findMany({
    where: { ...where, status: { in: COVERING_STATUSES }, currentPeriodEnd: { not: null } },
    select: COVERAGE_SELECT,
  });
}

export async function graceDaysFor(db: Db, tenantBusinessId: string): Promise<number> {
  const settings = await db.tenantBillingSettings.findUnique({
    where: { tenantBusinessId },
    select: { graceDays: true },
  });
  return settings?.graceDays ?? DEFAULT_GRACE_DAYS;
}
