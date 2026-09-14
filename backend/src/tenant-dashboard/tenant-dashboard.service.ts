import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { now } from '../common/utils/id.util';
import { TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { getMappedBusinessId } from '../tenant-billing/billing-scope';
import { STREAM_EVENT_GROUPS } from '../tenant-stream-events/stream-events.logic';
import {
  type Bucket,
  type DashboardRange,
  bucketIndex,
  countSeries,
  rangeBuckets,
} from '../common/utils/dashboard-buckets';

/** Money is added up in whole cents so float error never reaches a total. */
const toCents = (value: Prisma.Decimal | number) => Math.round(Number(value) * 100);
const fromCents = (cents: number) => cents / 100;
const customerName = (c: { fName: string; lName: string | null }) => [c.fName, c.lName].filter(Boolean).join(' ');

/**
 * The tenant dashboard: one call, one section per area, each included only when
 * the caller holds that area's list permission - so the page never shows a
 * figure the user could not open.
 */
@Injectable()
export class TenantDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(user: TenantAuthUser, range: DashboardRange) {
    const businessId = await getMappedBusinessId(this.prisma, user.id);
    const at = now();
    const buckets = rangeBuckets(range, at);
    const can = (permission: string) => user.permissions.includes(permission);

    const settings = await this.prisma.tenantBillingSettings.findUnique({
      where: { tenantBusinessId: businessId },
      select: { currency: true },
    });
    const currency = settings?.currency ?? 'INR';

    const [billing, streams, customers, events, incomeExpense] = await Promise.all([
      can('tenant-invoices:list') ? this.billing(businessId, buckets, at, currency) : null,
      can('tenant-streams:list') ? this.streams(businessId, can('tenant-streaming-servers:list')) : null,
      can('tenant-customers:view') ? this.customers(businessId, buckets, at) : null,
      can('tenant-stream-events:list') ? this.events(businessId, buckets) : null,
      can('tenant-income-expenses:list') ? this.incomeExpense(businessId, buckets, currency) : null,
    ]);

    return { range, generatedAt: at, buckets, billing, streams, customers, events, incomeExpense };
  }

  private async billing(businessId: string, buckets: Bucket[], at: number, currency: string) {
    const from = buckets[0].start;
    const to = buckets[buckets.length - 1].end;
    const [payments, open, statusGroups, expiring] = await Promise.all([
      this.prisma.tenantPayment.findMany({
        where: { tenantBusinessId: businessId, status: 'RECORDED', paidAt: { gte: from, lt: to } },
        select: { amount: true, paidAt: true },
      }),
      this.prisma.tenantInvoice.findMany({
        where: { tenantBusinessId: businessId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
        select: { grandTotal: true, amountPaid: true, dueDate: true },
      }),
      this.prisma.tenantInvoice.groupBy({
        by: ['status'],
        where: { tenantBusinessId: businessId, status: { not: 'DRAFT' }, issueDate: { gte: from, lt: to } },
        _count: { _all: true },
      }),
      this.prisma.tenantSubscription.findMany({
        where: {
          tenantBusinessId: businessId,
          status: { in: ['ACTIVE', 'PAST_DUE'] },
          currentPeriodEnd: { gte: at, lte: at + 7 * 86400 },
        },
        orderBy: { currentPeriodEnd: 'asc' },
        take: 10,
        select: {
          id: true,
          planName: true,
          subscriptionFor: true,
          currentPeriodEnd: true,
          tenantCustomer: { select: { fName: true, lName: true, customerCode: true } },
          tenantStream: { select: { title: true, name: true } },
          tenantFlussonicServer: { select: { name: true } },
        },
      }),
    ]);

    const collectedSeries = buckets.map(() => 0);
    let collected = 0;
    for (const payment of payments) {
      const i = bucketIndex(buckets, payment.paidAt);
      if (i < 0) continue;
      const cents = toCents(payment.amount);
      collectedSeries[i] += cents;
      collected += cents;
    }

    let outstanding = 0;
    let overdueAmount = 0;
    let overdueCount = 0;
    for (const invoice of open) {
      const due = toCents(invoice.grandTotal) - toCents(invoice.amountPaid);
      outstanding += due;
      if (invoice.dueDate !== null && Number(invoice.dueDate) < at) {
        overdueAmount += due;
        overdueCount++;
      }
    }

    return {
      currency,
      collected: fromCents(collected),
      collectedSeries: collectedSeries.map(fromCents),
      outstanding: fromCents(outstanding),
      openCount: open.length,
      overdueAmount: fromCents(overdueAmount),
      overdueCount,
      invoiceStatus: statusGroups.map((group) => ({ status: group.status, count: group._count._all })),
      expiringSoon: expiring.map((s) => ({
        id: s.id,
        planName: s.planName,
        subscriptionFor: s.subscriptionFor,
        currentPeriodEnd: Number(s.currentPeriodEnd),
        customer: `${customerName(s.tenantCustomer)} (${s.tenantCustomer.customerCode})`,
        target: s.tenantStream ? `${s.tenantStream.title} (${s.tenantStream.name})` : s.tenantFlussonicServer.name,
      })),
    };
  }

  private async streams(businessId: string, withServers: boolean) {
    const base: Prisma.TenantStreamWhereInput = {
      tenantBusinessId: businessId,
      status: { not: 'DELETED' },
      tenantFlussonicServer: { status: { not: 'DELETED' } },
    };
    const [total, enabled, billingOff, exempt, perServerGroups, servers] = await Promise.all([
      this.prisma.tenantStream.count({ where: base }),
      this.prisma.tenantStream.count({ where: { ...base, disabled: false } }),
      this.prisma.tenantStream.count({ where: { ...base, disabled: true, billingDisabledAt: { not: null } } }),
      this.prisma.tenantStream.count({ where: { ...base, billingExempt: true } }),
      this.prisma.tenantStream.groupBy({
        by: ['tenantFlussonicServerId', 'disabled'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.tenantFlussonicServer.findMany({
        where: { tenantBusinessId: businessId, status: { not: 'DELETED' } },
        select: { id: true, name: true, status: true, connectionStatus: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const byServer = new Map<string, { enabled: number; disabled: number }>();
    for (const group of perServerGroups) {
      const entry = byServer.get(group.tenantFlussonicServerId) ?? { enabled: 0, disabled: 0 };
      if (group.disabled) entry.disabled += group._count._all;
      else entry.enabled += group._count._all;
      byServer.set(group.tenantFlussonicServerId, entry);
    }
    const perServer = servers
      .map((server) => ({ name: server.name, ...(byServer.get(server.id) ?? { enabled: 0, disabled: 0 }) }))
      .filter((row) => row.enabled + row.disabled > 0)
      .sort((a, b) => b.enabled + b.disabled - (a.enabled + a.disabled))
      .slice(0, 8);

    const countBy = (status: string) => servers.filter((server) => server.connectionStatus === status).length;
    return {
      total,
      enabled,
      billingOff,
      disabledByUser: Math.max(0, total - enabled - billingOff),
      exempt,
      perServer,
      servers: withServers
        ? {
            total: servers.length,
            connected: countBy('CONNECTED'),
            unreachable: countBy('UNREACHABLE'),
            unauthorized: countBy('UNAUTHORIZED'),
            unknown: countBy('UNKNOWN'),
            attention: servers
              .filter(
                (server) =>
                  server.status !== 'ACTIVE' ||
                  server.connectionStatus === 'UNREACHABLE' ||
                  server.connectionStatus === 'UNAUTHORIZED',
              )
              .slice(0, 8),
          }
        : null,
    };
  }

  private async customers(businessId: string, buckets: Bucket[], at: number) {
    const from = buckets[0].start;
    const to = buckets[buckets.length - 1].end;
    const [total, active, created, billed] = await Promise.all([
      this.prisma.tenantCustomer.count({ where: { tenantBusinessId: businessId, status: { not: 'DELETED' } } }),
      this.prisma.tenantCustomer.count({ where: { tenantBusinessId: businessId, status: 'ACTIVE' } }),
      this.prisma.tenantCustomer.findMany({
        where: { tenantBusinessId: businessId, status: { not: 'DELETED' }, createdAt: { gte: from, lt: to } },
        select: { createdAt: true },
      }),
      this.prisma.tenantSubscription.findMany({
        where: {
          tenantBusinessId: businessId,
          status: { in: ['ACTIVE', 'PAST_DUE'] },
          currentPeriodEnd: { gt: at },
          tenantCustomer: { status: { not: 'DELETED' } },
        },
        select: { tenantCustomerId: true },
        distinct: ['tenantCustomerId'],
      }),
    ]);
    return {
      total,
      active,
      newInRange: created.length,
      newSeries: countSeries(buckets, created.map((c) => c.createdAt)),
      withActiveBill: billed.length,
      withoutActiveBill: Math.max(0, total - billed.length),
    };
  }

  private async events(businessId: string, buckets: Bucket[]) {
    const from = buckets[0].start;
    const to = buckets[buckets.length - 1].end;
    const groupOf = new Map<string, 'SOURCE' | 'STREAM' | 'VIEWER'>(
      STREAM_EVENT_GROUPS.flatMap((group) => group.events.map((event) => [event as string, group.group] as const)),
    );
    // One grouped count per bucket keeps even a busy event log out of memory.
    const [perBucket, alerts] = await Promise.all([
      Promise.all(
        buckets.map((bucket) =>
          this.prisma.tenantStreamEvent.groupBy({
            by: ['event'],
            where: { tenantBusinessId: businessId, occurredAt: { gte: bucket.start, lt: bucket.end } },
            _count: { _all: true },
          }),
        ),
      ),
      this.prisma.tenantStreamEvent.groupBy({
        by: ['emailStatus'],
        where: { tenantBusinessId: businessId, occurredAt: { gte: from, lt: to } },
        _count: { _all: true },
      }),
    ]);

    const series = {
      SOURCE: buckets.map(() => 0),
      STREAM: buckets.map(() => 0),
      VIEWER: buckets.map(() => 0),
    };
    let total = 0;
    perBucket.forEach((groups, i) => {
      for (const group of groups) {
        const key = groupOf.get(group.event);
        if (!key) continue;
        series[key][i] += group._count._all;
        total += group._count._all;
      }
    });
    const alertCount = (status: string) => alerts.find((a) => a.emailStatus === status)?._count._all ?? 0;
    return {
      total,
      series,
      alerts: {
        sent: alertCount('SENT'),
        failed: alertCount('FAILED'),
        cooldown: alertCount('COOLDOWN'),
        noMailConfig: alertCount('NO_MAIL_CONFIG'),
      },
    };
  }

  private async incomeExpense(businessId: string, buckets: Bucket[], currency: string) {
    const entries = await this.prisma.tenantIncomeExpense.findMany({
      where: {
        tenantBusinessId: businessId,
        status: 'ACTIVE',
        entryDate: { gte: buckets[0].start, lt: buckets[buckets.length - 1].end },
      },
      select: { type: true, amount: true, entryDate: true },
    });
    const incomeSeries = buckets.map(() => 0);
    const expenseSeries = buckets.map(() => 0);
    for (const entry of entries) {
      const i = bucketIndex(buckets, entry.entryDate);
      if (i < 0) continue;
      (entry.type === 'INCOME' ? incomeSeries : expenseSeries)[i] += toCents(entry.amount);
    }
    const income = incomeSeries.reduce((a, b) => a + b, 0);
    const expense = expenseSeries.reduce((a, b) => a + b, 0);
    return {
      currency,
      income: fromCents(income),
      expense: fromCents(expense),
      net: fromCents(income - expense),
      incomeSeries: incomeSeries.map(fromCents),
      expenseSeries: expenseSeries.map(fromCents),
    };
  }
}
