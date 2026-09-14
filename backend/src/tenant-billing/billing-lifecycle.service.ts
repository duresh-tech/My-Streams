import { ConflictException, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { newId, now } from '../common/utils/id.util';
import { TenantStreamsService } from '../tenant-streams/tenant-streams.service';
import { TenantStreamSyncService } from '../tenant-streams/tenant-stream-sync.service';
import { accessState, graceDaysFor, loadCoverage, streamAccess } from './billing-access';
import { getMappedBusinessId } from './billing-scope';
import { activateInvoiceSubscriptions } from './subscription-activation';
import { TenantBillingSettingsService } from './tenant-billing-settings.service';
import { LIFECYCLE_INTERVAL_PRESETS } from './dto/tenant-billing-settings.dto';

const LOCK_NAME = 'billing_lifecycle';

/**
 * The scheduler ticks on the minute, but a run starts a few seconds into it.
 * Without some slack a 5-minute business would be due a moment after the
 * fifth tick and so wait for the sixth.
 */
const DUE_SLACK_SECONDS = 30;

export type LifecycleTrigger = 'SCHEDULE' | 'MANUAL';

export interface LifecycleResult {
  trigger: LifecycleTrigger;
  startedAt: number;
  finishedAt: number;
  pastDue: number;
  suspended: number;
  /** Subscriptions put into effect because their invoice already carries a payment. */
  activated: number;
  streamsDisabled: number;
  streamsEnabled: number;
  /** Customer streams blocked by billing in this run, whether already off or not. */
  streamsBlocked: number;
  /** Blocked streams found running on the server - enabled outside this app - and switched off again. */
  streamsReDisabled: number;
  /** Streams with a valid bill found off on the server - switched off outside this app - and switched on again. */
  streamsReEnabled: number;
  failed: number;
  error: string | null;
}

interface StreamCounts {
  disabled: number;
  enabled: number;
  blocked: number;
  reDisabled: number;
  reEnabled: number;
  failed: number;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Keeps subscriptions and streams in step with billing dates, business by
 * business.
 *
 * Requests already check access from the dates on their own, so this is only
 * what nobody else would do: notice a period running out while no one is
 * using the app. For each business it marks lapsed subscriptions PAST_DUE and
 * then SUSPENDED, switches blocked customer streams off on the server, and
 * switches back on those it had switched off once they are covered again.
 *
 * A tick runs every minute and sweeps only the businesses that are due by
 * their own interval (Billing settings), so one tenant's timing never affects
 * another. Payments and cancels call `enforceForCustomerSoon`, so their effect
 * does not wait for any schedule.
 */
@Injectable()
export class BillingLifecycleService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BillingLifecycleService.name);
  private ticking = false;
  private readonly runningBusinesses = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly streams: TenantStreamsService,
    private readonly sync: TenantStreamSyncService,
    private readonly settings: TenantBillingSettingsService,
  ) {}

  onApplicationBootstrap() {
    // Catches up on businesses that fell due while the app was down.
    void this.tick();
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'billing-lifecycle' })
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      // A MySQL named lock keeps two app instances from ticking at once. It
      // belongs to one connection, so the transaction only pins that
      // connection; the runs themselves do not happen inside it.
      await this.prisma.$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<{ acquired: bigint | number | null }[]>`SELECT GET_LOCK(${LOCK_NAME}, 0) AS acquired`;
          if (Number(lock?.acquired) !== 1) return;
          try {
            await this.runDueBusinesses();
          } finally {
            await tx.$queryRaw`SELECT RELEASE_LOCK(${LOCK_NAME})`;
          }
        },
        { maxWait: 10_000, timeout: 15 * 60_000 },
      );
    } catch (error) {
      this.logger.error(`Billing job tick failed: ${errorMessage(error)}`);
    } finally {
      this.ticking = false;
    }
  }

  // ---------- Tenant portal ----------

  async statusForTenantUser(tenantUserId: string) {
    const tenantBusinessId = await getMappedBusinessId(this.prisma, tenantUserId);
    const settings = await this.settings.findOrCreate(tenantBusinessId, tenantUserId);
    const lastRunAt = settings.lifecycleLastRunAt === null ? null : Number(settings.lifecycleLastRunAt);
    const at = now();
    return {
      intervalMinutes: settings.lifecycleIntervalMinutes,
      paused: settings.lifecyclePaused,
      running: this.runningBusinesses.has(tenantBusinessId),
      lastRunAt,
      lastResult: (settings.lifecycleLastResult as LifecycleResult | null) ?? null,
      // The first scheduler tick at or after this moment runs it.
      nextRunAt: settings.lifecyclePaused
        ? null
        : lastRunAt === null
          ? at
          : Math.max(lastRunAt + settings.lifecycleIntervalMinutes * 60, at),
      intervalPresets: LIFECYCLE_INTERVAL_PRESETS,
    };
  }

  async runNowForTenantUser(tenantUserId: string) {
    const tenantBusinessId = await getMappedBusinessId(this.prisma, tenantUserId);
    await this.settings.findOrCreate(tenantBusinessId, tenantUserId);
    const result = await this.runForBusiness(tenantBusinessId, 'MANUAL');
    if (!result) throw new ConflictException('The billing job is already running for your business');
    return this.statusForTenantUser(tenantUserId);
  }

  /** Applies a payment's or a cancel's result to one customer's streams now. Never throws. */
  enforceForCustomerSoon(customerId: string) {
    void (async () => {
      const customer = await this.prisma.tenantCustomer.findUnique({
        where: { id: customerId },
        select: { tenantBusinessId: true },
      });
      if (!customer) return;
      const graceDays = await graceDaysFor(this.prisma, customer.tenantBusinessId);
      const counts = await this.enforceStreams({ tenantCustomerId: customerId }, graceDays);
      if (counts.disabled || counts.enabled || counts.reDisabled || counts.reEnabled || counts.failed) {
        this.logger.log(
          `Customer ${customerId}: ${counts.enabled} stream(s) enabled, ${counts.disabled} disabled, ` +
            `${counts.reDisabled} re-disabled and ${counts.reEnabled} re-enabled on the server, ` +
            `${counts.failed} failed`,
        );
      }
    })().catch((error) =>
      this.logger.warn(`Could not apply billing to customer ${customerId}'s streams: ${errorMessage(error)}`),
    );
  }

  // ---------- Runs ----------

  private async runDueBusinesses() {
    await this.ensureSettingsRows();
    const at = now();
    const due = await this.prisma.tenantBillingSettings.findMany({
      where: { lifecyclePaused: false, tenantBusiness: { status: { not: 'DELETED' } } },
      select: { tenantBusinessId: true, lifecycleIntervalMinutes: true, lifecycleLastRunAt: true },
    });
    for (const row of due) {
      const lastRunAt = row.lifecycleLastRunAt === null ? null : Number(row.lifecycleLastRunAt);
      if (lastRunAt !== null && lastRunAt + row.lifecycleIntervalMinutes * 60 > at + DUE_SLACK_SECONDS) continue;
      await this.runForBusiness(row.tenantBusinessId, 'SCHEDULE');
    }
  }

  /**
   * A business with no settings row would never be swept, and its run could
   * not be recorded anywhere, so it gets the defaults here - as a first read
   * of its settings would.
   */
  private async ensureSettingsRows() {
    const missing = await this.prisma.tenantBusiness.findMany({
      where: { status: { not: 'DELETED' }, billingSettings: { is: null } },
      select: { id: true },
    });
    if (missing.length === 0) return;
    const timestamp = now();
    await this.prisma.tenantBillingSettings.createMany({
      data: missing.map((business) => ({
        id: newId(),
        tenantBusinessId: business.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
      skipDuplicates: true,
    });
  }

  /** One run for one business, recorded on its settings. Null if it is already running. */
  private async runForBusiness(
    tenantBusinessId: string,
    trigger: LifecycleTrigger,
  ): Promise<LifecycleResult | null> {
    if (this.runningBusinesses.has(tenantBusinessId)) return null;
    this.runningBusinesses.add(tenantBusinessId);

    const startedAt = now();
    const result: LifecycleResult = {
      trigger,
      startedAt,
      finishedAt: startedAt,
      pastDue: 0,
      suspended: 0,
      activated: 0,
      streamsDisabled: 0,
      streamsEnabled: 0,
      streamsBlocked: 0,
      streamsReDisabled: 0,
      streamsReEnabled: 0,
      failed: 0,
      error: null,
    };

    try {
      const graceDays = await graceDaysFor(this.prisma, tenantBusinessId);

      // Statuses follow the dates: past the end is PAST_DUE, past grace SUSPENDED.
      const lapsed = await this.prisma.tenantSubscription.findMany({
        where: { tenantBusinessId, status: { in: ['ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { lte: startedAt } },
        select: { id: true, status: true, currentPeriodEnd: true },
      });
      for (const subscription of lapsed) {
        const state = accessState(Number(subscription.currentPeriodEnd), startedAt, graceDays);
        if (state === 'BLOCKED') {
          await this.prisma.tenantSubscription.update({
            where: { id: subscription.id },
            data: { status: 'SUSPENDED', suspendedAt: startedAt, updatedAt: startedAt },
          });
          result.suspended++;
        } else if (subscription.status === 'ACTIVE') {
          await this.prisma.tenantSubscription.update({
            where: { id: subscription.id },
            data: { status: 'PAST_DUE', updatedAt: startedAt },
          });
          result.pastDue++;
        }
      }

      // Any payment activates. An invoice that already carries money while its
      // subscription still awaits payment - paid before that rule, or whose
      // activation did not happen - is put into effect here.
      const paidAwaiting = await this.prisma.tenantInvoice.findMany({
        where: {
          tenantBusinessId,
          status: { in: ['PARTIALLY_PAID', 'PAID'] },
          items: { some: { tenantSubscription: { status: 'PENDING_PAYMENT' } } },
        },
        select: { id: true },
      });
      for (const invoice of paidAwaiting) {
        await this.prisma.$transaction((tx) => activateInvoiceSubscriptions(tx, invoice.id, null), {
          timeout: 20000,
        });
        result.activated++;
      }

      const counts = await this.enforceStreams({ tenantBusinessId }, graceDays);
      result.streamsDisabled = counts.disabled;
      result.streamsEnabled = counts.enabled;
      result.streamsBlocked = counts.blocked;
      result.streamsReDisabled = counts.reDisabled;
      result.streamsReEnabled = counts.reEnabled;
      result.failed = counts.failed;
    } catch (error) {
      result.error = errorMessage(error);
      this.logger.error(`Billing job failed for business ${tenantBusinessId}: ${result.error}`);
    } finally {
      result.finishedAt = now();
      this.runningBusinesses.delete(tenantBusinessId);
    }

    await this.prisma.tenantBillingSettings.updateMany({
      where: { tenantBusinessId },
      data: {
        lifecycleLastRunAt: startedAt,
        lifecycleLastResult: result as unknown as Prisma.InputJsonValue,
      },
    });
    if (
      result.pastDue ||
      result.suspended ||
      result.activated ||
      result.streamsDisabled ||
      result.streamsEnabled ||
      result.streamsReDisabled ||
      result.streamsReEnabled ||
      result.failed
    ) {
      this.logger.log(
        `Billing job (${trigger}) for business ${tenantBusinessId}: ${result.pastDue} past due, ` +
          `${result.suspended} suspended, ${result.activated} activated; streams ${result.streamsDisabled} disabled, ` +
          `${result.streamsEnabled} enabled, ${result.streamsReDisabled} re-disabled and ` +
          `${result.streamsReEnabled} re-enabled on the server, ` +
          `${result.failed} failed`,
      );
    }
    return result;
  }

  /** Switches blocked customer streams off, and those billing switched off back on once covered. */
  private async enforceStreams(where: Prisma.TenantStreamWhereInput, graceDays: number): Promise<StreamCounts> {
    const counts: StreamCounts = { disabled: 0, enabled: 0, blocked: 0, reDisabled: 0, reEnabled: 0, failed: 0 };
    const streams = await this.prisma.tenantStream.findMany({
      where: {
        ...where,
        status: { not: 'DELETED' },
        tenantCustomerId: { not: null },
        // Every customer stream, including blocked ones already off here: those
        // are still checked on the server, where they may have been re-enabled.
        tenantFlussonicServer: { status: { not: 'DELETED' } },
      },
      select: {
        id: true,
        tenantCustomerId: true,
        tenantFlussonicServerId: true,
        disabled: true,
        billingDisabledAt: true,
        billingExempt: true,
      },
    });
    if (streams.length === 0) return counts;

    const customerIds = [...new Set(streams.map((stream) => stream.tenantCustomerId as string))];
    const subscriptions = await loadCoverage(this.prisma, { tenantCustomerId: { in: customerIds } });
    const at = now();

    for (const stream of streams) {
      const access = streamAccess(
        stream,
        subscriptions.filter((subscription) => subscription.tenantCustomerId === stream.tenantCustomerId),
        at,
        graceDays,
      );
      try {
        if (access.state === 'BLOCKED') {
          counts.blocked++;
          if (!stream.disabled) {
            await this.streams.setBillingDisabled(stream.id, true);
            counts.disabled++;
          } else if ((await this.sync.ensureRemoteState(stream.id, true)) === 'CORRECTED') {
            // Off here but running on the server: something outside this app
            // switched it back on, so it is switched off again.
            counts.reDisabled++;
          }
        } else if (access.state === 'ACTIVE' || access.state === 'GRACE') {
          if (stream.disabled) {
            // A valid bill means the stream runs, whoever switched it off.
            await this.streams.setBillingDisabled(stream.id, false);
            counts.enabled++;
          } else if ((await this.sync.ensureRemoteState(stream.id, false)) === 'CORRECTED') {
            // On here but off on the server: switched off outside this app.
            counts.reEnabled++;
          }
        }
        // Billed again: the tenant's override is no longer needed, and must not
        // shield the stream the next time the bill lapses.
        if (access.state === 'ACTIVE' && stream.billingExempt) {
          await this.prisma.tenantStream.update({ where: { id: stream.id }, data: { billingExempt: false } });
        }
      } catch (error) {
        counts.failed++;
        this.logger.warn(`Could not apply billing to stream ${stream.id}: ${errorMessage(error)}`);
      }
    }
    return counts;
  }
}
