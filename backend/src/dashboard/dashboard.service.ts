import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { now } from '../common/utils/id.util';
import {
  type Bucket,
  type DashboardRange,
  bucketIndex,
  countSeries,
  distinctSeries,
  rangeBuckets,
} from '../common/utils/dashboard-buckets';

const toCents = (value: Prisma.Decimal | number) => Math.round(Number(value) * 100);
const fromCents = (cents: number) => cents / 100;

/** A stream that still exists, on a server that still exists. */
const LIVE_STREAM: Prisma.TenantStreamWhereInput = {
  status: { not: 'DELETED' },
  tenantFlussonicServer: { status: { not: 'DELETED' } },
};

/**
 * The system console dashboard, across every tenant. Billing is grouped by
 * currency: tenants bill in their own currency, and a sum across currencies
 * would be meaningless.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(range: DashboardRange) {
    const at = now();
    const buckets = rangeBuckets(range, at);
    const [growth, infrastructure, billing, access] = await Promise.all([
      this.growth(buckets),
      this.infrastructure(),
      this.billing(buckets),
      this.access(buckets, at),
    ]);
    return { range, generatedAt: at, buckets, growth, infrastructure, billing, access };
  }

  private async growth(buckets: Bucket[]) {
    const created = { gte: buckets[0].start, lt: buckets[buckets.length - 1].end };
    const [businesses, tenantUsers, customers, newBusinesses, newTenantUsers, newCustomers, ranked, streamGroups] = await Promise.all([
      this.prisma.tenantBusiness.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.tenantUser.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.tenantCustomer.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.tenantBusiness.findMany({ where: { status: { not: 'DELETED' }, createdAt: created }, select: { createdAt: true } }),
      this.prisma.tenantUser.findMany({ where: { status: { not: 'DELETED' }, createdAt: created }, select: { createdAt: true } }),
      this.prisma.tenantCustomer.findMany({ where: { status: { not: 'DELETED' }, createdAt: created }, select: { createdAt: true } }),
      this.prisma.tenantBusiness.findMany({
        where: { status: { not: 'DELETED' } },
        select: {
          id: true,
          name: true,
          _count: { select: { customers: { where: { status: { not: 'DELETED' } } } } },
        },
      }),
      // Same stream filter as the infrastructure totals, so the two agree.
      this.prisma.tenantStream.groupBy({
        by: ['tenantBusinessId'],
        where: LIVE_STREAM,
        _count: { _all: true },
      }),
    ]);
    const streamsOf = new Map(streamGroups.map((group) => [group.tenantBusinessId, group._count._all]));
    return {
      businesses,
      tenantUsers,
      customers,
      businessesSeries: countSeries(buckets, newBusinesses.map((row) => row.createdAt)),
      tenantUsersSeries: countSeries(buckets, newTenantUsers.map((row) => row.createdAt)),
      customersSeries: countSeries(buckets, newCustomers.map((row) => row.createdAt)),
      topBusinesses: ranked
        .map((business) => ({
          id: business.id,
          name: business.name,
          customers: business._count.customers,
          streams: streamsOf.get(business.id) ?? 0,
        }))
        .sort((a, b) => b.customers - a.customers || b.streams - a.streams)
        .slice(0, 6),
    };
  }

  private async infrastructure() {
    const liveStream = LIVE_STREAM;
    const [servers, streams, enabled, billingOff] = await Promise.all([
      this.prisma.tenantFlussonicServer.findMany({
        where: { status: { not: 'DELETED' } },
        select: { id: true, name: true, status: true, connectionStatus: true, tenantBusiness: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.tenantStream.count({ where: liveStream }),
      this.prisma.tenantStream.count({ where: { ...liveStream, disabled: false } }),
      this.prisma.tenantStream.count({ where: { ...liveStream, disabled: true, billingDisabledAt: { not: null } } }),
    ]);
    const countBy = (status: string) => servers.filter((server) => server.connectionStatus === status).length;
    return {
      servers: {
        total: servers.length,
        active: servers.filter((server) => server.status === 'ACTIVE').length,
        connected: countBy('CONNECTED'),
        unreachable: countBy('UNREACHABLE'),
        unauthorized: countBy('UNAUTHORIZED'),
        unknown: countBy('UNKNOWN'),
      },
      streams: { total: streams, enabled, billingOff, disabled: Math.max(0, streams - enabled) },
      attention: servers
        .filter((server) => server.status === 'ACTIVE' && ['UNREACHABLE', 'UNAUTHORIZED'].includes(server.connectionStatus))
        .slice(0, 8)
        .map((server) => ({
          id: server.id,
          name: server.name,
          business: server.tenantBusiness.name,
          status: server.status,
          connectionStatus: server.connectionStatus,
        })),
    };
  }

  private async billing(buckets: Bucket[]) {
    const window = { gte: buckets[0].start, lt: buckets[buckets.length - 1].end };
    const [invoices, payments, open] = await Promise.all([
      this.prisma.tenantInvoice.findMany({
        where: { status: { not: 'DRAFT' }, issueDate: window },
        select: { currency: true, issueDate: true },
      }),
      this.prisma.tenantPayment.findMany({
        where: { status: 'RECORDED', paidAt: window },
        select: { amount: true, paidAt: true, tenantInvoice: { select: { currency: true } } },
      }),
      this.prisma.tenantInvoice.findMany({
        where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
        select: { currency: true, grandTotal: true, amountPaid: true },
      }),
    ]);

    const byCurrency = new Map<
      string,
      { invoicesSeries: number[]; collectedSeries: number[]; invoices: number; collected: number; outstanding: number }
    >();
    const entry = (currency: string) => {
      let value = byCurrency.get(currency);
      if (!value) {
        value = { invoicesSeries: buckets.map(() => 0), collectedSeries: buckets.map(() => 0), invoices: 0, collected: 0, outstanding: 0 };
        byCurrency.set(currency, value);
      }
      return value;
    };
    for (const invoice of invoices) {
      if (invoice.issueDate === null) continue;
      const i = bucketIndex(buckets, invoice.issueDate);
      if (i < 0) continue;
      const e = entry(invoice.currency);
      e.invoicesSeries[i]++;
      e.invoices++;
    }
    for (const payment of payments) {
      const i = bucketIndex(buckets, payment.paidAt);
      if (i < 0) continue;
      const e = entry(payment.tenantInvoice.currency);
      const cents = toCents(payment.amount);
      e.collectedSeries[i] += cents;
      e.collected += cents;
    }
    for (const invoice of open) {
      entry(invoice.currency).outstanding += toCents(invoice.grandTotal) - toCents(invoice.amountPaid);
    }

    return [...byCurrency.entries()]
      .map(([currency, e]) => ({
        currency,
        invoices: e.invoices,
        invoicesSeries: e.invoicesSeries,
        collected: fromCents(e.collected),
        collectedSeries: e.collectedSeries.map(fromCents),
        outstanding: fromCents(e.outstanding),
      }))
      .sort((a, b) => b.collected - a.collected || b.invoices - a.invoices);
  }

  private async access(buckets: Bucket[], at: number) {
    const created = { gte: buckets[0].start, lt: buckets[buckets.length - 1].end };
    const live = { revokedAt: null, expiresAt: { gt: at } };
    const [
      users,
      activeUsers,
      roles,
      permissions,
      activeSessions,
      activeTenantSessions,
      activeCustomerSessions,
      systemTokens,
      tenantTokens,
    ] = await Promise.all([
      this.prisma.systemUser.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.systemUser.count({ where: { status: 'ACTIVE' } }),
      this.prisma.role.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.permission.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.refreshToken.count({ where: live }),
      this.prisma.tenantRefreshToken.count({ where: live }),
      this.prisma.tenantCustomerRefreshToken.count({ where: live }),
      this.prisma.refreshToken.findMany({ where: { createdAt: created }, select: { userId: true, createdAt: true } }),
      this.prisma.tenantRefreshToken.findMany({ where: { createdAt: created }, select: { tenantUserId: true, createdAt: true } }),
    ]);
    return {
      users,
      activeUsers,
      roles,
      permissions,
      activeSessions,
      activeTenantSessions,
      activeCustomerSessions,
      // Distinct users who started or renewed a session in each bucket.
      systemUsersSeries: distinctSeries(buckets, systemTokens.map((t) => [t.userId, t.createdAt])),
      tenantUsersSeries: distinctSeries(buckets, tenantTokens.map((t) => [t.tenantUserId, t.createdAt])),
    };
  }
}
