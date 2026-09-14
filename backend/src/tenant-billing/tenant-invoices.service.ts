import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TenantSubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { listResponse, paginate } from '../common/dto/query.dto';
import { TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantBillingSettingsService } from './tenant-billing-settings.service';
import { getMappedBusinessId } from './billing-scope';
import { activateInvoiceSubscriptions } from './subscription-activation';
import {
  addDuration,
  calendarDate,
  computeLine,
  computeTotals,
  formatInvoiceNumber,
  LineAmounts,
  nextPeriods,
  startOfDate,
} from './billing-math';
import { recordPaymentIncome, voidPaymentIncome } from '../tenant-income-expenses/payment-income';
import { BillingLifecycleService } from './billing-lifecycle.service';
import {
  BillableCustomersQueryDto,
  CreateInvoiceDto,
  InvoiceListQueryDto,
  RecordPaymentDto,
  VoidInvoiceDto,
} from './dto/tenant-invoice.dto';

type Db = Prisma.TransactionClient;

/** Subscriptions that still hold their target: at most one per server assignment or stream. */
const LIVE_STATUSES: TenantSubscriptionStatus[] = ['PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'];

const CUSTOMER_BILLING_SELECT = {
  id: true,
  customerCode: true,
  fName: true,
  lName: true,
  email: true,
  primaryMobile: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  country: true,
  pincode: true,
  taxNumber: true,
} satisfies Prisma.TenantCustomerSelect;

type BillingCustomer = Prisma.TenantCustomerGetPayload<{ select: typeof CUSTOMER_BILLING_SELECT }>;

const INVOICE_LIST_INCLUDE = {
  tenantCustomer: { select: { id: true, customerCode: true, fName: true, lName: true } },
} satisfies Prisma.TenantInvoiceInclude;

const INVOICE_DETAIL_INCLUDE = {
  ...INVOICE_LIST_INCLUDE,
  items: {
    orderBy: { sortOrder: 'asc' },
    include: {
      tenantSubscription: {
        select: {
          id: true,
          systemCode: true,
          status: true,
          planName: true,
          subscriptionFor: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          streamLimit: true,
          tenantFlussonicServer: { select: { id: true, name: true } },
          tenantStream: { select: { id: true, name: true, title: true } },
        },
      },
    },
  },
  payments: {
    orderBy: { paidAt: 'desc' },
    include: { tenantPaymentMode: { select: { id: true, paymentName: true } } },
  },
} satisfies Prisma.TenantInvoiceInclude;

type InvoiceListRow = Prisma.TenantInvoiceGetPayload<{ include: typeof INVOICE_LIST_INCLUDE }>;
type InvoiceDetailRow = Prisma.TenantInvoiceGetPayload<{ include: typeof INVOICE_DETAIL_INCLUDE }>;

interface TargetAssignment {
  id: string;
  tenantCustomerId: string;
  tenantFlussonicServerId: string;
  streamLimit: number | null;
  isDedicated: boolean;
}

type BillingTarget = {
  customer: BillingCustomer;
  serverId: string;
  serverName: string;
  /** "Server Chennai-01" / "Stream News HD (live/news_hd)" - for descriptions and messages. */
  label: string;
} & (
  | { subscriptionFor: 'SERVER'; assignment: TargetAssignment; stream: null }
  // A stream is billed on its own; the assignment is linked only when one exists.
  | { subscriptionFor: 'STREAM'; assignment: TargetAssignment | null; stream: { id: string; name: string; title: string } }
);

const customerName = (c: { fName: string; lName: string | null }) =>
  [c.fName, c.lName].filter(Boolean).join(' ');

const durationLabel = (value: number, unit: string) =>
  `${value} ${unit.toLowerCase()}${value === 1 ? '' : 's'}`;

function badRequestFromRange<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof RangeError) throw new BadRequestException(error.message);
    throw error;
  }
}

/** Overdue is derived rather than stored, so nothing has to flip rows as time passes. */
function isOverdue(row: { status: string; dueDate: bigint | null }) {
  return (
    (row.status === 'ISSUED' || row.status === 'PARTIALLY_PAID') &&
    row.dueDate !== null &&
    Number(row.dueDate) < now()
  );
}

/** Decimal columns JSON-encode as strings, so money leaves the API as numbers. */
function serializeInvoiceSummary(row: InvoiceListRow) {
  const { tenantCustomer, subtotal, discountTotal, taxTotal, grandTotal, amountPaid, ...rest } = row;
  return {
    ...rest,
    subtotal: Number(subtotal),
    discountTotal: Number(discountTotal),
    taxTotal: Number(taxTotal),
    grandTotal: Number(grandTotal),
    amountPaid: Number(amountPaid),
    balanceDue: Number(grandTotal.minus(amountPaid)),
    isOverdue: isOverdue(row),
    customer: {
      id: tenantCustomer.id,
      customerCode: tenantCustomer.customerCode,
      name: customerName(tenantCustomer),
    },
  };
}

/** Vendor-specific relation names are renamed to the neutral API names. */
function serializeInvoice(row: InvoiceDetailRow) {
  const { items, payments, ...summary } = row;
  return {
    ...serializeInvoiceSummary(summary),
    items: items.map(({ tenantSubscription, unitPrice, discount, taxValue, taxAmount, lineTotal, ...item }) => {
      const { tenantFlussonicServer, tenantStream, ...rest } = tenantSubscription ?? {};
      const subscription = tenantSubscription
        ? { ...rest, server: tenantFlussonicServer, stream: tenantStream }
        : null;
      return {
        ...item,
        unitPrice: Number(unitPrice),
        discount: Number(discount),
        taxValue: taxValue === null ? null : Number(taxValue),
        taxAmount: Number(taxAmount),
        lineTotal: Number(lineTotal),
        subscription,
      };
    }),
    payments: payments.map(({ tenantPaymentMode, amount, ...payment }) => ({
      ...payment,
      amount: Number(amount),
      paymentMode: tenantPaymentMode,
    })),
  };
}

/**
 * Invoices for streams and servers assigned to a tenant's customers.
 *
 * Creating an invoice issues it immediately, with the next number in the
 * business's gapless sequence, and opens (or renews) the subscription it bills.
 * The subscription becomes ACTIVE for the invoiced period when the invoice is
 * paid - any amount - or on issue, if billing settings say so.
 */
@Injectable()
export class TenantInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TenantBillingSettingsService,
    private readonly lifecycle: BillingLifecycleService,
  ) {}

  // ---------- Form options ----------

  async optionsForTenantUser(tenantUserId: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const settings = await this.settings.findOrCreate(businessId, tenantUserId);
    const [plans, taxTypes] = await Promise.all([
      this.prisma.tenantSubscriptionPlan.findMany({
        where: { tenantBusinessId: businessId, status: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          subscriptionFor: true,
          durationValue: true,
          durationUnit: true,
          customerPrice: true,
          orginalPrice: true,
          maxServerStream: true,
          maxPlaySession: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.tenantTaxType.findMany({
        where: { tenantBusinessId: businessId, status: 'ACTIVE' },
        select: { id: true, taxName: true, calculationType: true, value: true },
        orderBy: { taxName: 'asc' },
      }),
    ]);
    return {
      currency: settings.currency,
      activateOn: settings.activateOn,
      invoiceDueDays: settings.invoiceDueDays,
      defaultTaxTypeId: settings.defaultTaxType?.status === 'ACTIVE' ? settings.defaultTaxTypeId : null,
      plans: plans.map((plan) => ({
        ...plan,
        customerPrice: Number(plan.customerPrice),
        orginalPrice: Number(plan.orginalPrice),
      })),
      taxTypes,
    };
  }

  /** Customers with an active server assignment or a stream - the only ones there is anything to bill. */
  async billableCustomersForTenantUser(tenantUserId: string, query: BillableCustomersQueryDto) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const customers = await this.prisma.tenantCustomer.findMany({
      where: {
        tenantBusinessId: businessId,
        status: { not: 'DELETED' },
        AND: [
          {
            OR: [
              { assignedServers: { some: { status: 'ACTIVE' } } },
              { streams: { some: { status: { not: 'DELETED' } } } },
            ],
          },
        ],
        ...(query.search
          ? {
              OR: [
                { fName: { contains: query.search } },
                { lName: { contains: query.search } },
                { customerCode: { contains: query.search } },
                { primaryMobile: { contains: query.search } },
              ],
            }
          : {}),
      },
      select: { id: true, customerCode: true, fName: true, lName: true, primaryMobile: true },
      orderBy: { fName: 'asc' },
      take: 200,
    });
    return customers.map((c) => ({
      id: c.id,
      customerCode: c.customerCode,
      name: customerName(c),
      primaryMobile: c.primaryMobile,
    }));
  }

  /** What can be billed for one customer: their assigned servers and all of their streams. */
  async billablesForTenantUser(tenantUserId: string, customerId: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id: customerId, tenantBusinessId: businessId, status: { not: 'DELETED' } },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const assignments = await this.prisma.tenantCustomerServer.findMany({
      where: { tenantBusinessId: businessId, tenantCustomerId: customerId, status: 'ACTIVE' },
      include: { tenantFlussonicServer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const [streams, subscriptions] = await Promise.all([
      this.prisma.tenantStream.findMany({
        where: {
          tenantBusinessId: businessId,
          tenantCustomerId: customerId,
          status: { not: 'DELETED' },
        },
        select: {
          id: true,
          name: true,
          title: true,
          disabled: true,
          tenantFlussonicServerId: true,
          tenantFlussonicServer: { select: { name: true } },
        },
        orderBy: { title: 'asc' },
      }),
      this.prisma.tenantSubscription.findMany({
        where: { tenantBusinessId: businessId, tenantCustomerId: customerId, status: { in: LIVE_STATUSES } },
        orderBy: { createdAt: 'desc' },
        include: {
          invoiceItems: {
            where: { tenantInvoice: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } },
            select: { tenantInvoice: { select: { id: true, invoiceNumber: true } } },
            take: 1,
          },
        },
      }),
    ]);

    const summary = (subscription: (typeof subscriptions)[number] | undefined) =>
      subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            planId: subscription.tenantSubscriptionPlanId,
            planName: subscription.planName,
            currentPeriodEnd:
              subscription.currentPeriodEnd === null ? null : Number(subscription.currentPeriodEnd),
            openInvoice: subscription.invoiceItems[0]?.tenantInvoice ?? null,
          }
        : null;

    return {
      servers: assignments.map((assignment) => ({
        assignmentId: assignment.id,
        serverId: assignment.tenantFlussonicServerId,
        serverName: assignment.tenantFlussonicServer.name,
        streamLimit: assignment.streamLimit,
        streamsUsed: streams.filter((s) => s.tenantFlussonicServerId === assignment.tenantFlussonicServerId)
          .length,
        isDedicated: assignment.isDedicated,
        subscription: summary(
          subscriptions.find(
            (s) => s.subscriptionFor === 'SERVER' && s.tenantCustomerServerId === assignment.id,
          ),
        ),
      })),
      streams: streams.map((stream) => ({
        streamId: stream.id,
        name: stream.name,
        title: stream.title,
        serverName: stream.tenantFlussonicServer.name,
        disabled: stream.disabled,
        subscription: summary(
          subscriptions.find((s) => s.subscriptionFor === 'STREAM' && s.tenantStreamId === stream.id),
        ),
      })),
    };
  }

  async paymentModesForTenantUser(tenantUserId: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    return this.prisma.tenantPaymentMode.findMany({
      where: { tenantBusinessId: businessId, status: 'ACTIVE' },
      select: { id: true, paymentName: true },
      orderBy: { paymentName: 'asc' },
    });
  }

  // ---------- Preview and create ----------

  async previewForTenantUser(user: TenantAuthUser, dto: CreateInvoiceDto) {
    const businessId = await getMappedBusinessId(this.prisma, user.id);
    await this.settings.findOrCreate(businessId, user.id);
    const quote = await this.quote(this.prisma, businessId, dto, this.canDiscount(user));
    return {
      kind: quote.kind === 'SUBSCRIPTION_RENEWAL' ? 'RENEWAL' : 'NEW',
      billFor: quote.target.subscriptionFor,
      target: {
        label: quote.target.label,
        serverName: quote.target.serverName,
        stream: quote.target.stream,
      },
      plan: {
        id: quote.planId,
        name: quote.planName,
        durationValue: quote.durationValue,
        durationUnit: quote.durationUnit,
      },
      currentSubscription: quote.live
        ? {
            id: quote.live.id,
            status: quote.live.status,
            currentPeriodEnd:
              quote.live.currentPeriodEnd === null ? null : Number(quote.live.currentPeriodEnd),
          }
        : null,
      periods: quote.periods,
      periodStart: quote.periodStart,
      periodEnd: quote.periodEnd,
      currency: quote.settings.currency,
      line: {
        description: quote.description,
        unitPrice: Number(quote.line.gross),
        discount: Number(quote.line.discount),
        taxName: quote.tax?.taxName ?? null,
        taxAmount: Number(quote.line.taxAmount),
        lineTotal: Number(quote.line.lineTotal),
      },
      totals: {
        subtotal: Number(quote.totals.subtotal),
        discountTotal: Number(quote.totals.discountTotal),
        taxTotal: Number(quote.totals.taxTotal),
        grandTotal: Number(quote.totals.grandTotal),
      },
      issueDate: quote.issueDate,
      dueDate: quote.dueDate,
      activateOn: quote.settings.activateOn,
      streamLimit: quote.target.subscriptionFor === 'SERVER' ? quote.streamLimit : undefined,
      warnings: quote.warnings,
    };
  }

  async createForTenantUser(user: TenantAuthUser, dto: CreateInvoiceDto) {
    if (dto.payment && !user.permissions.includes('tenant-payments:create')) {
      throw new ForbiddenException('You do not have permission to record a payment');
    }
    const businessId = await getMappedBusinessId(this.prisma, user.id);
    await this.settings.findOrCreate(businessId, user.id);
    const canDiscount = this.canDiscount(user);

    let result: { invoiceId: string; warnings: string[] };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          // Serialises invoice creation per business: the number sequence and the
          // one-open-invoice-per-target rule must both see a stable state.
          await tx.$queryRaw`SELECT id FROM tenant_billing_settings WHERE tenantBusinessId = ${businessId} FOR UPDATE`;
          const quote = await this.quote(tx, businessId, dto, canDiscount);
          const timestamp = now();

          const invoiceNumber = formatInvoiceNumber(
            quote.settings.invoicePrefix,
            quote.settings.nextInvoiceNumber,
          );
          await tx.tenantBillingSettings.update({
            where: { tenantBusinessId: businessId },
            data: { nextInvoiceNumber: { increment: 1 }, updatedAt: timestamp, updatedBy: user.id },
          });

          let subscriptionId = quote.live?.id;
          if (!subscriptionId) {
            subscriptionId = newId();
            await tx.tenantSubscription.create({
              data: {
                id: subscriptionId,
                systemCode: newSystemCode('SBS'),
                tenantBusinessId: businessId,
                tenantCustomerId: quote.target.customer.id,
                tenantSubscriptionPlanId: quote.planId,
                tenantFlussonicServerId: quote.target.serverId,
                tenantCustomerServerId: quote.target.assignment?.id ?? null,
                tenantStreamId: quote.target.stream?.id ?? null,
                subscriptionFor: quote.target.subscriptionFor,
                planName: quote.planName,
                streamLimit: quote.streamLimit,
                maxPlaySession: quote.maxPlaySession,
                playbackProtocols: quote.playbackProtocols ?? Prisma.DbNull,
                durationValue: quote.durationValue,
                durationUnit: quote.durationUnit,
                unitPrice: quote.unitPrice,
                isDedicated: quote.target.assignment?.isDedicated ?? false,
                status: 'PENDING_PAYMENT',
                createdAt: timestamp,
                createdBy: user.id,
                updatedAt: timestamp,
                updatedBy: user.id,
              },
            });
          }

          const business = await tx.tenantBusiness.findUniqueOrThrow({ where: { id: businessId } });
          const customer = quote.target.customer;
          const free = quote.totals.grandTotal.isZero();
          const invoice = await tx.tenantInvoice.create({
            data: {
              id: newId(),
              systemCode: newSystemCode('INV'),
              tenantBusinessId: businessId,
              tenantCustomerId: customer.id,
              invoiceNumber,
              // Nothing to collect on a fully discounted invoice.
              status: free ? 'PAID' : 'ISSUED',
              currency: quote.settings.currency,
              issueDate: quote.issueDate,
              dueDate: quote.dueDate,
              subtotal: quote.totals.subtotal,
              discountTotal: quote.totals.discountTotal,
              taxTotal: quote.totals.taxTotal,
              grandTotal: quote.totals.grandTotal,
              billedTo: {
                name: customerName(customer),
                customerCode: customer.customerCode,
                email: customer.email,
                phone: customer.primaryMobile,
                addressLine1: customer.addressLine1,
                addressLine2: customer.addressLine2,
                city: customer.city,
                state: customer.state,
                country: customer.country,
                pincode: customer.pincode,
                taxNumber: customer.taxNumber,
              },
              billedFrom: {
                name: business.name,
                email: business.email,
                phone: business.phone,
                addressLine1: business.addressLine1,
                addressLine2: business.addressLine2,
                city: business.city,
                state: business.state,
                country: business.country,
                pincode: business.pincode,
                taxNumber: business.taxNumber,
                logoPath: business.logoPath,
              },
              notes: dto.notes ?? null,
              createdAt: timestamp,
              createdBy: user.id,
              updatedAt: timestamp,
              updatedBy: user.id,
              items: {
                create: [
                  {
                    id: newId(),
                    tenantSubscriptionId: subscriptionId,
                    kind: quote.kind,
                    description: quote.description,
                    periodStart: quote.periodStart,
                    periodEnd: quote.periodEnd,
                    quantity: quote.periods,
                    unitPrice: quote.unitPrice,
                    discount: quote.line.discount,
                    taxName: quote.tax?.taxName ?? null,
                    taxCalculationType: quote.tax?.calculationType ?? null,
                    taxValue: quote.tax ? new Prisma.Decimal(quote.tax.value) : null,
                    taxAmount: quote.line.taxAmount,
                    lineTotal: quote.line.lineTotal,
                    sortOrder: 0,
                  },
                ],
              },
            },
          });

          const warnings = [...quote.warnings];
          if (free || quote.settings.activateOn === 'ISSUE') {
            warnings.push(...(await activateInvoiceSubscriptions(tx, invoice.id, user.id)));
          }
          if (dto.payment) {
            if (free) throw new BadRequestException('This invoice has nothing to collect');
            // Activation is idempotent, so a payment after an on-issue
            // activation changes nothing further.
            warnings.push(...(await this.applyPayment(tx, businessId, invoice.id, dto.payment, user.id)));
          }
          return { invoiceId: invoice.id, warnings };
        },
        { timeout: 20000 },
      );
    } catch (error) {
      // @@unique([tenantSubscriptionId, periodStart]) - the period is already on an invoice.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('This period has already been invoiced');
      }
      throw error;
    }
    // Streams come on (or stay off) now, not at the next scheduled run.
    this.lifecycle.enforceForCustomerSoon(dto.customerId);
    return { ...(await this.findOne(businessId, result.invoiceId)), warnings: result.warnings };
  }

  /**
   * Everything an invoice needs, computed and validated but not written. Shared
   * by preview and create, so the page shows exactly what will be issued.
   */
  private async quote(db: Db, businessId: string, dto: CreateInvoiceDto, canDiscount: boolean) {
    const settings = await db.tenantBillingSettings.findUniqueOrThrow({
      where: { tenantBusinessId: businessId },
    });
    const target = await this.resolveTarget(db, businessId, dto);
    const live = await db.tenantSubscription.findFirst({
      where: {
        tenantBusinessId: businessId,
        status: { in: LIVE_STATUSES },
        subscriptionFor: target.subscriptionFor,
        ...(target.subscriptionFor === 'STREAM'
          ? { tenantStreamId: target.stream.id }
          : { tenantCustomerServerId: target.assignment.id }),
      },
      orderBy: { createdAt: 'desc' },
    });
    const timestamp = now();
    const warnings: string[] = [];
    const periods = dto.periods ?? 1;

    if (live?.status === 'PENDING_PAYMENT') {
      const open = await db.tenantInvoiceItem.findFirst({
        where: {
          tenantSubscriptionId: live.id,
          tenantInvoice: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } },
        },
        select: { tenantInvoice: { select: { invoiceNumber: true } } },
      });
      throw new BadRequestException(
        `Invoice ${open?.tenantInvoice.invoiceNumber ?? ''} for ${target.label} is still unpaid. ` +
          'Collect or void it before raising another.',
      );
    }

    let kind: 'SUBSCRIPTION_NEW' | 'SUBSCRIPTION_RENEWAL';
    let planId: string;
    let planName: string;
    let durationValue: number;
    let durationUnit: 'DAY' | 'MONTH' | 'YEAR';
    let unitPrice: Prisma.Decimal;
    let streamLimit: number | null;
    let maxPlaySession: number | null;
    let playbackProtocols: Prisma.JsonValue | null;
    let periodStart: number;
    let periodEnd: number;

    if (live) {
      // Renewal: same plan, same (grandfathered) price, starting where the
      // current period ends so paying early never loses days.
      if (dto.planId && dto.planId !== live.tenantSubscriptionPlanId) {
        throw new BadRequestException(
          `${target.label} is on "${live.planName}". A renewal keeps the same plan; changing plan is not supported yet.`,
        );
      }
      if (dto.startDate) {
        throw new BadRequestException(
          'A renewal starts when the current period ends, so a start date cannot be set.',
        );
      }
      if (live.currentPeriodEnd === null) {
        throw new BadRequestException(`${target.label} has no current period to renew`);
      }
      const first = await db.tenantInvoiceItem.aggregate({
        where: {
          tenantSubscriptionId: live.id,
          periodStart: { not: null },
          tenantInvoice: { status: { not: 'VOID' } },
        },
        _min: { periodStart: true },
      });
      const anchor = Number(first._min.periodStart ?? live.currentPeriodStart ?? live.currentPeriodEnd);
      const period = badRequestFromRange(() =>
        nextPeriods(anchor, Number(live.currentPeriodEnd), live.durationValue, live.durationUnit, periods),
      );

      kind = 'SUBSCRIPTION_RENEWAL';
      planId = live.tenantSubscriptionPlanId;
      planName = live.planName;
      durationValue = live.durationValue;
      durationUnit = live.durationUnit;
      unitPrice = live.unitPrice;
      streamLimit = live.streamLimit;
      maxPlaySession = live.maxPlaySession;
      playbackProtocols = live.playbackProtocols;
      periodStart = period.start;
      periodEnd = period.end;
    } else {
      if (!dto.planId) throw new BadRequestException('Choose a plan');
      const plan = await db.tenantSubscriptionPlan.findFirst({
        where: { id: dto.planId, tenantBusinessId: businessId, status: 'ACTIVE' },
      });
      if (!plan) throw new BadRequestException('Plan not found or not active');
      if (plan.subscriptionFor !== target.subscriptionFor) {
        throw new BadRequestException(
          `"${plan.name}" is a ${plan.subscriptionFor.toLowerCase()} plan and cannot bill a ${target.subscriptionFor.toLowerCase()}`,
        );
      }

      // A STREAM plan covers the one stream it is bought for, so only SERVER
      // plans carry a stream cap onto the assignment.
      const limit = plan.subscriptionFor === 'SERVER' ? plan.maxServerStream : null;
      if (limit !== null) {
        const used = await db.tenantStream.count({
          where: {
            tenantCustomerId: target.customer.id,
            tenantFlussonicServerId: target.serverId,
            status: { not: 'DELETED' },
          },
        });
        if (used > limit) {
          throw new BadRequestException(
            `"${plan.name}" allows ${limit} stream(s), but the customer already runs ${used} on ${target.serverName}.`,
          );
        }
      }

      kind = 'SUBSCRIPTION_NEW';
      planId = plan.id;
      planName = plan.name;
      durationValue = plan.durationValue;
      durationUnit = plan.durationUnit;
      unitPrice = plan.customerPrice;
      streamLimit = limit;
      maxPlaySession = plan.maxPlaySession;
      playbackProtocols = plan.playbackProtocols;
      // Today (or no date) starts at this moment, and moves to the moment the
      // invoice activates; a later date starts at that day's midnight.
      const today = calendarDate(timestamp);
      if (dto.startDate && dto.startDate < today) {
        throw new BadRequestException('The start date cannot be in the past');
      }
      periodStart =
        !dto.startDate || dto.startDate === today
          ? timestamp
          : badRequestFromRange(() => startOfDate(dto.startDate!));
      // One addition from the start, not one per period, so month-end clamping
      // cannot accumulate across the periods billed ahead.
      periodEnd = addDuration(periodStart, plan.durationValue * periods, plan.durationUnit);
    }

    // Omitted means the business default; an explicit null means no tax.
    const taxTypeId = dto.taxTypeId === undefined ? settings.defaultTaxTypeId : dto.taxTypeId;
    let tax: { taxName: string; calculationType: 'PERCENTAGE' | 'FIXED'; value: number } | null = null;
    if (taxTypeId) {
      tax = await db.tenantTaxType.findFirst({
        where: { id: taxTypeId, tenantBusinessId: businessId, status: 'ACTIVE' },
        select: { taxName: true, calculationType: true, value: true },
      });
      if (!tax && dto.taxTypeId !== undefined) {
        throw new BadRequestException('Tax type not found or not active');
      }
      if (!tax) warnings.push('The default tax type is no longer active, so no tax was applied.');
    }

    if (dto.discount && !canDiscount) {
      throw new ForbiddenException('You do not have permission to add a discount');
    }

    const line: LineAmounts = badRequestFromRange(() =>
      computeLine({
        quantity: periods,
        unitPrice,
        discount: dto.discount ?? 0,
        tax: tax ? { calculationType: tax.calculationType, value: tax.value } : null,
      }),
    );

    const description =
      `${planName}${kind === 'SUBSCRIPTION_RENEWAL' ? ' renewal' : ''} ` +
      `(${periods > 1 ? `${periods} x ` : ''}${durationLabel(durationValue, durationUnit)}) - ${target.label}`;

    return {
      settings,
      target,
      live,
      kind,
      periods,
      planId,
      planName,
      durationValue,
      durationUnit,
      unitPrice,
      streamLimit,
      maxPlaySession,
      playbackProtocols,
      periodStart,
      periodEnd,
      tax,
      line,
      totals: computeTotals([line]),
      description: description.slice(0, 255),
      issueDate: timestamp,
      dueDate:
        settings.invoiceDueDays > 0 ? addDuration(timestamp, settings.invoiceDueDays, 'DAY') : timestamp,
      warnings,
    };
  }

  private async resolveTarget(db: Db, businessId: string, dto: CreateInvoiceDto): Promise<BillingTarget> {
    const customer = await db.tenantCustomer.findFirst({
      where: { id: dto.customerId, tenantBusinessId: businessId, status: { not: 'DELETED' } },
      select: CUSTOMER_BILLING_SELECT,
    });
    if (!customer) throw new BadRequestException('Customer not found in your business');

    if (dto.billFor === 'SERVER') {
      const assignment = await db.tenantCustomerServer.findFirst({
        where: {
          id: dto.assignmentId,
          tenantBusinessId: businessId,
          tenantCustomerId: customer.id,
          status: 'ACTIVE',
        },
        include: { tenantFlussonicServer: { select: { name: true } } },
      });
      if (!assignment) {
        throw new BadRequestException('This server is not actively assigned to the customer');
      }
      return {
        customer,
        subscriptionFor: 'SERVER',
        assignment,
        serverId: assignment.tenantFlussonicServerId,
        serverName: assignment.tenantFlussonicServer.name,
        stream: null,
        label: `Server ${assignment.tenantFlussonicServer.name}`,
      };
    }

    const stream = await db.tenantStream.findFirst({
      where: {
        id: dto.streamId,
        tenantBusinessId: businessId,
        tenantCustomerId: customer.id,
        status: { not: 'DELETED' },
      },
      select: {
        id: true,
        name: true,
        title: true,
        tenantFlussonicServerId: true,
        tenantFlussonicServer: { select: { name: true } },
      },
    });
    if (!stream) throw new BadRequestException('Stream not found for this customer');
    const assignment = await db.tenantCustomerServer.findFirst({
      where: {
        tenantBusinessId: businessId,
        tenantCustomerId: customer.id,
        tenantFlussonicServerId: stream.tenantFlussonicServerId,
        status: 'ACTIVE',
      },
    });
    return {
      customer,
      subscriptionFor: 'STREAM',
      assignment,
      serverId: stream.tenantFlussonicServerId,
      serverName: stream.tenantFlussonicServer.name,
      stream: { id: stream.id, name: stream.name, title: stream.title },
      label: `Stream ${stream.title} (${stream.name})`,
    };
  }

  private canDiscount(user: TenantAuthUser) {
    return user.permissions.includes('tenant-invoices:add_discount');
  }

  // ---------- Read ----------

  async listForTenantUser(tenantUserId: string, query: InvoiceListQueryDto) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const { page, limit, search, status, customerId, sortBy, sortOrder } = query;
    const where: Prisma.TenantInvoiceWhereInput = {
      tenantBusinessId: businessId,
      ...(status ? { status } : {}),
      ...(customerId ? { tenantCustomerId: customerId } : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search } },
              { tenantCustomer: { fName: { contains: search } } },
              { tenantCustomer: { lName: { contains: search } } },
              { tenantCustomer: { customerCode: { contains: search } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantInvoice.findMany({
        where,
        include: INVOICE_LIST_INCLUDE,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      this.prisma.tenantInvoice.count({ where }),
    ]);
    return listResponse(items.map(serializeInvoiceSummary), total, page, limit);
  }

  async findOneForTenantUser(tenantUserId: string, id: string) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    return this.findOne(businessId, id);
  }

  private async findOne(businessId: string, id: string) {
    const invoice = await this.prisma.tenantInvoice.findFirst({
      where: { id, tenantBusinessId: businessId },
      include: INVOICE_DETAIL_INCLUDE,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return serializeInvoice(invoice);
  }

  // ---------- Payments and void ----------

  async recordPaymentForTenantUser(tenantUserId: string, invoiceId: string, dto: RecordPaymentDto) {
    const businessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const warnings = await this.prisma.$transaction(
      (tx) => this.applyPayment(tx, businessId, invoiceId, dto, tenantUserId),
      { timeout: 20000 },
    );
    const invoice = await this.findOne(businessId, invoiceId);
    this.lifecycle.enforceForCustomerSoon(invoice.customer.id);
    return { ...invoice, warnings };
  }

  /**
   * Records one payment inside the caller's transaction: the payment row, the
   * invoice balance and status, the income entry it books, and - once paid in
   * full - the subscription's activation. Shared by "Record payment" and by
   * collecting a payment while creating the invoice, so both follow one rule set.
   */
  private async applyPayment(
    tx: Db,
    businessId: string,
    invoiceId: string,
    dto: RecordPaymentDto,
    actorId: string,
  ): Promise<string[]> {
    const timestamp = now();
    const today = calendarDate(timestamp);
    if (dto.paidDate && dto.paidDate > today) {
      throw new BadRequestException('Payment date cannot be in the future');
    }
    const paidAt =
      !dto.paidDate || dto.paidDate === today
        ? timestamp
        : badRequestFromRange(() => startOfDate(dto.paidDate!));

    // Two payments recorded at once must not both fit into the same balance.
    await tx.$queryRaw`SELECT id FROM tenant_invoices WHERE id = ${invoiceId} AND tenantBusinessId = ${businessId} FOR UPDATE`;
    const invoice = await tx.tenantInvoice.findFirst({
      where: { id: invoiceId, tenantBusinessId: businessId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'ISSUED' && invoice.status !== 'PARTIALLY_PAID') {
      throw new BadRequestException(
        `A ${invoice.status.toLowerCase().replace('_', ' ')} invoice cannot take payments`,
      );
    }
    const mode = await tx.tenantPaymentMode.findFirst({
      where: { id: dto.paymentModeId, tenantBusinessId: businessId, status: 'ACTIVE' },
    });
    if (!mode) throw new BadRequestException('Payment mode not found or not active');

    const amount = new Prisma.Decimal(dto.amount);
    const balance = invoice.grandTotal.minus(invoice.amountPaid);
    if (amount.greaterThan(balance)) {
      throw new BadRequestException(`Amount exceeds the balance due of ${balance.toFixed(2)}`);
    }

    const payment = await tx.tenantPayment.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('PAY'),
        tenantBusinessId: businessId,
        tenantCustomerId: invoice.tenantCustomerId,
        tenantInvoiceId: invoice.id,
        tenantPaymentModeId: mode.id,
        amount,
        paidAt,
        referenceNo: dto.referenceNo ?? null,
        remark: dto.remark ?? null,
        createdAt: timestamp,
        createdBy: actorId,
        updatedAt: timestamp,
        updatedBy: actorId,
      },
    });
    const amountPaid = invoice.amountPaid.plus(amount);
    const paidInFull = amountPaid.equals(invoice.grandTotal);
    await tx.tenantInvoice.update({
      where: { id: invoice.id },
      data: {
        amountPaid,
        status: paidInFull ? 'PAID' : 'PARTIALLY_PAID',
        updatedAt: timestamp,
        updatedBy: actorId,
      },
    });
    await recordPaymentIncome(tx, payment, invoice.invoiceNumber, actorId, timestamp);
    // Any payment puts the service into effect. Activation is idempotent, so
    // later payments on the same invoice change nothing further.
    return activateInvoiceSubscriptions(tx, invoice.id, actorId);
  }

  /**
   * Cancels an invoice - unpaid, part paid or paid. Its number stays used and
   * the status becomes VOID. Recorded payments are voided with it, together
   * with the income entries they booked. The subscription it opened is
   * cancelled; a renewal it added is rolled back to the previous period end.
   * Stream limits already written to the assignment are not reverted.
   */
  async voidForTenantUser(user: TenantAuthUser, invoiceId: string, dto: VoidInvoiceDto) {
    const businessId = await getMappedBusinessId(this.prisma, user.id);
    const timestamp = now();

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tenant_invoices WHERE id = ${invoiceId} AND tenantBusinessId = ${businessId} FOR UPDATE`;
      const invoice = await tx.tenantInvoice.findFirst({
        where: { id: invoiceId, tenantBusinessId: businessId },
        include: {
          items: { include: { tenantSubscription: true } },
          payments: { where: { status: 'RECORDED' }, select: { id: true } },
        },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (!['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status)) {
        throw new BadRequestException('Only an issued or paid invoice can be cancelled');
      }
      if (invoice.payments.length > 0 && !user.permissions.includes('tenant-payments:void')) {
        throw new ForbiddenException(
          'This invoice has payments. Cancelling it voids them, which requires tenant-payments:void',
        );
      }

      // Rolling back a period is only safe for the latest one: an earlier
      // invoice cancelled under a later one would leave the later period
      // hanging off a gap.
      for (const item of invoice.items) {
        if (!item.tenantSubscriptionId || item.periodEnd === null) continue;
        const later = await tx.tenantInvoiceItem.findFirst({
          where: {
            tenantSubscriptionId: item.tenantSubscriptionId,
            tenantInvoiceId: { not: invoice.id },
            periodStart: { gte: item.periodEnd },
            tenantInvoice: { status: { not: 'VOID' } },
          },
          select: { tenantInvoice: { select: { invoiceNumber: true } } },
        });
        if (later) {
          throw new BadRequestException(
            `Invoice ${later.tenantInvoice.invoiceNumber ?? ''} bills a later period of the same subscription. Cancel it first.`,
          );
        }
      }

      await tx.tenantInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'VOID',
          amountPaid: 0,
          voidedAt: timestamp,
          voidedBy: user.id,
          voidReason: dto.reason,
          updatedAt: timestamp,
          updatedBy: user.id,
        },
      });

      if (invoice.payments.length > 0) {
        const paymentIds = invoice.payments.map((payment) => payment.id);
        await tx.tenantPayment.updateMany({
          where: { id: { in: paymentIds } },
          data: {
            status: 'VOID',
            voidedAt: timestamp,
            voidedBy: user.id,
            voidReason: dto.reason,
            updatedAt: timestamp,
            updatedBy: user.id,
          },
        });
        await voidPaymentIncome(tx, paymentIds, user.id, timestamp);
      }

      const tenantUserId = user.id;
      for (const item of invoice.items) {
        const subscription = item.tenantSubscription;
        if (!subscription || item.periodStart === null || item.periodEnd === null) continue;
        const openedByThisInvoice =
          subscription.status === 'PENDING_PAYMENT' ||
          (subscription.status === 'ACTIVE' &&
            subscription.currentPeriodStart === item.periodStart &&
            subscription.currentPeriodEnd === item.periodEnd);
        const renewedByThisInvoice =
          subscription.status === 'ACTIVE' && subscription.currentPeriodEnd === item.periodEnd;

        if (openedByThisInvoice) {
          await tx.tenantSubscription.update({
            where: { id: subscription.id },
            data: {
              status: 'CANCELLED',
              cancelledAt: timestamp,
              cancelledBy: tenantUserId,
              updatedAt: timestamp,
              updatedBy: tenantUserId,
            },
          });
        } else if (renewedByThisInvoice) {
          await tx.tenantSubscription.update({
            where: { id: subscription.id },
            data: { currentPeriodEnd: item.periodStart, updatedAt: timestamp, updatedBy: tenantUserId },
          });
        }
      }
    });
    const invoice = await this.findOne(businessId, invoiceId);
    this.lifecycle.enforceForCustomerSoon(invoice.customer.id);
    return invoice;
  }
}
